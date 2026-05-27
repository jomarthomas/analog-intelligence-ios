/**
 * SimulatedDock.ts — Software simulation of the BLE scanning dock.
 *
 * Drives the DockStateMachine through a realistic roll-scan sequence using
 * timers, with no physical hardware or Bluetooth required. Activated when
 * `connect({ simulation: true })` is called.
 *
 * The simulation is the PRIMARY testing path for Milestone 4 (M4). Every
 * code path in DockService — state transitions, event subscription, quality
 * verification, retry logic — exercises through SimulatedDock.
 *
 * Timing model (all configurable via SimulationConfig):
 *   - connectDelay (default 600 ms): simulates BLE discovery + connection handshake.
 *   - alignmentDelay (default 1 200 ms): simulates dock advancing film to next frame.
 *   - captureDelay (default 800 ms): simulates camera shutter + image transfer.
 *   - verifyDelay (default 400 ms): simulates quality-check computation.
 *   - retryDelay (default 1 500 ms): simulates film rewind and re-alignment for retry.
 *   - lowBatteryAtFrame (default null): inject a `lowBattery` event at this frame index.
 *   - jamAtFrame (default null): inject a `jamDetected` event at this frame index.
 *   - qualityFailAtFrames (default []): inject quality failures at these frame indices,
 *       causing a retryingCapture → verifyingQuality retry cycle.
 *
 * BLE PLUG-IN: Replace SimulatedDock with a real BleTransport that calls
 *   iOS CoreBluetooth or Android BLE APIs. The interface contract is identical —
 *   both SimulatedDock and BleTransport implement the IDockTransport interface
 *   so DockService is transport-agnostic.
 */

import type {
  DockEvent,
  DockEventPayload,
  DockEventType,
  RollScanConfig,
} from './DockBle.types';

// ---------------------------------------------------------------------------
// Simulation configuration
// ---------------------------------------------------------------------------

export interface SimulationConfig {
  /** Delay in ms for BLE connection handshake simulation. Default: 600. */
  connectDelayMs?: number;
  /** Delay in ms between frame advancement steps. Default: 1200. */
  alignmentDelayMs?: number;
  /** Delay in ms for simulated camera shutter + transfer. Default: 800. */
  captureDelayMs?: number;
  /** Delay in ms for quality-check computation. Default: 400. */
  verifyDelayMs?: number;
  /** Delay in ms before a retry attempt completes. Default: 1500. */
  retryDelayMs?: number;
  /** Inject a `lowBattery` event at this 1-based frame index, or null for none. */
  lowBatteryAtFrame?: number | null;
  /** Inject a `jamDetected` event at this 1-based frame index, or null for none. */
  jamAtFrame?: number | null;
  /**
   * Inject quality failures at these 1-based frame indices (triggers
   * retryingCapture once; the retry succeeds by default).
   */
  qualityFailAtFrames?: number[];
  /** Starting battery level (0–100). Default: 85. */
  initialBatteryLevel?: number;
}

const DEFAULT_CONFIG: Required<SimulationConfig> = {
  connectDelayMs: 600,
  alignmentDelayMs: 1200,
  captureDelayMs: 800,
  verifyDelayMs: 400,
  retryDelayMs: 1500,
  lowBatteryAtFrame: null,
  jamAtFrame: null,
  qualityFailAtFrames: [],
  initialBatteryLevel: 85,
};

// ---------------------------------------------------------------------------
// Transport interface
// ---------------------------------------------------------------------------

/**
 * IDockTransport — the abstraction that separates DockService from BLE
 * implementation details.
 *
 * BLE PLUG-IN: implement this interface in a `BleTransport` class that uses
 *   react-native-ble-plx (or native CoreBluetooth/Android BLE via the iOS/
 *   Android skeleton module) to discover and communicate with the real dock.
 *
 *   react-native-ble-plx integration sketch (do NOT add this dependency now):
 *     import { BleManager, Device } from 'react-native-ble-plx';
 *     class BleTransport implements IDockTransport {
 *       private manager = new BleManager();
 *       private device: Device | null = null;
 *       async connect(peripheralId?: string): Promise<void> {
 *         // scan for ANALOG_INTELLIGENCE_DOCK_SERVICE_UUID
 *         // connect to discovered device
 *         // discover services + characteristics
 *         // subscribe to frame-alignment characteristic notifications
 *         // subscribe to dock-status characteristic notifications
 *       }
 *       async disconnect(): Promise<void> { ... }
 *       // listen → dispatch hardware events to the eventCallback
 *     }
 *
 *   Alternatively, the native module skeletons in ios/DockBleModule.swift and
 *   android/.../DockBleModule.kt can be filled in with CoreBluetooth /
 *   BluetoothGatt code; then the JS layer receives events via the native
 *   EventEmitter and BleTransport becomes a thin wrapper around
 *   DockBleNativeModule.
 */
export interface IDockTransport {
  /**
   * Initiate a connection to the dock.
   * Implementations should resolve once the transport is ready to receive
   * events. For real BLE, this includes discovery + GATT service discovery.
   */
  connect(peripheralId?: string): Promise<void>;

  /** Tear down the connection and clean up all resources / timers. */
  disconnect(): Promise<void>;

  /**
   * Called by DockService to request a frame capture.
   * Simulation: immediately schedules captureDelay then fires `captureComplete`.
   * BLE PLUG-IN: write a "capture trigger" characteristic on the dock.
   */
  triggerCapture(frameIndex: number): Promise<void>;

