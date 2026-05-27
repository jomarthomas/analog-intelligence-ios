/**
 * DockService.ts — Phase-3 roll-scan orchestrator.
 *
 * Implements the public API (`connect`, `disconnect`, `startRollScan`,
 * `stopRollScan`, `getState`) and wires together:
 *   - DockStateMachine (state transitions)
 *   - IDockTransport (SimulatedDock or future BleTransport)
 *   - Event subscription (EventEmitter pattern)
 *
 * This is the layer that the host app (Scan screen, Settings screen) calls.
 * It mirrors the role of `ScanWorkflowManager.swift` in the legacy codebase
 * (legacy-ios/App/ScanWorkflowManager.swift) but scoped to the dock-driven
 * auto roll-scan flow rather than the manual single-frame flow.
 *
 * BLE PLUG-IN:
 *   Replace `new SimulatedDock(simConfig)` in `_createTransport()` with
 *   `new BleTransport(options)` once the real BLE transport is implemented.
 *   DockService itself needs no changes — IDockTransport abstracts the detail.
 */

import { DockStateMachine } from './DockStateMachine';
import { SimulatedDock, type SimulationConfig } from './SimulatedDock';
import type {
  DockConnectOptions,
  DockEvent,
  DockEventListener,
  DockEventSubscription,
  DockScanState,
  DockStateChangeListener,
  DockStateTransition,
  DockStatus,
  RollScanConfig,
} from './DockBle.types';
import type { IDockTransport } from './SimulatedDock';

// Default roll config (36 frames, 3 retries, quality threshold 0.7).
const DEFAULT_ROLL_CONFIG: Required<RollScanConfig> = {
  frameCount: 36,
  maxRetries: 3,
  qualityThreshold: 0.7,
};

// ---------------------------------------------------------------------------
// DockService
// ---------------------------------------------------------------------------

export class DockService {
  private readonly _machine: DockStateMachine;
  private _transport: IDockTransport | null = null;
  private _isSimulation = false;

  // Roll session context
  private _rollConfig: Required<RollScanConfig> = { ...DEFAULT_ROLL_CONFIG };
  private _framesScanned = 0;
  private _retryCount = 0;
  private _currentFrame = 0;

  // Event / state-change listeners
  private _eventListeners: Set<DockEventListener> = new Set();
  private _stateListeners: Set<DockStateChangeListener> = new Set();

