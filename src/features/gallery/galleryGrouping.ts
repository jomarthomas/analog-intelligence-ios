/**
 * src/features/gallery/galleryGrouping.ts
 *
 * Pure helpers that turn the flat gallery image list into roll-grouped
 * sections for the SectionList-backed "group by roll" view.
 *
 * The gallery store already exposes `displayedImages` sorted by the active
 * GallerySortOrder (including `'sessionGrouped'`), plus `allSessions`. This
 * module derives section structure from those *without* touching the store, so
 * the grouped view and the flat grid share one source of truth.
 */

import type { ScanSession, ScannedImage } from '@/storage';

/** One roll section: its session (or undefined for orphans) + its frames. */
export interface RollSection {
  /** Stable key for the SectionList (session id, or a synthetic orphan key). */
  key: string;
  /** The owning session, or undefined when the frame has no matching session. */
  session?: ScanSession;
  /** Frames belonging to this roll, in display order. */
  data: ScannedImage[];
}

/**
 * Group images into roll sections.
 *
 * Ordering rules:
 *   • Sections follow the order sessions first appear in `images` — because
 *     `displayedImages` is already sorted (newest-first or sessionGrouped),
 *     this keeps the grouped view consistent with the chosen sort order.
 *   • Frames within a section preserve their order in `images`.
 *   • Frames whose sessionId matches no known session are collected into a
 *     single trailing "Unsorted" section (session undefined).
 *
 * @param images   The already-sorted/filtered image list (store.displayedImages).
 * @param sessions All known sessions (store.allSessions).
 */
export function groupImagesByRoll(
  images: ScannedImage[],
  sessions: ScanSession[],
): RollSection[] {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));

  // Preserve first-seen session order from the (pre-sorted) image list.
  const order: string[] = [];
  const buckets = new Map<string, ScannedImage[]>();
  const ORPHAN_KEY = '__orphan__';

  for (const image of images) {
    const known = sessionById.has(image.sessionId);
    const key = known ? image.sessionId : ORPHAN_KEY;
    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = [];
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.push(image);
  }

  return order.map((key) => ({
    key,
    session: key === ORPHAN_KEY ? undefined : sessionById.get(key),
    data: buckets.get(key) ?? [],
  }));
}

/**
 * Human-readable subtitle for a roll section header, assembled from the
 * available film-metadata fields. Returns '' when nothing is set.
 *
 * Example: "Kodak Portra 400 · EI 800 · Nikon FM2"
 */
export function describeRoll(session: ScanSession | undefined): string {
  if (session === undefined) return '';
  const parts: string[] = [];

  const stock = [session.filmBrand, session.filmSpeed].filter(Boolean).join(' ');
  if (stock.length > 0) parts.push(stock);

  if (
    session.exposureIndex !== undefined &&
    session.exposureIndex !== session.filmSpeed
  ) {
    parts.push(`EI ${session.exposureIndex}`);
  }
  if (session.camera) parts.push(session.camera);
  if (session.lens) parts.push(session.lens);

  return parts.join(' · ');
}

/** Format an ISO date for header display (locale short date). Empty on failure. */
export function formatRollDate(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
