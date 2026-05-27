/**
 * src/ai/modelManager.ts
 *
 * Interface to load, unload, and check availability of on-device AI models.
 *
 * ─── CURRENT STATUS: SCAFFOLD / PLACEHOLDER ────────────────────────────────
 * No real model files are bundled. Every `checkAvailability` call returns
 * `{ isAvailable: false }`. `loadModel` and `unloadModel` are no-ops.
 * The scaffold is structured so that wiring a real native hook requires
 * changes only inside this file — the public API surface is stable.
 *
 * ─── INTEGRATION BOUNDARY (future real model) ──────────────────────────────
 * To wire an actual on-device model:
 *
 * 1. iOS (Core ML):
 *    a. Add the .mlpackage / .mlmodelc bundle under `assets/models/`.
 *    b. Expose a native function in `modules/ai-image-processing` (or a new
 *       `modules/ai-models` module) with the signature:
 *         loadModel(modelId: string, assetPath: string): Promise<void>
 *         unloadModel(modelId: string): Promise<void>
 *         runColorReconstruction(uri: string): Promise<{ uri: string }>
 *         runDustRemoval(uri: string): Promise<{ uri: string }>
 *    c. In this file: import those native functions and call them from
 *       `loadModel` / `unloadModel` / the inference helpers referenced by
 *       colorReconstruction.ts and dustRemoval.ts.
 *
 * 2. Android (TFLite):
 *    a. Add the .tflite file under `assets/models/`.
 *    b. Expose equivalent Kotlin functions via the same native module.
 *    c. Wire them here exactly as for iOS — the JS interface is identical.
 *
 * 3. ModelDescriptor.modelFilePath (see types.ts) must be set to the
 *    platform-correct asset path before calling `loadModel`.
 *
 * The orchestrator must coordinate any new native functions with the Native
 * agent (AGENTS.md rule: additive changes to modules/ai-image-processing only).
 */

import type { AIOperation, ModelAvailability, ModelDescriptor } from './types';

// ---------------------------------------------------------------------------
// Model registry
// ---------------------------------------------------------------------------

/**
 * Static registry of AI model descriptors.
 *
 * TODO(model): When model files are bundled, update `modelFilePath` entries
 *   to the real asset paths. The `id` and `displayName` fields are stable.
 */
const MODEL_REGISTRY: Record<AIOperation, ModelDescriptor> = {
  colorReconstruction: {
    id: 'colorReconstruction',
    displayName: 'Color Reconstruction v1 (placeholder)',
    // TODO(model): set to 'models/color_reconstruction.mlpackage' on iOS,
    //              'models/color_reconstruction.tflite' on Android.
    modelFilePath: null,
  },
  dustRemoval: {
    id: 'dustRemoval',
    displayName: 'Dust & Scratch Removal v1 (placeholder)',
    // TODO(model): set to 'models/dust_removal.mlpackage' on iOS,
    //              'models/dust_removal.tflite' on Android.
    modelFilePath: null,
  },
};

// ---------------------------------------------------------------------------
// In-process load state (maps operation id → whether the model is ready)
// ---------------------------------------------------------------------------

/**
 * Tracks which models have been successfully loaded in this JS process.
 *
 * This is intentionally a module-level Map (not a global store) so that
 * modelManager is a self-contained unit testable with plain imports.
 * React state / Zustand are NOT involved here; the manager is pure async.
 */
const _loadedModels = new Map<AIOperation, boolean>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the on-device model for the given operation is available
 * and ready to run inference.
 *
 * PLACEHOLDER: Always returns `{ isAvailable: false }` until real model files
 * are bundled and a native hook is wired (see INTEGRATION BOUNDARY above).
 *
 * @param operation  The AI operation whose model to check.
 * @returns          ModelAvailability with `isAvailable` and an optional reason.
 */
export function checkAvailability(operation: AIOperation): ModelAvailability {
  const descriptor = MODEL_REGISTRY[operation];

  // No model file bundled yet — this is the expected state for the scaffold.
  // TODO(model): after wiring the native hook, check whether the native side
  //   has the model loaded (e.g. query a native `isModelLoaded(modelId)` call).
  if (descriptor.modelFilePath === null) {
    return {
      isAvailable: false,
      unavailableReason: `No model file bundled for "${descriptor.displayName}". Real model required.`,
    };
  }

  // Model file is registered — check whether it has been loaded this session.
  const loaded = _loadedModels.get(operation) ?? false;
  if (!loaded) {
    return {
      isAvailable: false,
      unavailableReason: `Model "${descriptor.displayName}" is registered but not yet loaded. Call loadModel first.`,
    };
  }

  return { isAvailable: true };
}

/**
 * Load the model for the given operation into memory.
 *
 * PLACEHOLDER: No-op until a native hook is wired. Logs the intent for
 * developer visibility during scaffold testing.
 *
 * INTEGRATION BOUNDARY: Replace the body of this function with a call to
 * the native module's `loadModel(descriptor.id, descriptor.modelFilePath)`
 * once native support is ready.
 *
 * @param operation  The AI operation whose model to load.
 * @throws           If the model file path is not configured (safety guard).
 */
export async function loadModel(operation: AIOperation): Promise<void> {
  const descriptor = MODEL_REGISTRY[operation];

  if (descriptor.modelFilePath === null) {
    // Safety guard: do not attempt a native call with a null path.
    // This will be the common case until TODO(model) is resolved.
    if (__DEV__) {
      console.warn(
        `[AI/modelManager] loadModel("${operation}"): no model file configured. ` +
        'This is expected while the scaffold ships without real model files.',
      );
    }
    return;
  }

  // TODO(model): replace this with the real native call, e.g.:
  //   await NativeAiModels.loadModel(descriptor.id, descriptor.modelFilePath);
  _loadedModels.set(operation, true);

  if (__DEV__) {
    console.info(
      `[AI/modelManager] loadModel("${operation}"): model "${descriptor.displayName}" marked as loaded.`,
    );
  }
}

/**
 * Unload the model for the given operation, freeing device memory.
 *
 * PLACEHOLDER: No-op until a native hook is wired.
 *
 * INTEGRATION BOUNDARY: Replace the body with a call to
 * the native module's `unloadModel(descriptor.id)`.
 *
 * @param operation  The AI operation whose model to unload.
 */
export async function unloadModel(operation: AIOperation): Promise<void> {
  const descriptor = MODEL_REGISTRY[operation];

  if (!_loadedModels.has(operation)) {
    return; // Nothing to unload.
  }

  // TODO(model): replace this with the real native call, e.g.:
  //   await NativeAiModels.unloadModel(descriptor.id);
  _loadedModels.delete(operation);

  if (__DEV__) {
    console.info(
      `[AI/modelManager] unloadModel("${operation}"): model "${descriptor.displayName}" unloaded.`,
    );
  }
}

/**
 * Return the ModelDescriptor for the given operation.
 * Exposed for logging / diagnostics; not required for normal inference flow.
 */
export function getDescriptor(operation: AIOperation): ModelDescriptor {
  return MODEL_REGISTRY[operation];
}
