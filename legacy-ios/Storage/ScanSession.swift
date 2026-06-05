//
//  ScanSession.swift
//  AnalogIntelligence
//
//  Model representing a scanning session or roll of film.
//

import Foundation

/// Represents a batch scanning session (roll of film)
struct ScanSession: Codable, Identifiable {

    // MARK: - Properties

    let id: UUID
    let createdDate: Date
    var lastModifiedDate: Date

    /// Session metadata
    var name: String
    var notes: String?

    /// Film information
    var filmType: FilmType?
    var filmBrand: String?
    var filmSpeed: Int?  // ISO speed (e.g., 400)

    /// Session statistics
    var imageCount: Int
    var sessionState: SessionState

    /// Images in this session
    var imageIds: [UUID]

    // MARK: - Initialization

    init(
        id: UUID = UUID(),
        createdDate: Date = Date(),
        lastModifiedDate: Date = Date(),
        name: String,
        notes: String? = nil,
        filmType: FilmType? = nil,
        filmBrand: String? = nil,
        filmSpeed: Int? = nil,
        imageCount: Int = 0,
        sessionState: SessionState = .active,
        imageIds: [UUID] = []
    ) {
        self.id = id
        self.createdDate = createdDate
        self.lastModifiedDate = lastModifiedDate
        self.name = name
        self.notes = notes
        self.filmType = filmType
        self.filmBrand = filmBrand
        self.filmSpeed = filmSpeed
        self.imageCount = imageCount
        self.sessionState = sessionState
        self.imageIds = imageIds
    }
}

// MARK: - Film Type

enum FilmType: String, Codable, CaseIterable {
    case colorNegative = "Color Negative"
    case colorSlide = "Color Slide"
    case blackAndWhite = "Black & White"
    case infrared = "Infrared"
    case unknown = "Unknown"

    var displayName: String {
        rawValue
    }
}

// MARK: - Session State

enum SessionState: String, Codable {
    case active     // Currently being worked on
    case completed  // All images scanned and processed
    case archived   // Archived for later reference
}

// MARK: - ScanSession Extensions

extension ScanSession {

    /// Get a formatted display name for the session
    var displayName: String {
        if !name.isEmpty {
            return name
        }

        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .none
        return "Roll - \(formatter.string(from: createdDate))"
    }

    /// Get a detailed description for the session
    var detailedDescription: String {
        var parts: [String] = []

        if let filmBrand = filmBrand {
            parts.append(filmBrand)
        }

        if let filmSpeed = filmSpeed {
            parts.append("ISO \(filmSpeed)")
        }

        if let filmType = filmType {
            parts.append(filmType.displayName)
        }

        if parts.isEmpty {
            return "\(imageCount) images"
        } else {
            return parts.joined(separator: " • ") + " • \(imageCount) images"
        }
    }

    /// Check if session is empty
    var isEmpty: Bool {
        imageIds.isEmpty
    }

    /// Add an image to the session
    mutating func addImage(id: UUID) {
        imageIds.append(id)
        imageCount = imageIds.count
        lastModifiedDate = Date()
    }

    /// Remove an image from the session
    mutating func removeImage(id: UUID) {
        imageIds.removeAll { $0 == id }
        imageCount = imageIds.count
        lastModifiedDate = Date()
    }

    /// Update session metadata
    mutating func updateMetadata(
        name: String? = nil,
        notes: String? = nil,
        filmType: FilmType? = nil,
        filmBrand: String? = nil,
        filmSpeed: Int? = nil
    ) {
        if let name = name { self.name = name }
        if let notes = notes { self.notes = notes }
        if let filmType = filmType { self.filmType = filmType }
        if let filmBrand = filmBrand { self.filmBrand = filmBrand }
        if let filmSpeed = filmSpeed { self.filmSpeed = filmSpeed }
        lastModifiedDate = Date()
    }

    /// Mark session as completed
    mutating func markCompleted() {
        sessionState = .completed
        lastModifiedDate = Date()
    }

    /// Archive the session
    mutating func archive() {
        sessionState = .archived
        lastModifiedDate = Date()
    }

    /// Unarchive the session
    mutating func unarchive() {
        sessionState = .active
        lastModifiedDate = Date()
    }
}

// MARK: - Default Sessions

extension ScanSession {

    /// Create a default session with auto-generated name
    static func createDefault() -> ScanSession {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d, yyyy"
        let name = "Roll - \(formatter.string(from: Date()))"

        return ScanSession(name: name)
    }

    /// Create a named session
    static func create(name: String) -> ScanSession {
        ScanSession(name: name)
    }
}

// MARK: - Comparable

extension ScanSession: Comparable {

    static func < (lhs: ScanSession, rhs: ScanSession) -> Bool {
        // Sort by last modified date, most recent first
        lhs.lastModifiedDate > rhs.lastModifiedDate
    }
}