  constructor() {
    this._machine = new DockStateMachine();
    // Forward all state transitions to stateChange subscribers.
    this._machine.onTransition((transition) => {
      this._notifyStateListeners(transition);
      this._onStateEntered(transition.to, transition.triggeredBy);
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Connect to the dock (real BLE or simulation based on options).
   *
   * Transitions: idle → connectingToDock → (on success) waitingForDockAlignment
   *
   * BLE PLUG-IN: when `options.simulation` is false, instantiate BleTransport
   *   instead of SimulatedDock. Pass `options.peripheralId` for direct connect
   *   and `options.discoveryTimeoutMs` to the BLE scan timeout.
   */
  async connect(options: DockConnectOptions = {}): Promise<void> {
    if (this._machine.currentState !== 'idle') {
      throw new Error(
        `DockService.connect() called in state '${this._machine.currentState}'. Call disconnect() first.`,
      );
    }

    this._isSimulation = options.simulation ?? false;

    this._machine.handle('connectRequested');

    try {
      this._transport = this._createTransport(options);
      this._transport.setEventCallback((event) => this._handleTransportEvent(event));

      await this._transport.connect(options.peripheralId);
      // The transport fires 'scanStartRequested' internally once connected.
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown connection error';
      this._machine.handle('disconnected', msg);
      throw err;
    }
  }

  /**
   * Disconnect from the dock and reset to idle.
   */
  async disconnect(): Promise<void> {
    if (this._transport) {
      await this._transport.disconnect();
      this._transport = null;
    }
    this._machine.reset();
    this._resetSessionContext();
  }

  /**
   * Start an automatic roll scan.
   *
   * Must be called after `connect()` resolves and the machine is in
   * `waitingForDockAlignment`. Configures the session and waits for the
   * first `frameAligned` event from the dock.
   *
   * @param config   Roll configuration (frame count, max retries, quality threshold).
   * @param onQualityVerify  Host app callback invoked on every `verifyingQuality`
   *   entry. The callback should return a quality score 0–1 based on the
   *   captured image (e.g. from analyzeHistogram in ai-image-processing).
   *   If omitted, quality verification always passes (score = 1.0).
   */
  startRollScan(
    config: RollScanConfig = {},
    onQualityVerify?: (frameIndex: number) => Promise<number>,
  ): void {
    const state = this._machine.currentState;
    if (state !== 'waitingForDockAlignment') {
      throw new Error(
        `DockService.startRollScan() called in state '${state}'. Must be in 'waitingForDockAlignment'.`,
      );
    }

    this._rollConfig = { ...DEFAULT_ROLL_CONFIG, ...config };
    this._framesScanned = 0;
    this._retryCount = 0;
    this._currentFrame = 0;

    if (this._transport instanceof SimulatedDock) {
      this._transport.setRollConfig(this._rollConfig);
    }

    if (onQualityVerify) {
      this._qualityVerifyCallback = onQualityVerify;
    }

    // The dock already sent `scanStartRequested` during connect, so we are
    // already in `waitingForDockAlignment`. The first `frameAligned` event
    // will come from the transport / simulation momentarily.
    this._emitDockEvent({
      type: 'scanStartRequested',
      timestamp: new Date().toISOString(),
      payload: { frameIndex: 0 },
    });
  }

  /**
   * Stop the roll scan and reset to idle.
   */
  stopRollScan(): void {
    this._machine.handle('scanStopped');
    this._resetSessionContext();
  }

  /**
   * Snapshot of the current dock status.
   * Suitable for polling from Zustand `useDockStore`.
   */
  getState(): DockStatus {
    return {
      state: this._machine.currentState,
      isSimulation: this._isSimulation,
      batteryLevel: this._transport?.batteryLevel ?? null,
      framesScanned: this._framesScanned,
      totalFrames: this._rollConfig.frameCount,
      retryCount: this._retryCount,
      isSessionActive: this._isSessionActive(),
      lastError: this._machine.lastError,
    };
  }

  /**
   * Subscribe to all dock events (hardware + internal control events).
   * Returns a subscription handle with a `.remove()` method.
   *
   * Wiring for Scan / Settings screens:
   *   const sub = dockService.addDockEventListener((event) => {
   *     if (event.type === 'frameAligned') { ... }
   *   });
   *   // cleanup:
   *   sub.remove();
   */
  addDockEventListener(listener: DockEventListener): DockEventSubscription {
    this._eventListeners.add(listener);
    return {
      remove: () => {
        this._eventListeners.delete(listener);
      },
    };
  }

  /**
   * Subscribe to state machine transitions only.
   * Useful for `useDockStore` to update Zustand state.
   */
  addStateChangeListener(listener: DockStateChangeListener): DockEventSubscription {
    this._stateListeners.add(listener);
    return {
      remove: () => {
        this._stateListeners.delete(listener);
      },
    };
  }

  // ── Internal callbacks / handlers ─────────────────────────────────────────

  private _qualityVerifyCallback: ((frameIndex: number) => Promise<number>) | null = null;

  /**
   * Receive a hardware or internal event from the transport and drive the
   * state machine. This is the central event router.
   */
  private _handleTransportEvent(event: DockEvent): void {
    // Broadcast raw event to subscribers first.
    this._emitDockEvent(event);

    const type = event.type;
    const frameIndex = event.payload?.frameIndex;

    switch (type) {
      case 'scanStartRequested':
        this._machine.handle('scanStartRequested');
        break;

      case 'frameAligned':
        this._currentFrame = frameIndex ?? this._currentFrame + 1;
        this._retryCount = 0;
        this._machine.handle('frameAligned');
        // Immediately trigger capture once aligned.
        void this._triggerCapture();
        break;

      case 'captureComplete':
        this._machine.handle('captureComplete');
        // Enter quality verification.
        void this._runQualityVerification();
        break;

      case 'captureFailed':
        this._retryCount++;
        if (this._retryCount >= this._rollConfig.maxRetries) {
          this._machine.handle('retryExhausted', 'Max capture retries reached');
        } else {
          this._machine.handle('captureFailed');
          void this._triggerRetry();
        }
        break;

      case 'qualityVerified':
        this._framesScanned++;
        if (this._framesScanned >= this._rollConfig.frameCount) {
          this._machine.handle('rollComplete');
        } else {
          this._machine.handle('qualityVerified');
          void this._advanceFilm();
        }
        break;

      case 'qualityFailed':
        this._retryCount++;
        if (this._retryCount >= this._rollConfig.maxRetries) {
          this._machine.handle('retryExhausted', 'Max quality retries reached');
        } else {
          this._machine.handle('qualityFailed');
          void this._triggerRetry();
        }
        break;

      case 'rollComplete':
        this._machine.handle('rollComplete');
        break;

      case 'jamDetected':
        this._machine.handle('jamDetected', event.payload?.reason ?? 'Film jam detected');
        break;

      case 'lowBattery':
        // lowBattery is advisory. Deliver the event to subscribers but do not
        // transition to error automatically. The host app can call stopRollScan()
        // if desired.
        break;

      case 'disconnected':
        this._machine.handle('disconnected', 'Dock disconnected');
        break;

      default:
        // Unhandled events are silently ignored.
        break;
    }
  }

  /**
   * React to the state machine entering a new state.
   * Port of `ScanWorkflowManager.setupObservers` pattern (ScanWorkflowManager.swift).
   */
  private _onStateEntered(
    state: DockScanState,
    _triggeredBy: DockStateTransition['triggeredBy'],
  ): void {
    switch (state) {
      case 'waitingForDockAlignment':
        // Instruct the transport to advance the film to the next frame.
        if (this._transport && this._currentFrame > 0) {
          void this._transport.advanceToNextFrame(this._currentFrame);
        }
        break;

      case 'retryingCapture':
        if (this._transport instanceof SimulatedDock) {
          this._transport.simulateRetry(this._currentFrame);
        }
        break;

      default:
        break;
    }
  }

  // ── Transport helpers ─────────────────────────────────────────────────────

  private async _triggerCapture(): Promise<void> {
    if (this._transport) {
      await this._transport.triggerCapture(this._currentFrame);
    }
  }

  private async _triggerRetry(): Promise<void> {
    if (this._transport instanceof SimulatedDock) {
      this._transport.simulateRetry(this._currentFrame);
    } else if (this._transport) {
      // BLE PLUG-IN: real transport re-triggers capture here.
      await this._transport.triggerCapture(this._currentFrame);
    }
  }

  private async _advanceFilm(): Promise<void> {
    if (this._transport) {
      await this._transport.advanceToNextFrame(this._currentFrame);
    }
  }

  private async _runQualityVerification(): Promise<void> {
    if (this._transport instanceof SimulatedDock) {
      // Simulation: let the SimulatedDock decide pass/fail based on its config.
      this._transport.simulateQualityVerification(this._currentFrame, this._retryCount);
    } else if (this._qualityVerifyCallback) {
      // Real hardware: ask the host app for a quality score.
      try {
        const score = await this._qualityVerifyCallback(this._currentFrame);
        const event: DockEvent = {
          type: score >= this._rollConfig.qualityThreshold ? 'qualityVerified' : 'qualityFailed',
          timestamp: new Date().toISOString(),
          payload: { frameIndex: this._currentFrame },
        };
        this._handleTransportEvent(event);
      } catch {
        // If quality check throws, treat as failed.
        this._handleTransportEvent({
          type: 'qualityFailed',
          timestamp: new Date().toISOString(),
          payload: { frameIndex: this._currentFrame },
        });
      }
    } else {
      // No callback provided and not simulation → always pass.
      this._handleTransportEvent({
        type: 'qualityVerified',
        timestamp: new Date().toISOString(),
        payload: { frameIndex: this._currentFrame },
      });
    }
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  /**
   * Create the appropriate transport based on connection options.
   *
   * BLE PLUG-IN: Add an `else` branch here to instantiate the real
   *   BleTransport when `!options.simulation`:
   *
   *   import { BleTransport } from './BleTransport';
   *   ...
   *   if (!options.simulation) {
   *     return new BleTransport({
   *       peripheralId: options.peripheralId,
   *       discoveryTimeoutMs: options.discoveryTimeoutMs ?? 10_000,
   *     });
   *   }
   */
  private _createTransport(_options: DockConnectOptions): IDockTransport {
    // BLE PLUG-IN: inspect _options.simulation, _options.peripheralId, and
    //   _options.discoveryTimeoutMs here to decide which transport to instantiate.
    //   When _options.simulation is false, return new BleTransport(_options).
    const simConfig: SimulationConfig = {};
    return new SimulatedDock(simConfig);
  }

  // ── Notification helpers ──────────────────────────────────────────────────

  private _emitDockEvent(event: DockEvent): void {
    for (const listener of this._eventListeners) {
      try {
        listener(event);
      } catch {
        // Swallow listener errors.
      }
    }
  }

  private _notifyStateListeners(transition: DockStateTransition): void {
    for (const listener of this._stateListeners) {
      try {
        listener(transition);
      } catch {
        // Swallow listener errors.
      }
    }
  }

  // ── Session context ───────────────────────────────────────────────────────

  private _resetSessionContext(): void {
    this._framesScanned = 0;
    this._retryCount = 0;
    this._currentFrame = 0;
    this._qualityVerifyCallback = null;
  }

  private _isSessionActive(): boolean {
    const s = this._machine.currentState;
    return (
      s === 'waitingForDockAlignment' ||
      s === 'capturing' ||
      s === 'verifyingQuality' ||
      s === 'retryingCapture'
    );
  }
}

// ---------------------------------------------------------------------------
// Singleton instance (mirrors native module singleton pattern)
// ---------------------------------------------------------------------------

/**
 * Singleton DockService instance.
 * Import this from the module entry point (`index.ts`) rather than
 * constructing DockService directly, so the Scan + Settings screens share
 * the same state machine.
 */
export const dockService = new DockService();
