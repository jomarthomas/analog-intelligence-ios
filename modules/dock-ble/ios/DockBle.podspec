require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'DockBle'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = package['author']
  s.homepage       = package['homepage']
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/expo/expo.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # CoreBluetooth is imported by the BLE skeleton but currently only stubs are
  # active. When real BLE is wired, CBCentralManager + CBPeripheral APIs are
  # used from this framework. No additional pods are required for the stub.
  #
  # BLE PLUG-IN: if using react-native-ble-plx, add its podspec dependency here
  # instead of implementing native CoreBluetooth directly:
  #   s.dependency 'react-native-ble-plx'  # (do NOT add until orchestrator approves)
  s.frameworks = 'CoreBluetooth'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
