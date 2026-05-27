/**
 * DockStateMachine.ts — Phase-3 roll-scan state machine (TypeScript).
 *
 * Direct port of the state-machine PATTERN from:
 *   legacy-ios/App/ScanStateMachine.swift  (structure, transition guard, history)
 *   legacy-ios/App/ScanState.swift         (Phase-3 state stubs, lines 47–60)
 *   legacy-ios/App/ScanEvent.swift         (Phase-3 event stubs, lines 104–136)
 *   legacy-ios/App/ScanStateMachine.swift  (Phase-3 extension, lines 264–294)
 *
 * The Swift @Observable pattern is replaced with a simple listener array (no
 * external state library required — the Zustand `useDockStore` layer wraps this).
 *
 * All state logic lives here in TypeScript — the native iOS/Android skeletons
 * only handle BLE transport and forward hardware events back to this layer.
 */

import type {
  DockScanState,
  DockEventType,
  DockStateTransition,
  DockStateChangeListener,
} from './DockBle.types';

/** Maximum history entries retained (mirrors ScanStateMachine.maxHistoryCount = 100). */
const MAX_HISTORY = 100;

/**
 * Typed transition table: [from, event] → to
 *
 * Port of `ScanStateMachine.nextState(from:on:)` (Swift switch, lines 86–177)
 * and the Phase-3 `handleDockEvent` extension (lines 264–294).
 *
 * The table uses a flat lookup key `"${from}:${event}"` for O(1) dispatch.
 * Entries that are not in the table leave the machine in the current state
 * (the Swift `default: return state` case).
 */
const TRANSITIONS: Readonly<Record<string, DockScanState>> = {
  // ── idle ────────────────────────────────────────────────────────────────
  'idle:connectRequested': 'connectingToDock',

  // ── connectingToDock ────────────────────────────────────────────────────
  // BLE PLUG-IN: the native layer fires 'scanStartRequested' internally once
  // the CBCentralManager/BluetoothGatt connection callback reports success.
  'connectingToDock:scanStartRequested': 'waitingForDockAlignment',
  'connectingToDock:disconnected': 'error',
  'connectingToDock:reset': 'idle',

  // ── waitingForDockAlignment ─────────────────────────────────────────────
  // BLE PLUG-IN: dock firmware sends a characteristic notification when the
  // film transport positions a frame in the aperture → native layer fires
  // 'frameAligned' on the JS event emitter.
  'waitingForDockAlignment:frameAligned': 'capturing',
  'waitingForDockAlignment:jamDetected': 'error',
  'waitingForDockAlignment:disconnected': 'error',
  'waitingForDockAlignment:scanStopped': 'idle',
  'waitingForDockAlignment:rollComplete': 'completed',

  // ── capturing ───────────────────────────────────────────────────────────
  'capturing:captureComplete': 'verifyingQuality',
  'capturing:captureFailed': 'retryingCapture',
  'capturing:jamDetected': 'error',
  'capturing:disconnected': 'error',
  'capturing:scanStopped': 'idle',

  // ── verifyingQuality ────────────────────────────────────────────────────
  // qualityVerified → advance to next frame (back to waiting)
  // qualityFailed   → re-capture current frame
  'verifyingQuality:qualityVerified': 'waitingForDockAlignment',
  'verifyingQuality:qualityFailed': 'retryingCapture',
  'verifyingQuality:rollComplete': 'completed',
  'verifyingQuality:disconnected': 'error',
  'verifyingQuality:scanStopped': 'idle',

  // ── retryingCapture ─────────────────────────────────────────────────────
  'retryingCapture:captureComplete': 'verifyingQuality',
  'retryingCapture:retryExhausted': 'error',
  'retryingCapture:captureFailed': 'retryingCapture', // stay for another attempt
  'retryingCapture:jamDetected': 'error',
  'retryingCapture:disconnected': 'error',
  'retryingCapture:scanStopped': 'idle',

  // ── completed ───────────────────────────────────────────────────────────
  'completed:reset': 'idle',
  'completed:disconnected': 'idle',

  // ── error ───────────────────────────────────────────────────────────────
  // Port of ScanStateMachine retryAfterError / cancelAfterError logic
  // (ScanStateMachine.swift lines 156–166).
  'error:errorCleared': 'waitingForDockAlignment', // recoverable: back to alignment
  'error:reset': 'idle',
  'error:disconnected': 'idle',
};

