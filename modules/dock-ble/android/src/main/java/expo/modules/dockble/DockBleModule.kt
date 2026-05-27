package expo.modules.dockble

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * DockBleModule (Android) — Phase-3 BLE dock integration skeleton.
 *
 * CURRENT STATE: All BLE methods return stub/simulated values.
 * The real state-machine logic lives in TypeScript (DockStateMachine.ts +
 * DockService.ts). This native module handles:
 *   1. BLE permission management (BLUETOOTH_SCAN / BLUETOOTH_CONNECT).
 *   2. Android BLE scan / connect skeletons via BluetoothLeScanner / BluetoothGatt.
 *   3. EventEmitter surface for forwarding dock BLE events to JS.
 *
 * BLE PLUG-IN INSTRUCTIONS
 * ─────────────────────────
 * When real BLE hardware is available, fill in the MARK: BLE sections below:
 *
 * 1. Inject BluetoothAdapter via appContext.reactContext:
 *      val bluetoothManager = context.getSystemService(BluetoothManager::class.java)
 *      val bluetoothAdapter = bluetoothManager?.adapter
 *
 * 2. In startScan(): call
 *      bluetoothAdapter.bluetoothLeScanner.startScan(
 *        listOf(ScanFilter.Builder().setServiceUuid(ParcelUuid(DOCK_SERVICE_UUID)).build()),
 *        ScanSettings.Builder().build(),
 *        scanCallback
 *      )
 *    Collect ScanResult.device in a map, stop after timeoutMs, resolve.
 *
 * 3. In connectPeripheral(peripheralId): retrieve the BluetoothDevice by address
 *    and call device.connectGatt(context, false, gattCallback).
 *    In onConnectionStateChange(GATT_SUCCESS, STATE_CONNECTED): discover services.
 *    In onServicesDiscovered(): resolve the connect promise.
 *
 * 4. In subscribeToFrameEvents(peripheralId): enable notifications on the
 *    frame-alignment and dock-status characteristics:
 *      gatt.setCharacteristicNotification(characteristic, true)
 *      val descriptor = characteristic.getDescriptor(CCCD_UUID)
 *      descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
 *      gatt.writeDescriptor(descriptor)
 *    In onCharacteristicChanged: decode the byte payload and call
 *      sendEvent("dockEvent", mapOf("type" to "frameAligned", ...))
 *
 * 5. In readBatteryLevel(peripheralId): gatt.readCharacteristic(batteryChar).
 *    Resolve in onCharacteristicRead with value[0].toInt() & 0xFF.
 *
 * Known dock BLE service UUID (to be assigned by firmware team):
 *   val DOCK_SERVICE_UUID = UUID.fromString("XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX")
 * Known frame-alignment characteristic UUID:
 *   val FRAME_ALIGNMENT_CHAR_UUID = UUID.fromString("YYYYYYYY-YYYY-YYYY-YYYY-YYYYYYYYYYYY")
 * Known CCCD descriptor UUID (standard):
 *   val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
 *
 * Required AndroidManifest permissions (add to app's AndroidManifest.xml):
 *   <!-- API 31+ -->
 *   <uses-permission android:name="android.permission.BLUETOOTH_SCAN"
 *     android:usesPermissionFlags="neverForLocation" />
 *   <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
 *   <!-- Legacy API 28-30 -->
 *   <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
 *   <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
 *   <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
 */
class DockBleModule : Module() {

    // BLE PLUG-IN: private var bluetoothAdapter: BluetoothAdapter? = null
    // BLE PLUG-IN: private var bluetoothGatt: BluetoothGatt? = null
    // BLE PLUG-IN: private val discoveredDevices: MutableMap<String, BluetoothDevice> = mutableMapOf()

    override fun definition() = ModuleDefinition {
        Name("DockBle")

        // MARK: - EventEmitter
        //
        // "dockEvent" is fired by the native layer when a BLE GATT characteristic
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
        // BLE PLUG-IN: Call `sendEvent("dockEvent", mapOf(...))` inside the
        //   BluetoothGattCallback.onCharacteristicChanged callback after decoding
        //   the characteristic notification bytes.
        Events("dockEvent")

        // MARK: - requestBlePermissions() -> String

        // Returns "granted" | "denied" | "restricted".
        // STUB: returns "granted" unconditionally (simulation mode does not need BLE).
        //
        // BLE PLUG-IN: Check / request BLUETOOTH_SCAN + BLUETOOTH_CONNECT at runtime:
        //   val context = appContext.reactContext ?: return "restricted"
        //   val scanGranted = ContextCompat.checkSelfPermission(context,
        //     Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
        //   val connectGranted = ContextCompat.checkSelfPermission(context,
        //     Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        //   return if (scanGranted && connectGranted) "granted" else "denied"
        AsyncFunction("requestBlePermissions") Coroutine { ->
            "granted"
        }

        // MARK: - startScan(timeoutMs) -> List<String>

        // STUB: resolves immediately with an empty list.
        //
        // BLE PLUG-IN: Start BluetoothLeScanner.startScan() with a ScanFilter on the
        //   dock service UUID. Collect discovered device addresses in discoveredDevices.
        //   Stop the scan after timeoutMs and return the collected address strings.
        AsyncFunction("startScan") Coroutine { _: Int ->
            // BLE PLUG-IN: Start BLE scan here.
            emptyList<String>()
        }

        // MARK: - stopScan() -> Unit

        // STUB: no-op.
        //
        // BLE PLUG-IN: bluetoothAdapter?.bluetoothLeScanner?.stopScan(scanCallback)
        AsyncFunction("stopScan") Coroutine { ->
            // BLE PLUG-IN: stop the BLE scan.
        }

        // MARK: - connectPeripheral(peripheralId) -> String

        // STUB: returns "connected" immediately.
        //
        // BLE PLUG-IN:
        //   val device = discoveredDevices[peripheralId]
        //     ?: throw PeripheralNotFoundException()
        //   bluetoothGatt = device.connectGatt(context, false, gattCallback)
        //   // Resolve in gattCallback.onConnectionStateChange(STATE_CONNECTED)
        AsyncFunction("connectPeripheral") Coroutine { _: String ->
            "connected"
        }

        // MARK: - disconnectPeripheral(peripheralId) -> Unit

        // STUB: no-op.
        //
        // BLE PLUG-IN:
        //   bluetoothGatt?.disconnect()
        //   bluetoothGatt?.close()
        //   bluetoothGatt = null
        AsyncFunction("disconnectPeripheral") Coroutine { _: String ->
            // BLE PLUG-IN: disconnect and close GATT.
        }

        // MARK: - readBatteryLevel(peripheralId) -> Int

        // STUB: returns simulated battery level 85.
        //
        // BLE PLUG-IN:
        //   val service = bluetoothGatt?.getService(BATTERY_SERVICE_UUID)
        //   val characteristic = service?.getCharacteristic(BATTERY_LEVEL_CHAR_UUID)
        //   bluetoothGatt?.readCharacteristic(characteristic)
        //   // Resolve in gattCallback.onCharacteristicRead with value[0].toInt() and 0xFF
        AsyncFunction("readBatteryLevel") Coroutine { _: String ->
            85 // Simulated battery level
        }

        // MARK: - subscribeToFrameEvents(peripheralId) -> Unit

        // STUB: no-op. In simulation mode, events come from SimulatedDock via JS timers.
        //
        // BLE PLUG-IN:
        //   val frameChar = bluetoothGatt
        //     ?.getService(DOCK_SERVICE_UUID)
        //     ?.getCharacteristic(FRAME_ALIGNMENT_CHAR_UUID)
        //     ?: throw PeripheralNotFoundException()
        //   bluetoothGatt?.setCharacteristicNotification(frameChar, true)
        //   val descriptor = frameChar.getDescriptor(CCCD_UUID)
        //   descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
        //   bluetoothGatt?.writeDescriptor(descriptor)
        //   // In onCharacteristicChanged: decode + sendEvent("dockEvent", payload)
        AsyncFunction("subscribeToFrameEvents") Coroutine { _: String ->
            // BLE PLUG-IN: enable GATT characteristic notifications here.
        }
    }
}

// MARK: - Exceptions

internal class BlePermissionDeniedException :
    CodedException(message = "Bluetooth permission denied")

internal class BleUnavailableException :
    CodedException(message = "Bluetooth is not available on this device")

internal class PeripheralNotFoundException :
    CodedException(message = "Dock peripheral not found or not connected")
