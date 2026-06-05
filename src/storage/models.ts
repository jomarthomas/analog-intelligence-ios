/**
 * src/storage/models.ts
 *
 * SHARED CONTRACT — other workstreams import from here.
 * Additive changes only. Coordinate breaking changes with the orchestrator.
 *
 * Ported semantics from:
 *   legacy-ios/Storage/ScannedImage.swift
 *   legacy-ios/Storage/ScanSession.swift
 *   legacy-ios/Processing/Pipeline/UserAdjustments.swift
 *
 * ProcessParams is imported from the native module contract.
 * If the module is not available, a local mirror is used and reconciliation
 * is flagged with a TODO.
 */

// ---------------------------------------------------------------------------
// ProcessParams — import from the native module contract when available.
// ---------------------------------------------------------------------------

// TODO: unify with modules/ai-image-processing/src/AiImageProcessing.types.ts
// once the Pipeline workstream wires the types through src/processing/types.ts.
// This is a faithful mirror of the ProcessParams defined in that module.
export type { ProcessParams } from '../../modules/ai-image-processing/src/AiImageProcessing.types';

// ---------------------------------------------------------------------------
// Supporting enumerations
// ---------------------------------------------------------------------------

/** Film type, matching legacy FilmType enum. */
export type FilmType =
  | 'colorNegative'
  | 'colorSlide'
  | 'blackAndWhite'
  | 'infrared'
  | 'unknown';

/** Capture/image-file format. */
export type ImageFormat = 'heic' | 'jpeg' | 'raw' | 'png';

/** White-balance lock state at capture time. */
export type WhiteBalanceMode = 'auto' | 'locked' | 'manual';

/** Session lifecycle state. */
export type SessionState = 'active' | 'completed' | 'archived';

/** Default export format from the preferences layer. */
export type ExportFormat = 'jpeg' | 'png' | 'heic' | 'tiff';

/** Gallery display sort order. */
export type GallerySortOrder = 'newestFirst' | 'oldestFirst' | 'sessionGrouped';

/** Watermark placement for free-tier exports. */
export type WatermarkPosition =
  | 'topLeft'
  | 'topRight'
  | 'bottomLeft'
  | 'bottomRight'
  | 'center';

/** App colour theme. */
export type AppTheme = 'light' | 'dark' | 'system';

/** Export resolution tier (maps to Pro/free gating). */
export type ExportResolution = 'free' | 'full' | 'thumbnail';

/** How the image was exported. */
export type ExportType = 'photos' | 'shareSheet' | 'contactSheet' | 'batch';

// ---------------------------------------------------------------------------
// Crop rectangle (JSON-safe replacement for CGRect)
// ---------------------------------------------------------------------------

/**
 * JSON-serialisable crop rectangle stored in SQLite as a JSON column.
 * Mirrors legacy CodableRect.
 */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------
// Exposure / camera metrics captured at scan time
// ---------------------------------------------------------------------------

/**
 * Camera settings snapshot recorded when the negative was captured.
 * Mirrors legacy ImageMetadata.
 *
 * Stored as a JSON column on the `images` SQLite table so new optional
 * fields can be added without schema migrations.
 */
export interface CaptureMetadata {
  /** Exposure time in seconds, e.g. 1/250 → 0.004. */
  exposureTime?: number;
  /** ISO sensitivity. */
  iso?: number;
  /** Focal length in mm. */
  focalLength?: number;
  /** Aperture (f-number). */
  aperture?: number;
  /** White-balance mode used. */
  whiteBalance: WhiteBalanceMode;
  /** Original capture format. */
  format: ImageFormat;
  /** ICC colour-space name, e.g. "sRGB". */
  colorSpace?: string;
  /** Bit depth per channel. */
  bitDepth?: number;
  /** Native pixel width of the original capture. */
  originalWidth?: number;
  /** Native pixel height of the original capture. */
  originalHeight?: number;
  /** Whether focus was locked at capture. */
  focusLocked: boolean;
  /** Whether exposure was locked at capture. */
  exposureLocked: boolean;
  /** Whether white-balance was locked at capture. */
  whiteBalanceLocked: boolean;
  /**
   * Orange-mask channel ratio sampled from the darkest region of the frame.
   * Used by OrangeMaskEstimator (legacy) to seed the subtraction coefficients.
   */
  orangeMaskValue?: number;
}

