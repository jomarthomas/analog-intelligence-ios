/**
 * src/lib/skiaOffscreenCompositor.ts
 *
 * Imperative (non-React) Skia offscreen compositor helpers.
 *
 * Verified Skia v2.6 API used here (checked against .d.ts):
 *   • Skia.Surface.Make(w, h)        → SkSurface | null   (CPU raster, no GPU needed)
 *   • surface.getCanvas()            → SkCanvas
 *   • canvas.drawImage(img, x, y)    → void
 *   • canvas.drawRect(rect, paint)   → void
 *   • canvas.drawText(str, x, y, paint, font) → void
 *   • surface.makeImageSnapshot()    → SkImage
 *   • image.encodeToBase64(fmt, q)   → string  (base64, no Uint8Array copy needed)
 *   • Skia.Data.fromURI(uri)         → Promise<SkData>
 *   • Skia.Image.MakeImageFromEncoded(data) → SkImage | null
 *   • Skia.Font(typeface?, size?)    → SkFont
 *   • Skia.Paint()                   → SkPaint
 *   • Skia.Color(colorString)        → SkColor
 *
 * NOTE on Surface.Make vs Surface.MakeOffscreen:
 *   SurfaceFactory.Make  → CPU-backed raster surface (what we want for file baking).
 *   SurfaceFactory.MakeOffscreen → GPU-backed surface (needs a GPU context).
 *   We use Make() because file-baking runs outside of any React render loop and
 *   we cannot guarantee a GPU context is available. The CPU path is always safe.
 *
 * DOES NOT import React hooks (useImage, Canvas, etc.) — fully imperative.
 *
 * Ownership: src/features/gallery + src/lib (Gallery workstream).
 */

import { File, Paths } from 'expo-file-system';
import { Skia, ImageFormat } from '@shopify/react-native-skia';

import type { ExportWatermarkParams } from '@/monetization';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompositorResult = {
  /** file:// URI of the newly written JPEG file. */
  uri: string;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a unique filename under the expo-file-system cache directory. */
function makeTempUri(suffix: string): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0');
  return new File(Paths.cache, `analog_export_${ts}_${rand}_${suffix}.jpg`).uri;
}

/**
 * Load a Skia image from a file:// URI.
 * Returns null if the URI is unresolvable or the image is unsupported.
 */
async function loadSkiaImage(uri: string) {
  const data = await Skia.Data.fromURI(uri);
  return Skia.Image.MakeImageFromEncoded(data);
}

// ---------------------------------------------------------------------------
// Watermark baking
// ---------------------------------------------------------------------------

/**
 * Bake the watermark described by `params` onto `sourceUri` and write a new
 * JPEG file. Returns the new file's URI.
 *
 * Pipeline:
 *   1. Load the source image bytes via Skia.Data.fromURI → MakeImageFromEncoded.
 *   2. Create a CPU-raster surface (Skia.Surface.Make) at the image's pixel size.
 *   3. Draw the decoded image at (0, 0).
 *   4. Draw the main watermark text centered, then the subtitle near the bottom.
 *   5. makeImageSnapshot() → encodeToBase64(JPEG, quality) → write via File.write.
 *
 * @param sourceUri  file:// URI of the (already-clamped) JPEG to annotate.
 * @param params     Watermark descriptor from buildExportWatermarkParams().
 * @param jpegQuality 0–100 JPEG quality passed to encodeToBase64.
 */
