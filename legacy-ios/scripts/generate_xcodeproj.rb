#!/usr/bin/env ruby
require 'xcodeproj'
require 'fileutils'

PROJECT_NAME = 'AnalogIntelligence'
PROJECT_PATH = "#{PROJECT_NAME}.xcodeproj"

SOURCE_DIRS = %w[App Camera Processing Purchases Storage UI]
ROOT_SWIFT_FILES = %w[AnalogIntelligenceApp.swift RootView.swift]
RESOURCE_FILES = %w[Gemini_Generated_Image_76svll76svll76sv.png]

FileUtils.rm_rf(PROJECT_PATH)
project = Xcodeproj::Project.new(PROJECT_PATH)

target = project.new_target(:application, PROJECT_NAME, :ios, '17.0')

target.build_configurations.each do |config|
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.analogintelligence.app'
  config.build_settings['INFOPLIST_FILE'] = 'Info.plist'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  config.build_settings['CODE_SIGN_STYLE'] = 'Automatic'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  config.build_settings['ASSETCATALOG_COMPILER_GENERATE_SWIFT_ASSET_SYMBOL_EXTENSIONS'] = 'YES'
end

def add_source_files(group, filesystem_path, target)
  Dir.children(filesystem_path).sort.each do |entry|
    next if entry.start_with?('.')

    full_path = File.join(filesystem_path, entry)

    if File.directory?(full_path)
      subgroup = group.find_subpath(entry, true)
      add_source_files(subgroup, full_path, target)
    elsif entry.end_with?('.swift')
      file_ref = group.new_file(full_path)
      target.source_build_phase.add_file_reference(file_ref, true)
    end
  end
end

main_group = project.main_group

SOURCE_DIRS.each do |dir|
  next unless Dir.exist?(dir)
  group = main_group.find_subpath(dir, true)
  add_source_files(group, dir, target)
end

ROOT_SWIFT_FILES.each do |file|
  next unless File.exist?(file)
  file_ref = main_group.new_file(file)
  target.source_build_phase.add_file_reference(file_ref, true)
end

if File.exist?('Info.plist')
  main_group.new_file('Info.plist')
end

RESOURCE_FILES.each do |file|
  next unless File.exist?(file)
  file_ref = main_group.new_file(file)
  target.resources_build_phase.add_file_reference(file_ref, true)
end

project.save
puts "Generated #{PROJECT_PATH}"