/**
 * DockStateMachine — manages dock roll-scan state transitions.
 *
 * Usage:
 *   const machine = new DockStateMachine();
 *   machine.onTransition((t) => console.log(t.from, '→', t.to));
 *   machine.handle('connectRequested');
 *
 * Thread safety: all public methods must be called from the JS thread.
 */
export class DockStateMachine {
  private _state: DockScanState = 'idle';
  private _history: DockStateTransition[] = [];
  private _listeners: DockStateChangeListener[] = [];
  private _lastError: string | null = null;

  constructor() {
    this._recordTransition(null, 'idle', 'initialization');
  }

  // ── Public API ────────────────────────────────────────────────────────────

  get currentState(): DockScanState {
    return this._state;
  }

  get lastError(): string | null {
    return this._lastError;
  }

  get stateHistory(): ReadonlyArray<DockStateTransition> {
    return this._history;
  }

  /**
   * Process an event and transition to the appropriate state.
   * Returns the new state (which may be the same if no transition matched).
   *
   * Port of `ScanStateMachine.handle(_:)` (lines 43–66).
   */
  handle(event: DockEventType, errorMessage?: string): DockScanState {
    const previous = this._state;
    const key = `${previous}:${event}`;
    const next = TRANSITIONS[key];

    if (next === undefined) {
      // No transition defined — stay in current state (Swift `default: return state`).
      return this._state;
    }

    if (next === previous) {
      // Self-transition — no listeners fired (matches Swift guard).
      return this._state;
    }

    if (next === 'error' && errorMessage !== undefined) {
      this._lastError = errorMessage;
    } else if (next !== 'error') {
      this._lastError = null;
    }

    this._state = next;
    this._recordTransition(previous, next, event);
    this._notifyListeners(this._history[this._history.length - 1]);
    return next;
  }

  /**
   * Reset to idle unconditionally.
   * Port of `ScanStateMachine.reset()` (lines 69–75).
   */
  reset(): void {
    const previous = this._state;
    this._state = 'idle';
    this._lastError = null;
    this._recordTransition(previous, 'idle', 'reset');
    this._notifyListeners(this._history[this._history.length - 1]);
  }

  /**
   * Whether the given event would result in a state transition.
   * Port of `ScanStateMachine.canHandle(_:)` (lines 78–81).
   */
  canHandle(event: DockEventType): boolean {
    const key = `${this._state}:${event}`;
    const next = TRANSITIONS[key];
    return next !== undefined && next !== this._state;
  }

  /**
   * Subscribe to state transitions.
   * Returns an unsubscribe function.
   */
  onTransition(listener: DockStateChangeListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  /**
   * Get the most recent N transitions for debugging.
   * Port of `ScanStateMachine.getRecentTransitions(count:)` (lines 233–237).
   */
  getRecentTransitions(count = 10): DockStateTransition[] {
    const start = Math.max(0, this._history.length - count);
    return this._history.slice(start);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _recordTransition(
    from: DockScanState | null,
    to: DockScanState,
    triggeredBy: DockStateTransition['triggeredBy'],
  ): void {
    const entry: DockStateTransition = {
      from,
      to,
      triggeredBy,
      timestamp: new Date().toISOString(),
    };
    this._history.push(entry);
    // Limit history size — port of ScanStateMachine maxHistoryCount trimming.
    if (this._history.length > MAX_HISTORY) {
      this._history.splice(0, this._history.length - MAX_HISTORY);
    }
  }

  private _notifyListeners(transition: DockStateTransition): void {
    for (const listener of this._listeners) {
      try {
        listener(transition);
      } catch {
        // Swallow listener errors — prevent one bad listener from breaking others.
      }
    }
  }
}
