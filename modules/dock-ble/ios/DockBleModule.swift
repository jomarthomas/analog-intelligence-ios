//
//  DockBleModule.swift
//  dock-ble (local Expo module)
//
//  Phase-3 BLE dock integration skeleton — iOS (CoreBluetooth).
//
//  CURRENT STATE: All BLE methods return stub/simulated values.
//  The real state-machine logic lives in TypeScript (DockStateMachine.ts +
//  DockService.ts). This native module handles:
//    1. BLE permission management (CBCentralManager authorization).
//    2. CoreBluetooth scan / connect skeletons.
//    3. EventEmitter surface for forwarding dock BLE events to JS.
//
//  BLE PLUG-IN INSTRUCTIONS
//  ─────────────────────────
//  When real BLE hardware is available, fill in the MARK: BLE sections below:
//
//  1. Import CoreBluetooth and implement CBCentralManagerDelegate +
//     CBPeripheralDelegate.
//
//  2. In startScan(): call
//       centralManager.scanForPeripherals(
//         withServices: [CBUUID(string: DOCK_SERVICE_UUID)],
//         options: nil
//       )
//     and collect discovered peripherals in a dict; resolve the promise
//     in centralManagerDidDiscover peripheral callback.
//
//  3. In connectPeripheral(peripheralId:): retrieve the peripheral from the
//     dict and call centralManager.connect(peripheral, options: nil).
//     In centralManager(_:didConnect:): resolve the promise and call
//     subscribeToFrameEvents if auto-subscribe is desired.
//
//  4. In subscribeToFrameEvents(peripheralId:): after GATT service discovery,
//     call peripheral.setNotifyValue(true, for: frameAlignmentCharacteristic).
//     In peripheral(_:didUpdateValueFor:): decode the byte payload and call
//     sendEvent("dockEvent", body: ["type": "frameAligned", ...]).
//
//  5. In readBatteryLevel(peripheralId:): read the Battery Service
//     characteristic (UUID 0x2A19) and resolve with the UInt8 value.
//
//  Known dock BLE service UUID (to be assigned by firmware team):
//    let DOCK_SERVICE_UUID = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
//  Known frame-alignment characteristic UUID:
//    let FRAME_ALIGNMENT_CHAR_UUID = "YYYYYYYY-YYYY-YYYY-YYYY-YYYYYYYYYYYY"
//  Known dock-status (jam/battery) characteristic UUID:
//    let DOCK_STATUS_CHAR_UUID = "ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ"
//

import ExpoModulesCore
// BLE PLUG-IN: import CoreBluetooth

// MARK: - Exceptions

internal final class BlePermissionDeniedException: Exception {
    override var reason: String { "Bluetooth permission denied" }
}

internal final class BleUnavailableException: Exception {
    override var reason: String { "Bluetooth is not available on this device" }
}

internal final class PeripheralNotFoundException: Exception {
    override var reason: String { "Dock peripheral not found or not connected" }
}

// MARK: - Module

public class DockBleModule: Module {

    // BLE PLUG-IN: private var centralManager: CBCentralManager?
    // BLE PLUG-IN: private var discoveredPeripherals: [String: CBPeripheral] = [:]
    // BLE PLUG-IN: private var connectedPeripheral: CBPeripheral?
    // BLE PLUG-IN: private var scanCompletionHandlers: [(Result<[String], Error>) -> Void] = []

