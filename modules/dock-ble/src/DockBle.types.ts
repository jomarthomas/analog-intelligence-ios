/**
 * DockBle.types.ts — Phase-3 hardware interface types for the BLE scanning dock.
 *
 * Ported from the Phase-3 stubs in:
 *   legacy-ios/App/ScanState.swift    (state enum, Phase-3 comments)
 *   legacy-ios/App/ScanEvent.swift    (event enum, Phase-3 comments)
 *   legacy-ios/App/ScanStateMachine.swift (transition logic, Phase-3 extension)
 *   legacy-ios/docs/SPEC.md           ("Future Auto Roll Scan" section)
 *
 * The state machine defined here is PURPOSE-BUILT for the automatic roll-scan
 * dock flow. It is separate from the manual-scan ScanState machine in legacy-ios
 * (which covers idle/calibrating/ready/capturing/processing etc.).  The dock
 * flow replaces "wait for user to advance film" with hardware-driven alignment
 * detection from the dock firmware.
 *
 * This file is the SHARED CONTRACT between:
 *   - src/DockStateMachine.ts   (the TS implementation)
 *   - src/SimulatedDock.ts      (the software simulation)
 *   - src/DockBleModule.ts      (the native module bridge wrapper)
 *   - ios/DockBleModule.swift   (the native skeleton)
 *   - android/…/DockBleModule.kt (the native skeleton)
 *
 * Real BLE plug-in points are documented with "BLE PLUG-IN:" comments throughout.
 */

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/**
 * All possible states in the dock-driven roll-scan workflow.
 *
 * Port of the Phase-3 stubs in `ScanState.swift` (lines 47–60) and the
 * "Future Auto Roll Scan" states listed in `legacy-ios/docs/SPEC.md`.
 *
 * Idle is the initial/terminal state. The graph is linear for the happy path:
 *
 *   idle
 *     → connectingToDock       (on connect())
 *     → waitingForDockAlignment (on dock connected + scan started)
 *     → capturing               (on frameAligned event from dock)
 *     → verifyingQuality        (on captureComplete event from camera)
 *     → waitingForDockAlignment (quality ok, advance to next frame)
 *     → retryingCapture         (quality fail → re-capture same frame)
 *     → capturing               (retry attempt)
 *     → completed               (all frames scanned)
 *     → idle                   (on disconnect / reset)
 *
 * Any state can transition to `error` on dock events: jamDetected, disconnected,
 * lowBattery (lowBattery is advisory — it transitions to error only when critical).
 */
export type DockScanState =
  | 'idle'
  | 'connectingToDock'
  | 'waitingForDockAlignment'
  | 'capturing'
  | 'verifyingQuality'
  | 'retryingCapture'
  | 'completed'
  | 'error';

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Events that can be dispatched into the dock roll-scan state machine.
 *
 * Sourced from the Phase-3 stubs in `ScanEvent.swift` (lines 104–136) and
 * the dock events listed in `legacy-ios/docs/SPEC.md`.
 *
 * Hardware events (frameAligned, jamDetected, lowBattery, disconnected) are
 * raised by either:
 *   a) The SimulatedDock (simulation mode) via timer-driven callbacks, or
 *   b) The real BLE characteristic notification handler in the native layer.
 *      BLE PLUG-IN: see DockBleModule.swift / DockBleModule.kt — the native
 *      characteristic-notify handler calls `sendEvent('dockEvent', payload)`
 *      which is received in DockBleModule.ts and converted to a DockEvent
 *      before being fed into the state machine.
 *
 * Internal events (connectRequested, scanStartRequested, captureComplete,
 * qualityVerified, qualityFailed, retryExhausted, rollComplete) are raised
 * programmatically by the DockService (the TS orchestrator).
 */
export type DockEventType =
  // Hardware / firmware events (raised by dock or simulation)
  | 'frameAligned'        // Dock firmware: film frame is centered in the aperture
  | 'jamDetected'         // Dock firmware: film transport jam detected
  | 'lowBattery'          // Dock firmware: battery below 20%
  | 'disconnected'        // BLE link lost or dock powered off
  // Internal control events (raised by DockService)
  | 'connectRequested'    // User called connect()
  | 'scanStartRequested'  // User called startRollScan()
  | 'captureComplete'     // Camera reported capture success
  | 'captureFailed'       // Camera reported capture failure
  | 'qualityVerified'     // verifyingQuality step passed
  | 'qualityFailed'       // verifyingQuality step failed (retry)
  | 'retryExhausted'      // Max retries reached — give up on this frame
  | 'rollComplete'        // All frames in the roll have been scanned
  | 'scanStopped'         // User called stopRollScan()
  | 'reset'               // User called disconnect() or explicit reset
  | 'errorCleared';       // User acknowledged error and requested recovery

/**
 * A typed dock event delivered to the event subscription.
 */
export interface DockEvent {
  /** The event type. */
  type: DockEventType;
  /** ISO 8601 timestamp of the event. */
  timestamp: string;
  /** Payload varies by event type. */
  payload?: DockEventPayload;
}

/**
 * Optional payload attached to specific dock events.
 */