export async function bakeWatermarkIntoFile(
  sourceUri: string,
  params: ExportWatermarkParams,
  jpegQuality: number = 85,
): Promise<CompositorResult> {
  // 1. Decode source image.
  const srcImage = await loadSkiaImage(sourceUri);
  if (srcImage === null) {
    throw new Error(`[SkiaCompositor] Failed to decode source image: ${sourceUri}`);
  }

  const w = srcImage.width();
  const h = srcImage.height();

  // 2. Create a CPU raster surface.
  const surface = Skia.Surface.Make(w, h);
  if (surface === null) {
    throw new Error('[SkiaCompositor] Skia.Surface.Make returned null — out of memory?');
  }

  const canvas = surface.getCanvas();

  // 3. Draw the base image.
  canvas.drawImage(srcImage, 0, 0);

  // ---- Watermark paint (semi-transparent white with shadow via a dark second pass) ----
  const mainFontSizePx = Math.round(w * params.fontSizeRatio);
  const subtitleFontSizePx = Math.round(w * params.subtitleFontSizeRatio);

  // Use the default (system) typeface — passing undefined to Skia.Font gives the default.
  const mainFont = Skia.Font(undefined, mainFontSizePx);
  const subtitleFont = Skia.Font(undefined, subtitleFontSizePx);

  // Shadow paint (dark, offset by 2px — use setAlphaf for transparency rather
  // than rgba() strings since CSS rgba parsing is not guaranteed in Skia RN).
  const shadowPaint = Skia.Paint();
  shadowPaint.setColor(Skia.Color('#000000'));
  shadowPaint.setAlphaf(0.8);
  shadowPaint.setAntiAlias(true);

  // Main text paint (white, semi-transparent per params.opacity).
  const textPaint = Skia.Paint();
  textPaint.setColor(Skia.Color('#FFFFFF'));
  textPaint.setAlphaf(params.opacity);
  textPaint.setAntiAlias(true);

  // ---- Main watermark text (centered) ----
  const mainTextBounds = mainFont.measureText(params.text);
  const mainTextWidth = mainTextBounds.width;
  const mainX = (w - mainTextWidth) / 2;
  // Baseline position: vertical center.
  // Skia ascent is negative (above baseline), descent is positive (below).
  // Visual mid of glyphs relative to baseline = (descent + ascent) / 2 (ascent is negative).
  // To center: baseline = h/2 - (ascent + descent)/2.
  const metrics = mainFont.getMetrics();
  const mainY = h / 2 - (metrics.ascent + metrics.descent) / 2;

  // Shadow (offset 2px right and down).
  canvas.drawText(params.text, mainX + 2, mainY + 2, shadowPaint, mainFont);
  // Main text.
  canvas.drawText(params.text, mainX, mainY, textPaint, mainFont);

  // ---- Subtitle text (bottom, horizontally centered) ----
  const subtitleBounds = subtitleFont.measureText(params.subtitleText);
  const subtitleWidth = subtitleBounds.width;
  const subtitleX = (w - subtitleWidth) / 2;
  const subtitleBottomMarginPx = Math.round(h * params.subtitleBottomMarginRatio);
  const subtitleMetrics = subtitleFont.getMetrics();
  // Skia ascent is negative (above baseline), descent is positive (below).
  // We want the descender bottom at (h - margin), so baseline = h - margin - descent.
  const subtitleY = h - subtitleBottomMarginPx - subtitleMetrics.descent;

  const subtitlePaint = Skia.Paint();
  subtitlePaint.setColor(Skia.Color('#FFFFFF'));
  subtitlePaint.setAlphaf(params.opacity * 0.8);
  subtitlePaint.setAntiAlias(true);

  const subtitleShadowPaint = Skia.Paint();
  subtitleShadowPaint.setColor(Skia.Color('#000000'));
  subtitleShadowPaint.setAlphaf(0.8);
  subtitleShadowPaint.setAntiAlias(true);

  canvas.drawText(params.subtitleText, subtitleX + 1, subtitleY + 1, subtitleShadowPaint, subtitleFont);
  canvas.drawText(params.subtitleText, subtitleX, subtitleY, subtitlePaint, subtitleFont);

  // 5. Snapshot → encode → write.
  const snapshot = surface.makeImageSnapshot();
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, jpegQuality);

  const outUri = makeTempUri('wm');
  const file = new File(outUri);
  file.write(base64, { encoding: 'base64' });

  return { uri: outUri };
}

// ---------------------------------------------------------------------------
// Contact-sheet composite
// ---------------------------------------------------------------------------

/** Configuration for the grid layout. */
export type ContactSheetOptions = {
  /** Number of columns. Default: 3. */
  columns?: number;
  /** Padding around the sheet and between thumbnails (px). Default: 16. */
  padding?: number;
  /** Pixel width of each cell. Default: 400. */
  cellWidth?: number;
  /** Pixel height of each cell. Default: 300. */
  cellHeight?: number;
  /** Background colour of the sheet. Default: '#141418' (dark). */
  backgroundColor?: string;
  /** Whether to draw 1-based frame numbers below each thumbnail. Default: true. */
  showFrameNumbers?: boolean;
  /** JPEG quality 0–100. Default: 90. */
  jpegQuality?: number;
};

type NormalisedSheetOptions = Required<ContactSheetOptions>;

function normaliseOptions(opts: ContactSheetOptions): NormalisedSheetOptions {
  return {
    columns: opts.columns ?? 3,
    padding: opts.padding ?? 16,
    cellWidth: opts.cellWidth ?? 400,
    cellHeight: opts.cellHeight ?? 300,
    backgroundColor: opts.backgroundColor ?? '#141418',
    showFrameNumbers: opts.showFrameNumbers ?? true,
    jpegQuality: opts.jpegQuality ?? 90,
  };
}