// ---------------------------------------------------------------------------
// Exposure quality metrics (placeholder for Insights / histogram analysis)
// ---------------------------------------------------------------------------

/**
 * Per-image exposure quality metrics.
 * Populated after histogram analysis; all fields optional so the record can be
 * stored before analysis completes.
 *
 * The Insights agent consumes this via src/insights/*.
 */
export interface ExposureMetrics {
  /** Mean luminance in the range 0–255. */
  meanLuminance?: number;
  /** Percentage of pixels clipped into shadows (0–100). */
  shadowClipPct?: number;
  /** Percentage of pixels clipped into highlights (0–100). */
  highlightClipPct?: number;
  /** Overall quality score 0–1 (1 = perfectly exposed). */
  qualityScore?: number;
  /** Histogram JSON blob — 256-bin arrays for r / g / b / luma. */
  histogramJson?: string;
}

// ---------------------------------------------------------------------------
// Export record
// ---------------------------------------------------------------------------

/**
 * One entry in the audit trail of exports for an image.
 * Stored as a JSON array in the `images` SQLite table.
 */
export interface ExportRecord {
  id: string;
  exportDate: string; // ISO-8601
  exportType: ExportType;
  resolution: ExportResolution;
  destination: string;
}

// ---------------------------------------------------------------------------
// ScannedImage
// ---------------------------------------------------------------------------

/**
 * Represents one individual scanned negative frame.
 *
 * IDs are UUID strings (matches SQLite TEXT PRIMARY KEY convention and
 * avoids native UUID bridging issues).
 *
 * URI fields are `file://` URIs managed by expo-file-system.
 */
export interface ScannedImage {
  /** Stable UUID string, e.g. "3F2504E0-4F89-11D3-9A0C-0305E82C3301". */
  id: string;
  /** The session this image belongs to. */
  sessionId: string;
  /** ISO-8601 timestamp of the original capture. */
  createdAt: string;
  /** ISO-8601 timestamp of last metadata/adjustment update. */
  updatedAt: string;

  // --- URI bundle ---
  /** file:// URI of the original raw/HEIC/JPEG capture in Documents/originals/. */
  originalUri: string;
  /**
   * file:// URI of the processed positive in Documents/processed/.
   * Undefined until the pipeline has completed for this frame.
   */
  processedUri?: string;
  /**
   * file:// URI of the 200 px thumbnail in Caches/thumbnails/.
   * Undefined until generated.
   */
  thumbnailUri?: string;

  // --- ProcessParams snapshot ---
  /**
   * The ProcessParams that were applied to produce the current processedUri.
   * Stored so the adjust screen can restore slider state and the Pipeline can
   * re-process with updated params without re-capturing.
   *
   * Mirrors legacy ImageAdjustments — the "5 core sliders + AI flags".
   */
  processParams?: ProcessParamsSnapshot;

  // --- Capture metadata ---
  captureMetadata: CaptureMetadata;

  /**
   * Optional free-text note for this individual frame (e.g. subject, location,
   * "double exposure"). Added additively for the per-frame metadata feature;
   * shown/edited in the gallery detail view and included in sidecar exports.
   */
  frameNote?: string;

  // --- Derived flags ---
  /** Whether the processing pipeline has run and produced a processedUri. */
  isProcessed: boolean;
  /** true when the capture was DNG/RAW. */
  isRaw: boolean;

