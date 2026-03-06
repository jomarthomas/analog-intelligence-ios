#!/usr/bin/env ruby
# frozen_string_literal: true

begin
  require 'xcodeproj'
rescue LoadError
  warn "Missing gem 'xcodeproj'. Install it with: gem install xcodeproj"
  exit 1
end

require 'optparse'
require 'pathname'
require 'find'
require 'set'

DEFAULT_SOURCE_DIRS = %w[App Camera Processing Purchases Storage UI].freeze
DEFAULT_EXCLUDE_DIRS = %w[
  .git
  .svn
  .hg
  .idea
  .vscode
  .build
  Build
  DerivedData
  Pods
  Carthage
  node_modules
].freeze

options = {
  project_path: nil,
  target_name: nil,
  source_dirs: DEFAULT_SOURCE_DIRS.dup,
  exclude_dirs: DEFAULT_EXCLUDE_DIRS.dup,
  include_root_swift: true,
  prune_missing: false,
  dry_run: false,
  verbose: false
}

OptionParser.new do |opts|
  opts.banner = "Usage: ruby scripts/sync_xcodeproj_files.rb [options]"

  opts.on('-p', '--project PATH', 'Path to .xcodeproj (default: auto-detect)') do |value|
    options[:project_path] = value
  end

  opts.on('-t', '--target NAME', 'Target name (default: project name or first app target)') do |value|
    options[:target_name] = value
  end

  opts.on('--source-dirs x,y,z', Array, 'Source roots to scan (default: App,Camera,Processing,Purchases,Storage,UI)') do |list|
    options[:source_dirs] = list
  end

  opts.on('--exclude-dirs x,y,z', Array, 'Directory names to skip while scanning') do |list|
    options[:exclude_dirs] = list
  end

  opts.on('--[no-]include-root-swift', 'Include top-level *.swift files (default: true)') do |value|
    options[:include_root_swift] = value
  end

  opts.on('--prune-missing', 'Remove compile entries whose source file no longer exists') do
    options[:prune_missing] = true
  end

  opts.on('--dry-run', 'Show planned changes without writing the project file') do
    options[:dry_run] = true
  end

  opts.on('-v', '--verbose', 'Print per-file actions') do
    options[:verbose] = true
  end

  opts.on('-h', '--help', 'Show help') do
    puts opts
    exit 0
  end
end.parse!

def abort_with(message)
  warn message
  exit 1
end

def autodetect_project
  projects = Dir.glob('*.xcodeproj').sort
  return projects.first if projects.length == 1

  if projects.empty?
    abort_with('No .xcodeproj found in the current directory. Pass --project PATH.')
  end

  abort_with("Multiple .xcodeproj files found: #{projects.join(', ')}. Pass --project PATH.")
end

def collect_swift_files(source_dirs, include_root_swift, exclude_dirs)
  files = []
  exclude_set = exclude_dirs.to_set
  cwd = Pathname.pwd

  source_dirs.each do |dir|
    next unless Dir.exist?(dir)

    Find.find(dir) do |path|
      basename = File.basename(path)

      if File.directory?(path)
        if basename.start_with?('.') || exclude_set.include?(basename)
          Find.prune
        else
          next
        end
      elsif path.end_with?('.swift')
        abs_path = File.expand_path(path)
        files << Pathname.new(abs_path).relative_path_from(cwd).to_s
      end
    end
  end

  if include_root_swift
    Dir.glob('*.swift').sort.each do |path|
      files << path
    end
  end

  files.uniq.sort
end

def find_target(project, explicit_name)
  return project.targets.find { |t| t.name == explicit_name } if explicit_name

  project_basename = File.basename(project.path, '.xcodeproj')
  project.targets.find { |t| t.name == project_basename } ||
    project.targets.find { |t| t.product_type == 'com.apple.product-type.application' } ||
    project.targets.first
end

def find_group_for_abs_path(project, abs_path)
  project.groups.find do |group|
    begin
      group.real_path.expand_path.to_s == abs_path
    rescue StandardError
      false
    end
  end
end

def ensure_group_for_directory(project, rel_dir)
  return project.main_group if rel_dir == '.' || rel_dir.empty?

  cwd = Pathname.pwd
  current = project.main_group
  cumulative = cwd

  rel_dir.split('/').each do |segment|
    cumulative = cumulative.join(segment)
    existing = find_group_for_abs_path(project, cumulative.to_s)

    if existing
      current = existing
      next
    end

    child = current.groups.find { |g| g.path == segment || g.display_name == segment }
    child ||= current.new_group(segment, segment)
    current = child
  end

  current
end

def path_for_display(path)
  abs = File.expand_path(path)
  cwd = Pathname.pwd.to_s
  abs.start_with?("#{cwd}/") ? abs.delete_prefix("#{cwd}/") : path
end

options[:project_path] ||= autodetect_project
abort_with("Project not found: #{options[:project_path]}") unless File.directory?(options[:project_path])

project = Xcodeproj::Project.open(options[:project_path])
target = find_target(project, options[:target_name])
abort_with("Target not found: #{options[:target_name]}") unless target

swift_files = collect_swift_files(options[:source_dirs], options[:include_root_swift], options[:exclude_dirs])
abort_with('No Swift files found based on current scan settings.') if swift_files.empty?

refs_by_abs = Hash.new { |hash, key| hash[key] = [] }
project.files.each do |ref|
  next unless ref.path&.end_with?('.swift')

  begin
    refs_by_abs[ref.real_path.expand_path.to_s] << ref
  rescue StandardError
    next
  end
end

added_refs = []
added_to_target = []

swift_files.each do |rel_path|
  abs_path = File.expand_path(rel_path)
  ref = refs_by_abs[abs_path].first

  unless ref
    group = ensure_group_for_directory(project, File.dirname(rel_path))
    ref = group.new_file(File.basename(rel_path))
    refs_by_abs[abs_path] << ref
    added_refs << rel_path
    puts "[add-ref] #{rel_path}" if options[:verbose]
  end

  unless target.source_build_phase.files_references.include?(ref)
    target.source_build_phase.add_file_reference(ref, true)
    added_to_target << rel_path
    puts "[add-target] #{rel_path}" if options[:verbose]
  end
end

pruned_missing = []
if options[:prune_missing]
  target.source_build_phase.files.each do |build_file|
    ref = build_file.file_ref
    next unless ref&.path&.end_with?('.swift')

    abs_path = begin
      ref.real_path.expand_path.to_s
    rescue StandardError
      nil
    end

    next if abs_path && File.exist?(abs_path)

    display = abs_path ? path_for_display(abs_path) : ref.path
    target.source_build_phase.remove_build_file(build_file)
    pruned_missing << display
    puts "[prune-missing] #{display}" if options[:verbose]
  end
end

if options[:dry_run]
  puts 'Dry run complete. No changes were written.'
else
  project.save
  puts "Saved #{options[:project_path]}"
end

puts "Target: #{target.name}"
puts "Scanned Swift files: #{swift_files.length}"
puts "Added file references: #{added_refs.length}"
puts "Added to target sources: #{added_to_target.length}"
puts "Pruned missing compile entries: #{pruned_missing.length}" if options[:prune_missing]

if options[:verbose]
  puts "\nAdded file references:" unless added_refs.empty?
  added_refs.each { |path| puts "  - #{path}" }

  puts "\nAdded to target sources:" unless added_to_target.empty?
  added_to_target.each { |path| puts "  - #{path}" }

  puts "\nPruned missing compile entries:" unless pruned_missing.empty?
  pruned_missing.each { |path| puts "  - #{path}" }
end
