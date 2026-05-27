/**
 * dock-ble — local Expo module for Phase-3 BLE dock integration.
 *
 * Provides the complete roll-scan state machine, a software simulation
 * (no hardware required), and BLE interface stubs for the Analog Intelligence
 * dock hardware.
 *
 * Architecture summary
 * ────────────────────
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  HOST APP  (Scan screen, Settings screen, useDockStore)      │
 *   │                                                             │
 *   │  connect({ simulation: true })  startRollScan(config)       │
 *   │  stopRollScan()  disconnect()  getState()                   │
 *   │  addDockEventListener(listener)                             │
 *   └────────────────────────┬────────────────────────────────────┘
 *                            │ public API (re-exported from index.ts)
 *   ┌────────────────────────▼────────────────────────────────────┐
 *   │  DockService (src/DockService.ts)                           │
 *   │  • orchestrates state machine + transport                   │
 *   │  • singleton: dockService                                   │
 *   └────────────┬────────────────────────┬───────────────────────┘
 *                │                        │
 *   ┌────────────▼──────────┐  ┌──────────▼───────────────────────┐
 *   │ DockStateMachine       │  │ IDockTransport                   │
 *   │ (src/DockStateMachine) │  │                                  │
 *   │ Port of Swift          │  │  SimulatedDock   ←── DEFAULT     │
 *   │ ScanStateMachine +     │  │  (src/SimulatedDock.ts)          │
 *   │ Phase-3 extension      │  │                                  │
 *   └───────────────────────┘  │  BleTransport    ←── FUTURE       │
 *                              │  (not yet implemented)            │
 *                              │  BLE PLUG-IN: implement           │
 *                              │  IDockTransport using             │
 *                              │  react-native-ble-plx or the      │
 *                              │  native CoreBluetooth/Android     │
 *                              │  BLE APIs via DockBleModule.ts    │
 *                              └──────────────────────────────────┘
 *
 * Native skeletons (ExpoModulesCore)
 *   ios/DockBleModule.swift           — CoreBluetooth stubs
 *   android/.../DockBleModule.kt      — Android BLE stubs
 *   Both compile cleanly but return stub/simulated values until wired.
 *
 * Usage (simulation mode — no hardware required)
 * ───────────────────────────────────────────────
 *
 *   import { dockService, DockEvent, DockStatus } from 'dock-ble';
 *
 *   // 1. Subscribe to events
 *   const sub = dockService.addDockEventListener((event: DockEvent) => {
 *     console.log(event.type, event.payload);
 *   });
 *
 *   // 2. Connect (simulation)
 *   await dockService.connect({ simulation: true });
 *
 *   // 3. Start a 36-frame roll
 *   dockService.startRollScan({ frameCount: 36, maxRetries: 3 });
 *
 *   // 4. Poll status or use state-change listener
 *   const status: DockStatus = dockService.getState();
 *
 *   // 5. Cleanup
 *   sub.remove();
 *   await dockService.disconnect();
 *
 * "Connect Dock" / Auto-Roll-Scan screen integration guide
 * ─────────────────────────────────────────────────────────
 *
 * For the orchestrator wiring the Scan + Settings screens:
 *
 *   SCAN SCREEN (`src/app/(tabs)/scan.tsx`):
 *   • Show a "Connect Dock" button when `status.state === 'idle'`.
 *     On press: `await dockService.connect({ simulation: true })` (dev)
 *               or `await dockService.connect()` (production with real dock).
 *   • Show a "Start Roll Scan" button when `status.state === 'waitingForDockAlignment'`.
 *     On press: `dockService.startRollScan({ frameCount: 36 }, qualityVerifyFn)`.
 *     `qualityVerifyFn` should call `analyzeHistogram` from `ai-image-processing`
 *     on the captured frame URI and return a 0–1 quality score.
 *   • Show a dock status bar (connection indicator, battery level, frame counter)
 *     derived from `useDockStore.status` (a Zustand wrapper around dockService).
 *   • Show error modals on `status.state === 'error'` with jam recovery / disconnect
 *     reconnect UX from the ROADMAP M4.3 spec.
 *
 *   SETTINGS SCREEN (`src/app/(tabs)/settings.tsx`):
 *   • Add "Developer → Simulate Dock" toggle that calls:
 *       dockService.connect({ simulation: true })
 *     and then allows simulation controls (inject jam, inject low battery) by
 *     passing custom `SimulationConfig` to `SimulatedDock` via `dockService.connect`.
 *   • The `SimulationConfig` type is exported below for use in settings.
 *
 *   ZUSTAND STORE (`src/state/useDockStore.ts` — to be created by the orchestrator):
 *   • Subscribe to `dockService.addStateChangeListener` and `addDockEventListener`.
 *   • Mirror `DockStatus` fields into Zustand so React components re-render on changes.
 *   • Example:
 *       useDockStore.setState({ status: dockService.getState() });
 */

// ── Public API ────────────────────────────────────────────────────────────────

export { dockService, DockService } from './src/DockService';
export { DockStateMachine } from './src/DockStateMachine';
export { SimulatedDock } from './src/SimulatedDock';

// Native module bridge (BLE permission + stub methods)
export { default as DockBleNativeModule } from './src/DockBleModule';

// All types
export type {
  // State + events
  DockScanState,
  DockEventType,
  DockEvent,
  DockEventPayload,
  DockStateTransition,
  // Session config
  RollScanConfig,
  DockConnectOptions,
  // Status
  DockStatus,
  // Subscriptions
  DockEventSubscription,
  DockEventListener,
  DockStateChangeListener,
} from './src/DockBle.types';

export type { IDockTransport, SimulationConfig } from './src/SimulatedDock';