  // --- Pro status at capture time ---
  /**
   * Whether the user had Pro at the time of capture.
   * Determines maximum export resolution and watermark suppression
   * for this image going forward, even if the subscription lapses.
   */
  wasProAtCapture: boolean;

  // --- Exposure metrics (Insights) ---
  exposureMetrics?: ExposureMetrics;

  // --- Export audit ---
  exportHistory: ExportRecord[];
}

// ---------------------------------------------------------------------------
// ProcessParams snapshot stored per-image
// ---------------------------------------------------------------------------

/**
 * Denormalized copy of ProcessParams + legacy "manual adjustments" fields,
 * stored per image so the Pipeline agent can re-run and the adjust screen
 * can restore state.
 *
 * ProcessParams from the native module is the primary shape; we extend it
 * with crop/rotation which are handled at the TS layer, not in the native
 * pipeline.
 *
 * TODO: consolidate with ProcessParams from modules/ai-image-processing once
 * the Pipeline workstream publishes src/processing/types.ts.
 */
export interface ProcessParamsSnapshot {
  /** EV adjustment −2.0…+2.0. */
  exposure: number;
  /** Warmth −1.0…+1.0. */
  warmth: number;
  /** Contrast −1.0…+1.0. */
  contrast: number;
  /** Film mode. */
  mode: 'color' | 'bw' | 'slide';
  /** Whether orange-mask removal was applied. */
  removeOrangeMask: boolean;
  /** Sharpening 0.0…1.0. */
  sharpen: number;
  /** AI colour-reconstruction flag (Pro feature hook). */
  aiColor: boolean;
  /** AI dust-removal flag (Pro feature hook). */
  aiDustRemoval: boolean;
  // Optional fine adjustments
  saturation?: number;
  highlights?: number;
  shadows?: number;
  vibrance?: number;
  // Crop & rotation (TS-layer only, not forwarded to native pipeline)
  cropRect?: CropRect;
  rotationDegrees?: number;
  /** Native film-colour LUT id (e.g. 'frontier'); persisted so re-adjust keeps the look. */
  lut?: string;
}

/** Default (identity) process params for a new colour-negative frame. */
export const DEFAULT_PROCESS_PARAMS: ProcessParamsSnapshot = {
  exposure: 0,
  warmth: 0,
  contrast: 0,
  mode: 'color',
  removeOrangeMask: true,
  sharpen: 0.5,
  aiColor: false,
  aiDustRemoval: false,
};

// ---------------------------------------------------------------------------
// ScanSession
// ---------------------------------------------------------------------------

/**
 * A batch scanning session — typically one roll of film.
 *
 * Mirrors legacy ScanSession model. The imageIds array is the canonical
 * ordered list of frames in this roll; individual images also store a
 * `sessionId` back-reference for FK consistency in SQLite.
 */
export interface ScanSession {
  /** Stable UUID string. */
  id: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** ISO-8601 last-modified timestamp. */
  updatedAt: string;

  // --- Session metadata ---
  /** User-facing name, e.g. "Portugal 2026". */
  name: string;
  /** Optional notes field. */
  notes?: string;

  // --- Film metadata ---
  filmType?: FilmType;
  filmBrand?: string;
  /** ISO speed (box speed), e.g. 400. */
  filmSpeed?: number;

  // --- Extended roll metadata (added additively for roll-organization) ---
  /**
   * Exposure index the roll was actually shot/rated at, when it differs from
   * the box speed (e.g. push/pull processing — box 400 shot at EI 800).
   * Undefined ⇒ shot at box speed.
   */
  exposureIndex?: number;
  /** Camera body used for the roll, e.g. "Nikon FM2". */
  camera?: string;
  /** Lens used for the roll, e.g. "50mm f/1.8". */
  lens?: string;
  /**
   * Date the roll was shot (ISO-8601). Distinct from `createdAt`, which is
   * when the roll was scanned into the app.
   */
  shotDate?: string;

  // --- State ---
  sessionState: SessionState;