export interface DockEventPayload {
  /**
   * Dock firmware battery level 0–100. Present on `lowBattery` events.
   * BLE PLUG-IN: read from the BLE Battery Service characteristic
   *   (UUID 0x2A19) on the dock peripheral.
   */
  batteryLevel?: number;

  /**
   * Human-readable reason for jam or error events.
   * BLE PLUG-IN: decoded from a proprietary vendor characteristic
   *   (UUID to be assigned by dock firmware team).
   */
  reason?: string;

  /**
   * Frame index (1-based) of the frame that triggered this event.
   * Present on frameAligned, captureComplete, qualityVerified, qualityFailed.
   */
  frameIndex?: number;

  /**
   * Signal strength (RSSI) of the BLE link at the time of the event.
   * Present on connected/disconnected events.
   * BLE PLUG-IN: populated from CBPeripheral.readRSSI() callback on iOS,
   *   BluetoothGatt.readRemoteRssi() on Android.
   */
  rssi?: number;
}

// ---------------------------------------------------------------------------
// State transition record
// ---------------------------------------------------------------------------

/**
 * Record of a single state transition — mirroring `StateTransition` struct
 * from `ScanStateMachine.swift` (line 254).
 */
export interface DockStateTransition {
  from: DockScanState | null;
  to: DockScanState;
  triggeredBy: DockEventType | 'initialization' | 'reset';
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Session / roll configuration
// ---------------------------------------------------------------------------

/**
 * Configuration for a roll scan session.
 * Passed to `startRollScan()`.
 */
export interface RollScanConfig {
  /**
   * Expected number of frames in the roll (e.g. 24, 36).
   * The state machine transitions to `completed` when this many
   * `captureComplete` events have been verified.
   * Defaults to 36 if omitted.
   */
  frameCount?: number;

  /**
   * Maximum number of re-capture attempts per frame before giving up
   * and advancing to the next frame (transitions to `error`).
   * Defaults to 3 if omitted.
   */
  maxRetries?: number;

  /**
   * Minimum quality score (0–1) required to pass `verifyingQuality`.
   * The host app calls `onQualityVerify` callback with a computed score;
   * if score < threshold the state machine fires `qualityFailed`.
   * Defaults to 0.7 if omitted.
   */
  qualityThreshold?: number;
}

// ---------------------------------------------------------------------------
// Connection options
// ---------------------------------------------------------------------------

/**
 * Options for `connect()`.
 */
export interface DockConnectOptions {
  /**
   * When `true`, use SimulatedDock instead of real BLE hardware.
   * This is the ONLY way to use the module without physical dock hardware.
   *
   * BLE PLUG-IN: When `false` (or omitted), the module attempts a real BLE
   * scan using:
   *   - iOS: CoreBluetooth CBCentralManager.scanForPeripherals(withServices:)
   *          filtering on the Analog Intelligence dock service UUID.
   *   - Android: BluetoothLeScanner.startScan() with ScanFilter on service UUID.
   * The dock service UUID will be defined by the firmware team and documented
   * here when assigned.
   */
  simulation?: boolean;

  /**
   * BLE peripheral UUID (iOS) or address (Android) to connect to directly,
   * bypassing discovery. Ignored in simulation mode.
   *
   * BLE PLUG-IN: On iOS, supply CBPeripheral.identifier.uuidString.
   *   On Android, supply BluetoothDevice.address (MAC address string).
   */
  peripheralId?: string;

  /**
   * Discovery timeout in milliseconds. Defaults to 10 000 ms.
   * BLE PLUG-IN: passed to CBCentralManager scan / BLE scanner start.
   */
  discoveryTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Dock status snapshot
// ---------------------------------------------------------------------------

/**
 * Point-in-time status snapshot returned by `getState()`.
 */
export interface DockStatus {
  /** Current state machine state. */
  state: DockScanState;

  /**
   * Whether the module is operating in simulation mode.
   * Set by `connect({ simulation: true })`.
   */
  isSimulation: boolean;

  /**
   * Last known dock battery level (0–100), or null if not yet reported.
   * BLE PLUG-IN: read from BLE Battery Service (0x180F) characteristic 0x2A19.
   */
  batteryLevel: number | null;

  /**
   * Number of frames successfully captured in the current session.
   * Incremented on each `qualityVerified` event.
   */
  framesScanned: number;

  /**
   * Total frames configured for the current roll (from RollScanConfig.frameCount).
   * Null if no scan session is active.
   */
  totalFrames: number | null;

  /**
   * Current retry attempt for the current frame (0-based).
   * Reset to 0 on each new frame.
   */
  retryCount: number;

  /**
   * Whether a scan session is currently active.
   */
  isSessionActive: boolean;

  /** The last error message, if state === 'error'. */
  lastError: string | null;
}

// ---------------------------------------------------------------------------
// Event subscription
// ---------------------------------------------------------------------------

/**
 * Subscription handle returned by `addDockEventListener`.
 * Call `.remove()` to unsubscribe.
 */
export interface DockEventSubscription {
  remove: () => void;
}

/**
 * Callback type for dock events.
 */
export type DockEventListener = (event: DockEvent) => void;

/**
 * Callback type for state transition notifications.
 */
export type DockStateChangeListener = (transition: DockStateTransition) => void;
