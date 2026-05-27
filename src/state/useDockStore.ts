/**
 * src/state/useDockStore.ts
 *
 * Zustand store that mirrors the BLE dock state machine so React components
 * re-render whenever the dock status changes.
 *
 * Wiring:
 *   - Subscribes to dockService.addStateChangeListener to capture every state
 *     machine transition and pull a fresh DockStatus snapshot.
 *   - Subscribes to dockService.addDockEventListener to capture per-frame
 *     events (frameAligned, lowBattery, jamDetected, etc.) and append them
 *     to a bounded log for the UI to display.
 *   - Exposes connect / disconnect / startRollScan / stopRollScan action
 *     wrappers so callers never touch dockService directly.
 *
 * Usage:
 *   const status = useDockStore(s => s.status);
 *   const connect = useDockStore(s => s.connect);
 *   // Re-renders on every dock state transition.
 */

import { create } from 'zustand';
import { dockService } from '../../modules/dock-ble';
import type {
  DockConnectOptions,
  DockEvent,
  DockStatus,
  RollScanConfig,
} from '../../modules/dock-ble/src/DockBle.types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DockStore {
  /** Current dock status snapshot (mirrors dockService.getState()). */
  status: DockStatus;

  /**
   * Recent dock events (bounded to the last MAX_EVENT_LOG entries).
   * Useful for debugging and surfacing error details in the UI.
   */
  recentEvents: DockEvent[];

  /**
   * Whether a connect() call is currently in-flight. Distinct from
   * status.state === 'connectingToDock' because the async call itself
   * may throw before the machine transitions.
   */
  isConnecting: boolean;

  /**
   * The last connection error (set when connect() throws). Cleared on the
   * next connect() attempt.
   */
  connectError: string | null;

  // ── Actions ────────────────────────────────────────────────────────────────

  /**
   * Connect to the dock. Wraps dockService.connect() and updates store state.
   */
  connect: (options?: DockConnectOptions) => Promise<void>;

  /**
   * Disconnect from the dock. Wraps dockService.disconnect().
   */
  disconnect: () => Promise<void>;

  /**
   * Start an automatic roll scan. Wraps dockService.startRollScan().
   * The optional qualityVerify callback is forwarded to the service.
   */
  startRollScan: (
    config?: RollScanConfig,
    onQualityVerify?: (frameIndex: number) => Promise<number>,
  ) => void;

  /**
   * Stop the active roll scan. Wraps dockService.stopRollScan().
   */
  stopRollScan: () => void;

  /**
   * Force-refresh the status snapshot from dockService.getState().
   * Called internally after every state-change event.
   */
  _syncStatus: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_EVENT_LOG = 50;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function buildInitialStatus(): DockStatus {
  return dockService.getState();
}

export const useDockStore = create<DockStore>((set) => {
  // ── Subscriptions (wired once at module load) ────────────────────────────

  // Mirror state-machine transitions into Zustand.
  const stateChangeSub = dockService.addStateChangeListener((_transition) => {
    set({ status: dockService.getState() });
  });

  // Collect raw events for the log; also re-sync status on every event
  // because some events update batteryLevel / framesScanned without a
  // state-machine transition (e.g. lowBattery).
  const eventSub = dockService.addDockEventListener((event: DockEvent) => {
    set((state) => ({
      status: dockService.getState(),
      recentEvents:
        state.recentEvents.length >= MAX_EVENT_LOG
          ? [...state.recentEvents.slice(1), event]
          : [...state.recentEvents, event],
    }));
  });

  // Keep references so we can remove them if needed (module-level cleanup).
  // In practice, the singleton store lives for the app lifetime.
  void stateChangeSub;
  void eventSub;

  // ── Store definition ──────────────────────────────────────────────────────

  return {
    status: buildInitialStatus(),
    recentEvents: [],
    isConnecting: false,
    connectError: null,

    connect: async (options = {}) => {
      set({ isConnecting: true, connectError: null });
      try {
        await dockService.connect(options);
        // State machine will emit a stateChangeListener callback that updates
        // status. We still force-sync here for the isConnecting flag.
        set({ isConnecting: false, status: dockService.getState() });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Connection failed';
        set({ isConnecting: false, connectError: msg, status: dockService.getState() });
        throw err;
      }
    },

    disconnect: async () => {
      await dockService.disconnect();
      set({ status: dockService.getState(), recentEvents: [] });
    },

    startRollScan: (config?, onQualityVerify?) => {
      dockService.startRollScan(config, onQualityVerify);
      // Status will update via the stateChangeListener callback.
    },

    stopRollScan: () => {
      dockService.stopRollScan();
      set({ status: dockService.getState() });
    },

    _syncStatus: () => {
      set({ status: dockService.getState() });
    },
  };
});