  // --- Image ordering ---
  /**
   * Ordered list of ScannedImage IDs belonging to this session.
   * Stored as a JSON-encoded TEXT column in SQLite.
   */
  imageIds: string[];
}

// ---------------------------------------------------------------------------
// Storage statistics (used by the settings / maintenance screens)
// ---------------------------------------------------------------------------

export interface StorageStats {
  /** Total bytes used across originals + processed + thumbnails dirs. */
  totalBytes: number;
  /** Human-readable, e.g. "142 MB". */
  formattedSize: string;
  /** Total number of images across all sessions. */
  totalImages: number;
  /** Number of images that have been processed. */
  processedImages: number;
  /** Number of images not yet processed. */
  unprocessedImages: number;
}

export interface SessionStats {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  archivedSessions: number;
}

// ---------------------------------------------------------------------------
// Metadata sidecar (export) — JSON/CSV companion files written next to exports
// ---------------------------------------------------------------------------

/**
 * Schema version for the JSON sidecar so future readers can migrate.
 * Bump when the sidecar shape changes in a breaking way.
 */
export const METADATA_SIDECAR_VERSION = 1 as const;

/**
 * Per-frame metadata block written into a sidecar.
 *
 * This is a flattened, export-friendly projection of `ScannedImage` (the
 * fields a photographer / cataloguing tool cares about) — NOT the full
 * persistence model. Kept JSON-serialisable and stable.
 */
export interface FrameMetadataSidecar {
  /** ScannedImage UUID. */
  id: string;
  /** 1-based position of the frame within the roll, if known. */
  frameNumber?: number;
  /** ISO-8601 capture/scan timestamp. */
  createdAt: string;
  /** Free-text per-frame note. */
  note?: string;
  /** Exposure time in seconds (e.g. 0.004 for 1/250). */
  exposureTime?: number;
  /** ISO sensitivity recorded at capture. */
  iso?: number;
  /** Focal length in mm. */
  focalLength?: number;
  /** Aperture (f-number). */
  aperture?: number;
  /** Original capture format (heic/jpeg/raw/png). */
  format: ImageFormat;
  /** Whether the processed positive has been rendered. */
  isProcessed: boolean;
  /** Whether the capture was RAW/DNG. */
  isRaw: boolean;
}

/**
 * Roll-level metadata block written into a sidecar — a projection of the
 * `ScanSession` film-metadata fields.
 */
export interface RollMetadataSidecar {
  /** ScanSession UUID. */
  id: string;
  /** Roll name. */
  name: string;
  /** Optional roll notes. */
  notes?: string;
  filmType?: FilmType;
  /** Film brand / stock, e.g. "Kodak Portra". */
  filmBrand?: string;
  /** Box speed (ISO). */
  filmSpeed?: number;
  /** Shot exposure index, when different from box speed. */
  exposureIndex?: number;
  camera?: string;
  lens?: string;
  /** ISO-8601 date the roll was shot. */
  shotDate?: string;
  /** ISO-8601 date the roll was created (scanned) in-app. */
  createdAt: string;
  /** Number of frames in the roll. */
  frameCount: number;
}

/**
 * Top-level JSON sidecar document. Written either:
 *   • per-frame  → a single `frame` alongside one exported image, or
 *   • per-roll   → the `roll` plus every `frames[]` entry (roll manifest).
 */
export interface MetadataSidecar {
  /** Schema version (METADATA_SIDECAR_VERSION). */
  schemaVersion: typeof METADATA_SIDECAR_VERSION;
  /** App + sidecar generator identifier. */
  generator: string;
  /** ISO-8601 timestamp the sidecar was generated. */
  generatedAt: string;
  /** Roll-level metadata (present for roll manifests). */
  roll?: RollMetadataSidecar;
  /** Single-frame metadata (present for per-image sidecars). */
  frame?: FrameMetadataSidecar;
  /** All frames in the roll (present for roll manifests). */
  frames?: FrameMetadataSidecar[];
}
