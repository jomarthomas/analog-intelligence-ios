//
//  PurchaseState.swift
//  Analog Intelligence
//
//  State management for user's Pro status
//

import Foundation
import StoreKit

/// Represents the user's current Pro subscription status
@MainActor
class PurchaseState: ObservableObject {
    /// Singleton instance
    static let shared = PurchaseState()

    /// Whether the user has Pro access
    @Published private(set) var isPro: Bool = false

    /// Current purchase state
    @Published private(set) var purchaseStatus: PurchaseStatus = .unknown

    /// Available products from the App Store
    @Published private(set) var availableProducts: [Product] = []

    /// Error message if any
    @Published var errorMessage: String?

    /// Purchase date for tracking
    @Published private(set) var purchaseDate: Date?

    /// Transaction ID for support and debugging
    @Published private(set) var transactionId: String?

    /// Receipt data for validation
    private(set) var receiptData: Data?

    /// Number of restored purchases
    @Published private(set) var restoredPurchaseCount: Int = 0

    // MARK: - Storage Keys

    private let userDefaultsKey = "com.analogintelligence.isPro"
    private let purchaseDateKey = "com.analogintelligence.purchaseDate"
    private let transactionIdKey = "com.analogintelligence.transactionId"
    private let receiptDataKey = "com.analogintelligence.receiptData"

    private init() {
        // Load persisted Pro status
        loadPersistedState()
        purchaseStatus = isPro ? .purchased : .notPurchased
    }

    // MARK: - State Persistence

    /// Load all persisted purchase state
    private func loadPersistedState() {
        isPro = UserDefaults.standard.bool(forKey: userDefaultsKey)

        if let timestamp = UserDefaults.standard.object(forKey: purchaseDateKey) as? TimeInterval {
            purchaseDate = Date(timeIntervalSince1970: timestamp)
        }

        transactionId = UserDefaults.standard.string(forKey: transactionIdKey)
        receiptData = UserDefaults.standard.data(forKey: receiptDataKey)

        print("Loaded persisted state: isPro=\(isPro), transactionId=\(transactionId ?? "none")")
    }

    /// Save all purchase state to UserDefaults
    private func persistState() {
        UserDefaults.standard.set(isPro, forKey: userDefaultsKey)

        if let date = purchaseDate {
            UserDefaults.standard.set(date.timeIntervalSince1970, forKey: purchaseDateKey)
        }

        if let txnId = transactionId {
            UserDefaults.standard.set(txnId, forKey: transactionIdKey)
        }

        if let receipt = receiptData {
            UserDefaults.standard.set(receipt, forKey: receiptDataKey)
        }

        UserDefaults.standard.synchronize()
    }

    /// Update Pro status and persist it
    func updateProStatus(_ status: Bool, transactionId: String? = nil, purchaseDate: Date? = nil) {
        isPro = status

        if status {
            self.transactionId = transactionId
            self.purchaseDate = purchaseDate ?? Date()
            purchaseStatus = .purchased
        } else {
            purchaseStatus = .notPurchased
        }

        persistState()
        print("Updated Pro status: \(status), txnId: \(transactionId ?? "none")")
    }

    /// Update purchase status
    func updatePurchaseStatus(_ status: PurchaseStatus) {
        purchaseStatus = status
        if case .purchased = status {
            isPro = true
            persistState()
        }
    }

    /// Update receipt data
    func updateReceiptData(_ data: Data?) {
        receiptData = data
        if let data = data {
            UserDefaults.standard.set(data, forKey: receiptDataKey)
        }
    }

    /// Update restored purchase count
    func updateRestoredCount(_ count: Int) {
        restoredPurchaseCount = count
    }

    /// Update available products
    func updateAvailableProducts(_ products: [Product]) {
        availableProducts = products
    }

    /// Set error message
    func setError(_ message: String) {
        errorMessage = message
    }

    /// Clear error message
    func clearError() {
        errorMessage = nil
    }

    /// Reset all purchase state (for testing or logout)
    func resetPurchaseState() {
        isPro = false
        purchaseDate = nil
        transactionId = nil
        receiptData = nil
        restoredPurchaseCount = 0
        purchaseStatus = .notPurchased

        UserDefaults.standard.removeObject(forKey: userDefaultsKey)
        UserDefaults.standard.removeObject(forKey: purchaseDateKey)
        UserDefaults.standard.removeObject(forKey: transactionIdKey)
        UserDefaults.standard.removeObject(forKey: receiptDataKey)
        UserDefaults.standard.synchronize()

        print("Reset all purchase state")
    }

    /// Get the Pro Unlock product if available
    var proUnlockProduct: Product? {
        availableProducts.first { $0.id == ProductIdentifiers.proUnlock }
    }

    /// Formatted price for Pro Unlock
    var proUnlockPrice: String? {
        proUnlockProduct?.displayPrice
    }

    /// Formatted purchase date string
    var formattedPurchaseDate: String? {
        guard let date = purchaseDate else { return nil }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }

    /// Check if purchase is recent (within 24 hours)
    var isRecentPurchase: Bool {
        guard let date = purchaseDate else { return false }
        return Date().timeIntervalSince(date) < 86400 // 24 hours
    }
}

/// Represents the current state of a purchase
enum PurchaseStatus: Equatable {
    case unknown
    case notPurchased
    case purchasing
    case purchased
    case failed(String)
    case cancelled
    case pending
    case restored
    case restoring

    var displayMessage: String {
        switch self {
        case .unknown:
            return "Loading..."
        case .notPurchased:
            return "Not purchased"
        case .purchasing:
            return "Processing purchase..."
        case .purchased:
            return "Purchase successful!"
        case .failed(let error):
            return "Purchase failed: \(error)"
        case .cancelled:
            return "Purchase cancelled"
        case .pending:
            return "Purchase pending approval..."
        case .restored:
            return "Purchase restored!"
        case .restoring:
            return "Restoring purchases..."
        }
    }

    var isLoading: Bool {
        switch self {
        case .purchasing, .pending, .restoring:
            return true
        default:
            return false
        }
    }

    var isSuccess: Bool {
        switch self {
        case .purchased, .restored:
            return true
        default:
            return false
        }
    }

    var isFailed: Bool {
        switch self {
        case .failed:
            return true
        default:
            return false
        }
    }
}
