/**
 * DockBleModule.ts — Native module bridge wrapper for dock-ble.
 *
 * This file mirrors the role of `AiImageProcessingModule.ts` in the
 * ai-image-processing module: it exposes the native side's interface to the
 * TS layer and is loaded by `requireNativeModule`.
 *
 * In the current implementation the real state-machine logic lives in TS
 * (DockStateMachine + DockService). The native module (ios/DockBleModule.swift,
 * android/.../DockBleModule.kt) provides:
 *   1. BLE permission management (iOS CBCentralManager authorization,
 *      Android BLUETOOTH_SCAN / BLUETOOTH_CONNECT runtime permissions).
 *   2. CoreBluetooth / BluetoothGatt scan + connect skeletons.
 *   3. An EventEmitter surface to forward BLE characteristic notifications
 *      (frameAligned, jamDetected, lowBattery, disconnected) back to JS.
 *
 * CURRENT STATE: The native skeletons return stub/simulated values. The TS
 * layer uses DockService + SimulatedDock for all logic. When real BLE is
 * wired:
 *   - Replace the SimulatedDock inside DockService._createTransport() with a
 *     BleTransport that calls through to this native module.
 *   - Or implement BleTransport entirely in TS using react-native-ble-plx
 *     (recommended) — in which case the native module is only needed for
 *     permission handling.
 *
 * BLE PLUG-IN: The native module methods below would be called by BleTransport:
 *   - startScan() → starts CBCentralManager.scanForPeripherals / BLE scanner
 *   - stopScan() → stops scanning
 *   - connectPeripheral(id) → connects to a specific peripheral by UUID/address
 *   - disconnectPeripheral(id) → disconnects
 *   - readBatteryLevel(id) → reads the Battery Service characteristic
 *   - subscribeToFrameEvents(id) → subscribes to frame-alignment characteristic
 *     notifications; fires 'dockEvent' events via the EventEmitter
 */

import { requireNativeModule } from 'expo';

/**
 * The native module interface.
 * Methods mirror the AsyncFunction definitions in ios/DockBleModule.swift
 * and android/.../DockBleModule.kt.
 *
 * All methods currently return simulated/stub values — see native skeletons.
 */
export interface DockBleNativeModule {
  /**
   * Request BLE permissions (iOS: CBCentralManager authorization,
   * Android: BLUETOOTH_SCAN + BLUETOOTH_CONNECT).
   * Returns 'granted' | 'denied' | 'restricted'.
   *
   * BLE PLUG-IN: iOS — check CBManagerAuthorization via CBCentralManager.
   *   Android — use ActivityCompat.requestPermissions for BLUETOOTH_SCAN +
   *   BLUETOOTH_CONNECT (API 31+) or BLUETOOTH (legacy).
   */
  requestBlePermissions(): Promise<'granted' | 'denied' | 'restricted'>;

  /**
   * Start a BLE peripheral scan for the dock service UUID.
   * Returns array of discovered peripheral IDs (stubs return [] immediately).
   *
   * BLE PLUG-IN: iOS — CBCentralManager.scanForPeripherals(withServices: [DOCK_SERVICE_UUID]).
   *   Android — BluetoothLeScanner.startScan(filters, settings, callback).
   */
  startScan(timeoutMs: number): Promise<string[]>;

  /**
   * Stop an in-progress BLE scan.
   *
   * BLE PLUG-IN: iOS — CBCentralManager.stopScan().
   *   Android — BluetoothLeScanner.stopScan(callback).
   */
  stopScan(): Promise<void>;

  /**
   * Connect to a specific dock peripheral by ID.
   * Returns the GATT/CoreBluetooth connection state string.
   *
   * BLE PLUG-IN: iOS — CBCentralManager.connect(peripheral, options: nil).
   *   Android — BluetoothDevice.connectGatt(context, false, gattCallback).
   */
  connectPeripheral(peripheralId: string): Promise<string>;

  /**
   * Disconnect from the currently connected peripheral.
   *
   * BLE PLUG-IN: iOS — CBCentralManager.cancelPeripheralConnection(peripheral).
   *   Android — BluetoothGatt.disconnect() + close().
   */
  disconnectPeripheral(peripheralId: string): Promise<void>;

  /**
   * Read the dock battery level from the BLE Battery Service (UUID 0x180F,
   * characteristic 0x2A19). Returns 0–100, or -1 if unavailable.
   *
   * BLE PLUG-IN: iOS — peripheral.readValue(for: batteryCharacteristic).
   *   Android — gatt.readCharacteristic(batteryCharacteristic).
   */
  readBatteryLevel(peripheralId: string): Promise<number>;

  /**
   * Subscribe to dock frame-alignment and status characteristic notifications.
   * The native layer forwards decoded notifications via the 'dockEvent'
   * EventEmitter event.
   *
   * BLE PLUG-IN: iOS — peripheral.setNotifyValue(true, for: frameCharacteristic).
   *   The CBPeripheralDelegate.didUpdateValueFor characteristic callback
   *   decodes the notification and calls sendEvent('dockEvent', payload).
   *   Android — gatt.setCharacteristicNotification(frameChar, true).
   *   BluetoothGattDescriptor for CCCD (0x2902) write to enable notifications.
   *   BluetoothGattCallback.onCharacteristicChanged decodes + sends event.
   */
  subscribeToFrameEvents(peripheralId: string): Promise<void>;
}

export default requireNativeModule<DockBleNativeModule>('DockBle');
