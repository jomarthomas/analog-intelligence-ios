/**
 * src/state/galleryStore.ts
 *
 * Zustand store for the gallery screen.
 *
 * Responsibilities:
 *   • Load and cache all ScannedImages and ScanSessions in memory.
 *   • Expose a filtered/sorted view driven by user preferences.
 *   • Track multi-select state for batch operations.
 *   • Provide mutation helpers that delegate to imageRepository + preferences,
 *     then refresh the in-memory state.
 *
 * Other workstreams (Shell, Insights, Pipeline) should import from this store
 * for reading gallery state, and call the action helpers for mutations.
 *
 * The store is NOT auto-initialised — call `loadGallery()` once at app start
 * (e.g. in the root layout's useEffect).
 */

import { create } from 'zustand';
import {
  getAllImages,
  getAllSessions,
  saveSession,
  deleteImage as repoDeleteImage,
  deleteImages as repoDeleteImages,
  deleteSession as repoDeleteSession,
  updateSession as repoUpdateSession,
  getImagesBySession,
  StorageError,
  generateUUID,
} from '../storage/imageRepository';
import { getPreferences } from '../storage/preferences';
import type {
  GallerySortOrder,
  ScanSession,
  ScannedImage,
  SessionState,
} from '../storage/models';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface GalleryState {
  // --- Data ---
  /** All images across all sessions, unfiltered. */
  allImages: ScannedImage[];
  /** All sessions sorted by most-recently-updated first. */
  allSessions: ScanSession[];

  // --- Derived view ---
  /**
   * The currently displayed image list, after sort/filter is applied.
   * Consumed by the gallery grid component.
   */
  displayedImages: ScannedImage[];

  // --- Session context ---
  /** The active session (used by the scan tab for new captures). */
  currentSessionId: string | null;

  // --- Multi-select ---
  /** IDs currently selected by the user. Empty set = selection mode off. */
  selectedIds: Set<string>;

  // --- Loading state ---
  isLoading: boolean;
  loadError: string | null;

  // --- Actions ---
  loadGallery: () => Promise<void>;
  refreshSession: (sessionId: string) => Promise<void>;

  createSession: (params: {
    name: string;
    filmType?: ScanSession['filmType'];
    filmBrand?: string;
    filmSpeed?: number;
  }) => Promise<ScanSession>;

  updateSession: (
    sessionId: string,
    patch: Partial<
      Pick<
        ScanSession,
        'name' | 'notes' | 'filmType' | 'filmBrand' | 'filmSpeed' | 'sessionState'
      >
    >,
  ) => Promise<void>;

  deleteSession: (sessionId: string) => Promise<void>;
  setCurrentSession: (sessionId: string | null) => void;
  markSessionCompleted: (sessionId: string) => Promise<void>;
  archiveSession: (sessionId: string) => Promise<void>;
  unarchiveSession: (sessionId: string) => Promise<void>;

  deleteImage: (imageId: string) => Promise<void>;
  deleteImages: (imageIds: string[]) => Promise<void>;

  // Selection
  selectImage: (imageId: string) => void;
  deselectImage: (imageId: string) => void;
  toggleImageSelection: (imageId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // Sort / view
  applySortOrder: (order: GallerySortOrder) => void;
}

// ---------------------------------------------------------------------------
// Helper: sort images
// ---------------------------------------------------------------------------

function sortImages(
  images: ScannedImage[],
  order: GallerySortOrder,
  sessions: ScanSession[],
): ScannedImage[] {
  switch (order) {
    case 'newestFirst':
      return [...images].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    case 'oldestFirst':
      return [...images].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    case 'sessionGrouped': {
      // Sort sessions newest-first, then images within session newest-first.
      const sessionOrder = new Map(sessions.map((s, i) => [s.id, i]));
      return [...images].sort((a, b) => {
        const oa = sessionOrder.get(a.sessionId) ?? Number.MAX_SAFE_INTEGER;
        const ob = sessionOrder.get(b.sessionId) ?? Number.MAX_SAFE_INTEGER;
        if (oa !== ob) return oa - ob;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useGalleryStore = create<GalleryState>((set, get) => ({
  allImages: [],
  allSessions: [],
  displayedImages: [],
  currentSessionId: null,
  selectedIds: new Set<string>(),
  isLoading: false,
  loadError: null,

  // -----------------------------------------------------------------------
  // loadGallery
  // -----------------------------------------------------------------------
  loadGallery: async () => {
    set({ isLoading: true, loadError: null });
    try {
      const [images, sessions] = await Promise.all([
        getAllImages(),
        getAllSessions(),
      ]);

      const prefs = getPreferences();
      const displayed = sortImages(images, prefs.sortOrder, sessions);

      // Set current session to most-recent active session (or first session).
      const activeSession =
        sessions.find((s) => s.sessionState === 'active') ?? sessions[0] ?? null;

      set({
        allImages: images,
        allSessions: sessions,
        displayedImages: displayed,
        currentSessionId: activeSession?.id ?? null,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        loadError: err instanceof StorageError ? err.message : 'Failed to load gallery',
      });
    }
  },

  // -----------------------------------------------------------------------
  // refreshSession — reload a single session and its images after mutation
  // -----------------------------------------------------------------------
  refreshSession: async (sessionId: string) => {
    try {
      const [images, sessions] = await Promise.all([
        getImagesBySession(sessionId),
        getAllSessions(),
      ]);
      const { allImages, allSessions } = get();

      // Merge: replace images for this session, keep others.
      const otherImages = allImages.filter((img) => img.sessionId !== sessionId);
      const newAllImages = [...otherImages, ...images];

      // Replace the session in the sessions list.
      const newSessions = allSessions.map(
        (s) => sessions.find((ns) => ns.id === s.id) ?? s,
      );

      const prefs = getPreferences();
      const displayed = sortImages(newAllImages, prefs.sortOrder, newSessions);

      set({
        allImages: newAllImages,
        allSessions: newSessions,
        displayedImages: displayed,
      });
    } catch {
      // Silently fall back to full reload on partial-refresh failure.
      await get().loadGallery();
    }
  },

  // -----------------------------------------------------------------------
  // createSession
  // -----------------------------------------------------------------------
  createSession: async (params) => {
    const now = nowIso();
    const session: ScanSession = {
      id: generateUUID(),
      createdAt: now,
      updatedAt: now,
      name: params.name,
      filmType: params.filmType,
      filmBrand: params.filmBrand,
      filmSpeed: params.filmSpeed,
      sessionState: 'active',
      imageIds: [],
    };

    await saveSession(session);

    set((state) => ({
      allSessions: [session, ...state.allSessions],
      currentSessionId: session.id,
    }));

    return session;
  },

  // -----------------------------------------------------------------------
  // updateSession
  // -----------------------------------------------------------------------
  updateSession: async (sessionId, patch) => {
    const updated = await repoUpdateSession(sessionId, patch);
    set((state) => ({
      allSessions: state.allSessions.map((s) =>
        s.id === sessionId ? updated : s,
      ),
    }));
  },

  // -----------------------------------------------------------------------
  // deleteSession
  // -----------------------------------------------------------------------
  deleteSession: async (sessionId) => {
    await repoDeleteSession(sessionId);
    set((state) => {
      const newSessions = state.allSessions.filter((s) => s.id !== sessionId);
      const newImages = state.allImages.filter((img) => img.sessionId !== sessionId);
      const newSelectedIds = new Set(
        [...state.selectedIds].filter(
          (id) => !state.allImages.find((img) => img.id === id && img.sessionId === sessionId),
        ),
      );

      const prefs = getPreferences();
      const displayed = sortImages(newImages, prefs.sortOrder, newSessions);

      return {
        allSessions: newSessions,
        allImages: newImages,
        displayedImages: displayed,
        selectedIds: newSelectedIds,
        currentSessionId:
          state.currentSessionId === sessionId
            ? (newSessions.find((s) => s.sessionState === 'active')?.id ?? newSessions[0]?.id ?? null)
            : state.currentSessionId,
      };
    });
  },

  // -----------------------------------------------------------------------
  // setCurrentSession
  // -----------------------------------------------------------------------
  setCurrentSession: (sessionId) => {
    set({ currentSessionId: sessionId });
  },

  // -----------------------------------------------------------------------
  // markSessionCompleted
  // -----------------------------------------------------------------------
  markSessionCompleted: async (sessionId) => {
    await repoUpdateSession(sessionId, { sessionState: 'completed' });
    set((state) => ({
      allSessions: state.allSessions.map((s) =>
        s.id === sessionId ? { ...s, sessionState: 'completed' as SessionState, updatedAt: nowIso() } : s,
      ),
    }));
  },

  // -----------------------------------------------------------------------
  // archiveSession
  // -----------------------------------------------------------------------
  archiveSession: async (sessionId) => {
    await repoUpdateSession(sessionId, { sessionState: 'archived' });
    set((state) => ({
      allSessions: state.allSessions.map((s) =>
        s.id === sessionId ? { ...s, sessionState: 'archived' as SessionState, updatedAt: nowIso() } : s,
      ),
    }));
  },

  // -----------------------------------------------------------------------
  // unarchiveSession
  // -----------------------------------------------------------------------
  unarchiveSession: async (sessionId) => {
    await repoUpdateSession(sessionId, { sessionState: 'active' });
    set((state) => ({
      allSessions: state.allSessions.map((s) =>
        s.id === sessionId ? { ...s, sessionState: 'active' as SessionState, updatedAt: nowIso() } : s,
      ),
    }));
  },

  // -----------------------------------------------------------------------
  // deleteImage
  // -----------------------------------------------------------------------
  deleteImage: async (imageId) => {
    const imageToDelete = get().allImages.find((img) => img.id === imageId);
    await repoDeleteImage(imageId);

    set((state) => {
      const newImages = state.allImages.filter((img) => img.id !== imageId);
      const newSelectedIds = new Set([...state.selectedIds].filter((id) => id !== imageId));

      // Update session's imageIds in the local state too.
      const newSessions = imageToDelete
        ? state.allSessions.map((s) =>
            s.id === imageToDelete.sessionId
              ? { ...s, imageIds: s.imageIds.filter((id) => id !== imageId), updatedAt: nowIso() }
              : s,
          )
        : state.allSessions;

      const prefs = getPreferences();
      const displayed = sortImages(newImages, prefs.sortOrder, newSessions);

      return {
        allImages: newImages,
        displayedImages: displayed,
        allSessions: newSessions,
        selectedIds: newSelectedIds,
      };
    });
  },

  // -----------------------------------------------------------------------
  // deleteImages
  // -----------------------------------------------------------------------
  deleteImages: async (imageIds) => {
    await repoDeleteImages(imageIds);

    set((state) => {
      const deletedSet = new Set(imageIds);
      const newImages = state.allImages.filter((img) => !deletedSet.has(img.id));
      const newSelectedIds = new Set([...state.selectedIds].filter((id) => !deletedSet.has(id)));

      // Remove deleted IDs from each session's imageIds.
      const newSessions = state.allSessions.map((s) => ({
        ...s,
        imageIds: s.imageIds.filter((id) => !deletedSet.has(id)),
        updatedAt: s.imageIds.some((id) => deletedSet.has(id)) ? nowIso() : s.updatedAt,
      }));

      const prefs = getPreferences();
      const displayed = sortImages(newImages, prefs.sortOrder, newSessions);

      return {
        allImages: newImages,
        displayedImages: displayed,
        allSessions: newSessions,
        selectedIds: newSelectedIds,
      };
    });
  },

  // -----------------------------------------------------------------------
  // Selection
  // -----------------------------------------------------------------------
  selectImage: (imageId) => {
    set((state) => ({
      selectedIds: new Set([...state.selectedIds, imageId]),
    }));
  },

  deselectImage: (imageId) => {
    set((state) => {
      const next = new Set(state.selectedIds);
      next.delete(imageId);
      return { selectedIds: next };
    });
  },

  toggleImageSelection: (imageId) => {
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return { selectedIds: next };
    });
  },

  selectAll: () => {
    set((state) => ({
      selectedIds: new Set(state.displayedImages.map((img) => img.id)),
    }));
  },

  clearSelection: () => {
    set({ selectedIds: new Set<string>() });
  },

  // -----------------------------------------------------------------------
  // applySortOrder — re-sort without a DB round-trip
  // -----------------------------------------------------------------------
  applySortOrder: (order) => {
    set((state) => ({
      displayedImages: sortImages(state.allImages, order, state.allSessions),
    }));
  },
}));

// ---------------------------------------------------------------------------
// Selector helpers (stable references, avoids re-renders)
// ---------------------------------------------------------------------------

/** Returns images for a specific session from the current store state. */
export function selectImagesBySession(
  state: GalleryState,
  sessionId: string,
): ScannedImage[] {
  return state.allImages.filter((img) => img.sessionId === sessionId);
}

/** Returns the ScanSession object for the current session ID. */
export function selectCurrentSession(state: GalleryState): ScanSession | null {
  if (!state.currentSessionId) return null;
  return state.allSessions.find((s) => s.id === state.currentSessionId) ?? null;
}

/** Returns true if any images are selected. */
export function selectIsInSelectionMode(state: GalleryState): boolean {
  return state.selectedIds.size > 0;
}

/** Returns the selected ScannedImage objects. */
export function selectSelectedImages(state: GalleryState): ScannedImage[] {
  return state.allImages.filter((img) => state.selectedIds.has(img.id));
}