  /**
   * Called by DockService to signal the dock to advance to the next frame.
   * Simulation: schedules alignmentDelay then fires `frameAligned`.
   * BLE PLUG-IN: write a "film advance" characteristic on the dock.
   */
  advanceToNextFrame(frameIndex: number): Promise<void>;

  /** Register a callback for hardware / transport events. */
  setEventCallback(cb: (event: DockEvent) => void): void;

  /** Latest known battery level (0–100), or null if unknown. */
  readonly batteryLevel: number | null;
}

// ---------------------------------------------------------------------------
// SimulatedDock implementation
// ---------------------------------------------------------------------------

/**
 * SimulatedDock — pure-TS simulation of the BLE dock transport.
 *
 * Implements IDockTransport using `setTimeout`-based timers to drive a
 * realistic roll-scan sequence without any native BLE code or hardware.
 */
export class SimulatedDock implements IDockTransport {
  private _config: Required<SimulationConfig>;
  private _eventCallback: ((event: DockEvent) => void) | null = null;
  private _connected = false;
  private _timers: ReturnType<typeof setTimeout>[] = [];
  private _battery: number;
  private _rollConfig: RollScanConfig | null = null;
  private _currentFrame = 0;
  private _retryCountForFrame = 0;

  constructor(config: SimulationConfig = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._battery = this._config.initialBatteryLevel;
  }

  get batteryLevel(): number | null {
    return this._connected ? this._battery : null;
  }

  setEventCallback(cb: (event: DockEvent) => void): void {
    this._eventCallback = cb;
  }

  // ── IDockTransport interface ─────────────────────────────────────────────

  async connect(_peripheralId?: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this._connected = true;
        // The native layer would fire 'scanStartRequested' after confirming
        // GATT service discovery; we simulate that here automatically.
        this._emit('scanStartRequested', {
          rssi: -65, // simulated RSSI
        });
        resolve();
      }, this._config.connectDelayMs);
      this._timers.push(t);
    });
  }

  async disconnect(): Promise<void> {
    this._clearAllTimers();
    this._connected = false;
    this._rollConfig = null;
    this._currentFrame = 0;
    this._retryCountForFrame = 0;
  }

  async triggerCapture(frameIndex: number): Promise<void> {
    if (!this._connected) {
      return;
    }
    const t = setTimeout(() => {
      if (!this._connected) return;
      this._emit('captureComplete', { frameIndex });
    }, this._config.captureDelayMs);
    this._timers.push(t);
  }

  async advanceToNextFrame(frameIndex: number): Promise<void> {
    if (!this._connected) {
      return;
    }
    const cfg = this._rollConfig;

    const t = setTimeout(() => {
      if (!this._connected) return;

      const nextFrame = frameIndex + 1;
      const totalFrames = cfg?.frameCount ?? 36;

      // Inject jam before announcing alignment, if configured.
      if (this._config.jamAtFrame === nextFrame) {
        this._emit('jamDetected', {
          frameIndex: nextFrame,
          reason: 'Simulated film jam at frame ' + nextFrame,
        });
        return;
      }

      // Inject low-battery advisory if configured.
      if (this._config.lowBatteryAtFrame === nextFrame) {
        this._battery = 18; // drops below 20%
        this._emit('lowBattery', { batteryLevel: this._battery, frameIndex: nextFrame });
        // Continue scan — low battery is advisory only; only fatal if battery dies.
      }

      if (nextFrame > totalFrames) {
        this._emit('rollComplete', { frameIndex });
      } else {
        this._emit('frameAligned', { frameIndex: nextFrame });
      }
    }, this._config.alignmentDelayMs);
    this._timers.push(t);
  }

  // ── Quality verification helper ──────────────────────────────────────────

  /**
   * Called by DockService when entering `verifyingQuality`.
   * Fires `qualityVerified` or `qualityFailed` after verifyDelay.
   *
   * If the current frame is in qualityFailAtFrames AND this is the first
   * attempt (retryCount === 0), fire qualityFailed; otherwise verify.
   */
  simulateQualityVerification(frameIndex: number, retryCount: number): void {
    const shouldFail =
      this._config.qualityFailAtFrames.includes(frameIndex) && retryCount === 0;

    const t = setTimeout(() => {
      if (!this._connected) return;
      if (shouldFail) {
        this._emit('qualityFailed', { frameIndex });
      } else {
        this._emit('qualityVerified', { frameIndex });
      }
    }, this._config.verifyDelayMs);
    this._timers.push(t);
  }

  /**
   * Called by DockService when entering `retryingCapture`.
   * Fires `captureComplete` after retryDelay.
   */
  simulateRetry(frameIndex: number): void {
    const t = setTimeout(() => {
      if (!this._connected) return;
      this._emit('captureComplete', { frameIndex });
    }, this._config.retryDelayMs);
    this._timers.push(t);
  }

  // ── Session config ───────────────────────────────────────────────────────

  /** Set the roll scan configuration for this session. Called by DockService. */
  setRollConfig(config: RollScanConfig): void {
    this._rollConfig = config;
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private _emit(type: DockEventType, payload?: DockEventPayload): void {
    if (this._eventCallback) {
      const event: DockEvent = {
        type,
        timestamp: new Date().toISOString(),
        payload,
      };
      this._eventCallback(event);
    }
  }

  private _clearAllTimers(): void {
    for (const t of this._timers) {
      clearTimeout(t);
    }
    this._timers = [];
  }
}