    public func definition() -> ModuleDefinition {
        Name("DockBle")

        // MARK: - EventEmitter
        //
        // "dockEvent" is fired by the native layer when a BLE characteristic
        // notification arrives from the dock firmware.
        //
        // Payload shape (mirrors DockEvent + DockEventPayload in DockBle.types.ts):
        //   {
        //     "type": "frameAligned" | "jamDetected" | "lowBattery" | "disconnected",
        //     "timestamp": "<ISO 8601>",
        //     "payload": {
        //       "frameIndex": Int?,
        //       "batteryLevel": Int?,
        //       "reason": String?,
        //       "rssi": Int?
        //     }
        //   }
        //
        // BLE PLUG-IN: Call `sendEvent("dockEvent", body: payload)` inside the
        //   CBPeripheralDelegate.peripheral(_:didUpdateValueFor:) callback after
        //   decoding the characteristic notification bytes.
        Events("dockEvent")

        // MARK: - requestBlePermissions() -> String

        // Returns "granted" | "denied" | "restricted".
        // STUB: returns "granted" unconditionally (simulation mode does not need BLE).
        //
        // BLE PLUG-IN: Replace with real CBCentralManager authorization check:
        //   switch CBCentralManager.authorization {
        //   case .allowedAlways: return "granted"
        //   case .denied: return "denied"
        //   case .restricted: return "restricted"
        //   default: // .notDetermined — prompt via CBCentralManager init
        //   }
        AsyncFunction("requestBlePermissions") { () -> String in
            return "granted"
        }

        // MARK: - startScan(timeoutMs) -> [String]

        // Scans for dock peripherals and returns discovered peripheral ID strings.
        // STUB: resolves immediately with an empty array.
        //
        // BLE PLUG-IN: Start CBCentralManager.scanForPeripherals(withServices:).
        //   Collect results in centralManagerDidDiscover. Stop after timeoutMs and
        //   resolve with the collected peripheral UUID strings.
        AsyncFunction("startScan") { (timeoutMs: Int) -> [String] in
            // BLE PLUG-IN: Start BLE scan here.
            // Return empty array in stub — simulation mode bypasses this.
            return []
        }

        // MARK: - stopScan() -> Void

        // STUB: no-op.
        //
        // BLE PLUG-IN: centralManager.stopScan()
        AsyncFunction("stopScan") { () -> Void in
            // BLE PLUG-IN: centralManager?.stopScan()
        }

        // MARK: - connectPeripheral(peripheralId) -> String

        // STUB: returns "connected" immediately (simulation mode uses SimulatedDock
        // and does not call through to native BLE).
        //
        // BLE PLUG-IN:
        //   guard let peripheral = discoveredPeripherals[peripheralId] else {
        //     throw PeripheralNotFoundException()
        //   }
        //   centralManager.connect(peripheral, options: nil)
        //   // Resolve in centralManager(_:didConnect:) callback.
        AsyncFunction("connectPeripheral") { (peripheralId: String) -> String in
            return "connected"
        }

        // MARK: - disconnectPeripheral(peripheralId) -> Void

        // STUB: no-op.
        //
        // BLE PLUG-IN:
        //   if let peripheral = connectedPeripheral {
        //     centralManager.cancelPeripheralConnection(peripheral)
        //   }
        AsyncFunction("disconnectPeripheral") { (peripheralId: String) -> Void in
            // BLE PLUG-IN: centralManager?.cancelPeripheralConnection(connectedPeripheral)
        }

        // MARK: - readBatteryLevel(peripheralId) -> Int

        // STUB: returns simulated battery level 85.
        //
        // BLE PLUG-IN:
        //   peripheral.readValue(for: batteryLevelCharacteristic)
        //   // Resolve in peripheral(_:didUpdateValueFor:) for the Battery Service char.
        //   // Return value[0] as Int (0–100).
        AsyncFunction("readBatteryLevel") { (peripheralId: String) -> Int in
            return 85 // Simulated battery level
        }

        // MARK: - subscribeToFrameEvents(peripheralId) -> Void

        // STUB: no-op. In simulation mode, events come from SimulatedDock via JS timers.
        //
        // BLE PLUG-IN:
        //   peripheral.setNotifyValue(true, for: frameAlignmentCharacteristic)
        //   peripheral.setNotifyValue(true, for: dockStatusCharacteristic)
        //   // In peripheral(_:didUpdateValueFor:), decode payload bytes and call:
        //   //   sendEvent("dockEvent", body: decodedPayload)
        //   // where decodedPayload matches the DockEvent shape above.
        AsyncFunction("subscribeToFrameEvents") { (peripheralId: String) -> Void in
            // BLE PLUG-IN: enable characteristic notifications here.
        }
    }
}
