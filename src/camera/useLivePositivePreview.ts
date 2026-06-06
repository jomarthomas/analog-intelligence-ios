/**
 * src/camera/useLivePositivePreview.ts
 *
 * Snapshot-driven engine for the LIVE INVERTED PREVIEW.
 *
 * WHY A SNAPSHOT LOOP (and not a frame processor):
 *   react-native-vision-camera v5.0.10 (Nitro) REMOVED the Skia frame processor
 *   (`useSkiaFrameProcessor` no longer exists), so we cannot draw a colour
 *   filter straight onto the live preview surface. Instead we poll the preview:
 *
 *     takeSnapshot()                       (CameraRef → nitro-image `Image`)
 *       → image.saveToTemporaryFileAsync   (encode to a temp JPEG on disk)
 *       → Skia.Data.fromURI(file://…)      (read the bytes into Skia)
 *       → Skia.Image.MakeImageFromEncoded  (decode into an SkImage)
 *       → setState(skImage)                (overlay re-draws it, inverted)
 *
 *   The overlay (`LivePositiveOverlay`) then draws that SkImage through an
 *   inverting `<ColorMatrix>`, covering the real preview so the user sees a
 *   rough POSITIVE while framing. ~4-8 fps is plenty for alignment.
 *
 * CRITICAL — this hook adds NO camera output. It only calls the imperative
 * `takeSnapshot()` on the existing `CameraRef`, so the `<Camera outputs={…}>`
 * array is untouched (a regression there black-screens the camera).
 *
 * ROBUSTNESS (every requirement from the brief):
 *   • Guarded interval (`INTERVAL_MS`); a fresh tick never starts while the
 *     previous snapshot is still in flight (re-entrancy guard).
 *   • Runs ONLY while `enabled` (active + ready + not capturing + toggle on).
 *   • Pauses during a real photo capture (caller passes `isCapturing` into
 *     `enabled`) so we never contend with the shutter.
 *   • Every snapshot / file / Skia call is wrapped in try/catch.
 *   • Disposes the previous SkImage when a new one replaces it, disposes the
 *     transient nitro `Image`, and deletes the temp file — no leaks.
 *   • Stops + cleans up on unmount / blur (when `enabled` goes false).
 *   • Fails gracefully: after a few consecutive errors it gives up (sets
 *     `failed`), the overlay hides, and we log once in __DEV__ — never crash,
 *     never freeze the camera.
 *
 * @platform Native only. `takeSnapshot()` is a no-op shape on web; the try/catch
 * + failure path means the overlay simply stays hidden there.
 */

import { useEffect, useRef, useState } from 'react';
import { Skia, type SkImage } from '@shopify/react-native-skia';
import type { CameraRef } from 'react-native-vision-camera';
import type { Image as NitroImage } from 'react-native-nitro-image';
import { Directory, File, Paths } from 'expo-file-system';

/**
 * Polling cadence for the preview snapshot. ~6 fps — a balance between a
 * responsive "looks like a positive" preview and leaving the photo/preview
 * pipeline alone. (Lower = smoother but heavier; higher = lighter but choppier.)
 */
const INTERVAL_MS = 160;

/** JPEG quality for the transient snapshot. Lower = faster encode/decode; the
 *  preview is approximate so we don't need high fidelity here. */
const SNAPSHOT_QUALITY = 70;

/** Give up after this many consecutive failures (e.g. snapshot unsupported). */
const MAX_CONSECUTIVE_ERRORS = 3;

/** Sub-directory of the cache for the throwaway preview snapshots. */
const PREVIEW_DIRNAME = 'positive-preview';

export interface LivePositivePreview {
  /**
   * The most recent decoded preview frame, or `null` when none is available yet
   * (warming up, paused, or failed). The overlay renders it through the invert
   * colour matrix. Ownership stays with this hook — do NOT dispose it.
   */
  image: SkImage | null;
  /**
   * `true` once `takeSnapshot` has been determined unusable on this device
   * (too many consecutive errors). The caller should hide the overlay and fall
   * back to the normal live preview. Never throws.
   */
  failed: boolean;
}

/**
 * Drive the live positive preview while `enabled`.
 *
 * @param cameraRef The same `CameraRef` the `<Camera>` is mounted with. We only
 *                  call its imperative `takeSnapshot()` — we never touch outputs.
 * @param enabled   Master switch: the loop runs ONLY when this is true. Pass
 *                  `isActive && sessionReady && !isCapturing && positiveToggleOn`.
 *                  When it flips false the loop stops and resources are freed.
 */