/**
 * Composite N thumbnail URIs into a grid on an offscreen Skia surface and
 * write the result as a JPEG file. Returns the new file's URI.
 *
 * Pipeline:
 *   1. Determine grid dimensions from opts.columns and the image count.
 *   2. Create a CPU raster surface sized to hold the grid.
 *   3. Fill the background.
 *   4. For each thumbnail URI: load via Skia, draw scaled into its cell rect.
 *   5. Optionally draw 1-based frame numbers.
 *   6. Snapshot → encodeToBase64 → write to cache file.
 *
 * @param thumbnailUris  Ordered list of thumbnail file:// URIs to include.
 * @param opts           Layout options.
 */
export async function buildContactSheet(
  thumbnailUris: string[],
  opts: ContactSheetOptions = {},
): Promise<CompositorResult> {
  if (thumbnailUris.length === 0) {
    throw new Error('[SkiaCompositor] No thumbnails provided for contact sheet.');
  }

  const {
    columns,
    padding,
    cellWidth,
    cellHeight,
    backgroundColor,
    showFrameNumbers,
    jpegQuality,
  } = normaliseOptions(opts);

  const rows = Math.ceil(thumbnailUris.length / columns);

  // Font size for frame numbers (~12 % of cell height, clamped between 14–48 px).
  const labelFontSize = Math.max(14, Math.min(48, Math.round(cellHeight * 0.12)));
  const labelAreaHeight = showFrameNumbers ? labelFontSize + 8 : 0;

  const sheetWidth = padding + columns * (cellWidth + padding);
  const sheetHeight = padding + rows * (cellHeight + labelAreaHeight + padding);

  const surface = Skia.Surface.Make(sheetWidth, sheetHeight);
  if (surface === null) {
    throw new Error('[SkiaCompositor] Skia.Surface.Make returned null for contact sheet.');
  }

  const canvas = surface.getCanvas();

  // Fill background.
  const bgPaint = Skia.Paint();
  bgPaint.setColor(Skia.Color(backgroundColor));
  bgPaint.setAlphaf(1);
  canvas.drawRect(Skia.XYWHRect(0, 0, sheetWidth, sheetHeight), bgPaint);

  // Load images concurrently (Promise.all) then draw sequentially to avoid
  // canvas interleaving issues (canvas itself is synchronous).
  const maybeImages = await Promise.all(
    thumbnailUris.map((uri) => loadSkiaImage(uri)),
  );

  const labelPaint = Skia.Paint();
  labelPaint.setColor(Skia.Color('#AAAAAA'));
  labelPaint.setAlphaf(0.9);
  labelPaint.setAntiAlias(true);
  const labelFont = Skia.Font(undefined, labelFontSize);

  for (let i = 0; i < thumbnailUris.length; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);

    const cellX = padding + col * (cellWidth + padding);
    const cellY = padding + row * (cellHeight + labelAreaHeight + padding);

    const img = maybeImages[i];

    if (img !== null) {
      // Scale image to fill cell (letter-box if needed).
      const imgW = img.width();
      const imgH = img.height();
      const scaleX = cellWidth / imgW;
      const scaleY = cellHeight / imgH;
      const scale = Math.min(scaleX, scaleY);
      const drawW = imgW * scale;
      const drawH = imgH * scale;
      const drawX = cellX + (cellWidth - drawW) / 2;
      const drawY = cellY + (cellHeight - drawH) / 2;

      const src = Skia.XYWHRect(0, 0, imgW, imgH);
      const dest = Skia.XYWHRect(drawX, drawY, drawW, drawH);
      canvas.drawImageRect(img, src, dest, Skia.Paint());
    } else {
      // Draw a placeholder rectangle for missing/failed thumbnails.
      const placeholderPaint = Skia.Paint();
      placeholderPaint.setColor(Skia.Color('#2C2C38'));
      canvas.drawRect(
        Skia.XYWHRect(cellX, cellY, cellWidth, cellHeight),
        placeholderPaint,
      );
    }

    if (showFrameNumbers) {
      const label = `${i + 1}`;
      const labelBounds = labelFont.measureText(label);
      const labelX = cellX + (cellWidth - labelBounds.width) / 2;
      const labelY = cellY + cellHeight + labelFontSize;
      canvas.drawText(label, labelX, labelY, labelPaint, labelFont);
    }
  }

  const snapshot = surface.makeImageSnapshot();
  const base64 = snapshot.encodeToBase64(ImageFormat.JPEG, jpegQuality);

  const outUri = makeTempUri('contact');
  const file = new File(outUri);
  file.write(base64, { encoding: 'base64' });

  return { uri: outUri };
}