export function useLivePositivePreview(
  cameraRef: React.RefObject<CameraRef | null>,
  enabled: boolean,
): LivePositivePreview {
  const [image, setImage] = useState<SkImage | null>(null);
  const [failed, setFailed] = useState(false);

  // Refs the loop reads/writes without forcing re-renders.
  const inFlightRef = useRef(false); // a snapshot is currently being taken
  const errorCountRef = useRef(0); // consecutive failures
  // Keep a handle to the currently-displayed SkImage so we can dispose the
  // PREVIOUS one when a new one arrives (the displayed frame has long been
  // committed by the next ~160ms tick) and the LAST one on teardown.
  const currentImageRef = useRef<SkImage | null>(null);

  useEffect(() => {
    if (!enabled || failed) {
      return;
    }

    let cancelled = false;
    const dir = ensurePreviewDir();

    const tick = async () => {
      // Re-entrancy guard: skip if the previous snapshot hasn't finished, or if
      // we've been torn down between scheduling and running.
      if (cancelled || inFlightRef.current) return;
      const camera = cameraRef.current;
      if (camera == null) return;

      inFlightRef.current = true;
      let snapshot: NitroImage | undefined;
      let tempPath: string | undefined;
      try {
        // 1. Grab the current preview contents as a nitro Image.
        snapshot = await camera.takeSnapshot();
        if (cancelled) return;

        // 2. Encode to a temp JPEG on disk. saveToTemporaryFileAsync returns a
        //    bare filesystem path (no file://), per the nitro-image contract.
        tempPath = await snapshot.saveToTemporaryFileAsync('jpg', SNAPSHOT_QUALITY);
        if (cancelled) return;

        // 3. Read the encoded bytes into Skia and decode to an SkImage.
        const data = await Skia.Data.fromURI(toFileUri(tempPath));
        if (cancelled) {
          // Component went away mid-load; nothing to display.
          return;
        }
        const decoded = Skia.Image.MakeImageFromEncoded(data);
        if (decoded == null) {
          // Unrecognised/invalid bytes — count as a soft error and bail.
          throw new Error('Skia could not decode the snapshot');
        }

        // 4. Swap it in. Dispose the now-stale previous frame (it has already
        //    been committed by React many ms ago), then publish the new one.
        const previous = currentImageRef.current;
        currentImageRef.current = decoded;
        setImage(decoded);
        disposeImage(previous);

        // A good frame resets the failure counter.
        errorCountRef.current = 0;
      } catch (err) {
        // Dispose anything we created on the failing path so we never leak.
        errorCountRef.current += 1;
        if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
          if (__DEV__) {
            console.warn(
              '[useLivePositivePreview] takeSnapshot unusable — hiding positive preview overlay:',
              err,
            );
          }
          if (!cancelled) setFailed(true);
        }
      } finally {
        // Always release the transient native image + temp file.
        disposeNitroImage(snapshot);
        if (tempPath != null) safeDeleteFile(dir, tempPath);
        inFlightRef.current = false;
      }
    };

    // Kick off immediately, then on a fixed cadence. The re-entrancy guard
    // inside `tick` means a slow snapshot simply skips overlapping ticks.
    void tick();
    const handle = setInterval(() => {
      void tick();
    }, INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
      // Drop the displayed image and free the last native frame.
      const last = currentImageRef.current;
      currentImageRef.current = null;
      setImage(null);
      disposeImage(last);
    };
  }, [enabled, failed, cameraRef]);

  return { image, failed };
}

// ---------------------------------------------------------------------------
// Helpers — all defensive, never throw out to the loop.
// ---------------------------------------------------------------------------

/** Dispose a Skia image, swallowing any double-dispose / native errors. */
function disposeImage(img: SkImage | null | undefined): void {
  if (img == null) return;
  try {
    img.dispose();
  } catch {
    // Already disposed or backend gone — ignore.
  }
}

/** Dispose a nitro Image (HybridObjects are disposable), swallowing errors. */
function disposeNitroImage(img: NitroImage | undefined): void {
  if (img == null) return;
  try {
    // Nitro HybridObjects expose dispose(); guard in case the shape differs.
    (img as unknown as { dispose?: () => void }).dispose?.();
  } catch {
    // Ignore — the object will be GC'd by the native runtime regardless.
  }
}

/** Ensure (and return) the cache/positive-preview scratch directory. */
function ensurePreviewDir(): Directory {
  const dir = new Directory(Paths.cache, PREVIEW_DIRNAME);
  try {
    if (!dir.exists) dir.create({ intermediates: true });
  } catch {
    // If creation fails we still return the handle; deletes below are guarded.
  }
  return dir;
}

/** Best-effort delete of a transient snapshot file (path may be bare or file://). */
function safeDeleteFile(_dir: Directory, path: string): void {
  try {
    const file = new File(toFileUri(path));
    if (file.exists) file.delete();
  } catch {
    // Temp file cleanup is best-effort; the OS clears the cache dir anyway.
  }
}

/** Convert a bare filesystem path to a `file://` URI (idempotent). */
function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}
