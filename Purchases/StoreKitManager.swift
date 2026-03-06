//
//  StoreKitManager.swift
//  Analog Intelligence
//
//  StoreKit 2 integration for in-app purchases
//

import Foundation
import StoreKit

/// Manages all StoreKit 2 operations including purchases, restoration, and transaction updates
@MainActor
class StoreKitManager: ObservableObject {
    /// Singleton instance
    static let shared = StoreKitManager()

    /// Purchase state manager
    private let purchaseState = PurchaseState.shared

    /// Transaction update listener task
    private var updateListenerTask: Task<Void, Never>?

    /// Pending transactions task
    private var pendingTransactionsTask: Task<Void, Never>?

    /// Receipt validator
    private let receiptValidator = ReceiptValidator()

    /// Retry configuration
    private let maxRetries = 3
    private let retryDelay: TimeInterval = 2.0

    private init() {
        // Start listening for transaction updates
        updateListenerTask = listenForTransactions()

        // Load products and check entitlements on init
        Task {
            await loadProducts()
            await handlePendingTransactions()
            await updateCustomerProductStatus()
            await validateLocalReceipt()
        }
    }

    deinit {
        updateListenerTask?.cancel()
        pendingTransactionsTask?.cancel()
    }

    // MARK: - Product Loading

    /// Load products from the App Store with retry logic
    func loadProducts() async {
        var attempts = 0
        var lastError: Error?

        while attempts < maxRetries {
            do {
                let products = try await Product.products(for: ProductIdentifiers.allProducts)
                purchaseState.updateAvailableProducts(products)
                print("✓ Loaded \(products.count) products from App Store")
                for product in products {
                    print("  - \(product.displayName): \(product.displayPrice)")
                }
                return
            } catch {
                attempts += 1
                lastError = error
                print("✗ Failed to load products (attempt \(attempts)/\(maxRetries)): \(error.localizedDescription)")

                if attempts < maxRetries {
                    try? await Task.sleep(nanoseconds: UInt64(retryDelay * Double(NSEC_PER_SEC)))
                }
            }
        }

        let errorMessage = lastError?.localizedDescription ?? "Unknown error"
        purchaseState.setError("Failed to load products after \(maxRetries) attempts: \(errorMessage)")
    }

    // MARK: - Purchase Flow

    /// Purchase the Pro Unlock product
    func purchaseProUnlock() async {
        guard let product = purchaseState.proUnlockProduct else {
            let error = PurchaseError.productNotAvailable
            purchaseState.setError(error.userMessage)
            logError(error)
            return
        }

        await purchase(product)
    }

    /// Purchase a specific product with comprehensive error handling
    func purchase(_ product: Product) async {
        purchaseState.updatePurchaseStatus(.purchasing)
        purchaseState.clearError()

        do {
            let result = try await product.purchase()

            switch result {
            case .success(let verification):
                // Check verification result
                let transaction = try checkVerified(verification)

                // Validate receipt with Apple
                await validateReceipt(transaction: transaction)

                // Save transaction details
                purchaseState.updateProStatus(
                    true,
                    transactionId: String(transaction.id),
                    purchaseDate: transaction.purchaseDate
                )

                // Update Pro status
                await updateCustomerProductStatus()

                // Finish the transaction
                await transaction.finish()

                purchaseState.updatePurchaseStatus(.purchased)
                print("✓ Purchase successful: \(product.displayName)")
                print("  Transaction ID: \(transaction.id)")
                print("  Purchase Date: \(transaction.purchaseDate)")

            case .userCancelled:
                purchaseState.updatePurchaseStatus(.cancelled)
                print("○ Purchase cancelled by user")

            case .pending:
                // Handle deferred purchases (Ask to Buy)
                purchaseState.updatePurchaseStatus(.pending)
                print("◷ Purchase pending (requires approval)")
                print("  This purchase requires approval. You'll be notified when it's ready.")

            @unknown default:
                let error = PurchaseError.unknownResult
                purchaseState.updatePurchaseStatus(.failed(error.userMessage))
                purchaseState.setError(error.userMessage)
                logError(error)
            }

        } catch StoreError.failedVerification {
            let error = PurchaseError.verificationFailed
            purchaseState.updatePurchaseStatus(.failed(error.userMessage))
            purchaseState.setError(error.userMessage)
            logError(error)

        } catch let error as StoreKitError {
            handleStoreKitError(error)

        } catch {
            let purchaseError = PurchaseError.purchaseFailed(error.localizedDescription)
            purchaseState.updatePurchaseStatus(.failed(purchaseError.userMessage))
            purchaseState.setError(purchaseError.userMessage)
            logError(purchaseError, underlyingError: error)
        }
    }

    // MARK: - Restore Purchases

    /// Restore previously purchased products with enhanced feedback
    func restorePurchases() async {
        purchaseState.updatePurchaseStatus(.restoring)
        purchaseState.clearError()
        purchaseState.updateRestoredCount(0)

        print("Starting purchase restoration...")

        var attempts = 0
        var lastError: Error?

        while attempts < maxRetries {
            do {
                // Sync with the App Store
                try await AppStore.sync()
                print("✓ Successfully synced with App Store")

                // Count restored purchases
                var restoredCount = 0
                var restoredTransactions: [Transaction] = []

                for await result in Transaction.currentEntitlements {
                    do {
                        let transaction = try checkVerified(result)
                        if transaction.productID == ProductIdentifiers.proUnlock {
                            restoredCount += 1
                            restoredTransactions.append(transaction)
                            print("  Found Pro purchase: \(transaction.id)")
                        }
                    } catch {
                        print("  ✗ Failed to verify transaction: \(error)")
                    }
                }

                // Update customer product status
                await updateCustomerProductStatus()

                if purchaseState.isPro {
                    purchaseState.updateRestoredCount(restoredCount)
                    purchaseState.updatePurchaseStatus(.restored)

                    // Save most recent transaction details
                    if let mostRecent = restoredTransactions.max(by: { $0.purchaseDate < $1.purchaseDate }) {
                        purchaseState.updateProStatus(
                            true,
                            transactionId: String(mostRecent.id),
                            purchaseDate: mostRecent.purchaseDate
                        )
                    }

                    print("✓ Restored \(restoredCount) purchase(s) successfully")
                } else {
                    purchaseState.updatePurchaseStatus(.notPurchased)
                    let error = PurchaseError.noPurchasesToRestore
                    purchaseState.setError(error.userMessage)
                    print("○ No purchases found to restore")
                }

                return

            } catch {
                attempts += 1
                lastError = error
                print("✗ Restore failed (attempt \(attempts)/\(maxRetries)): \(error.localizedDescription)")

                if attempts < maxRetries {
                    try? await Task.sleep(nanoseconds: UInt64(retryDelay * Double(NSEC_PER_SEC)))
                }
            }
        }

        let error = PurchaseError.restoreFailed(lastError?.localizedDescription ?? "Unknown error")
        purchaseState.updatePurchaseStatus(.failed(error.userMessage))
        purchaseState.setError(error.userMessage)
        logError(error, underlyingError: lastError)
    }

    // MARK: - Transaction Verification

    /// Verify a transaction and return the verified transaction
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified:
            // StoreKit has determined the transaction is not verified
            throw StoreError.failedVerification
        case .verified(let safe):
            // The transaction is verified
            return safe
        }
    }

    // MARK: - Entitlement Checking

    /// Check and update the user's current entitlements
    func updateCustomerProductStatus() async {
        var hasPro = false
        var mostRecentTransaction: Transaction?

        print("Checking current entitlements...")

        // Iterate through all current entitlements
        for await result in Transaction.currentEntitlements {
            do {
                let transaction = try checkVerified(result)

                // Check if this is the Pro Unlock product
                if transaction.productID == ProductIdentifiers.proUnlock {
                    hasPro = true

                    // Track most recent transaction
                    if mostRecentTransaction == nil ||
                       transaction.purchaseDate > (mostRecentTransaction?.purchaseDate ?? .distantPast) {
                        mostRecentTransaction = transaction
                    }

                    print("✓ Pro entitlement found: \(transaction.id)")
                }

            } catch {
                print("✗ Failed to verify transaction: \(error.localizedDescription)")
                logError(PurchaseError.verificationFailed, underlyingError: error)
            }
        }

        // Update Pro status with transaction details
        if hasPro, let transaction = mostRecentTransaction {
            purchaseState.updateProStatus(
                true,
                transactionId: String(transaction.id),
                purchaseDate: transaction.purchaseDate
            )
            print("✓ User has Pro access (Transaction: \(transaction.id))")
        } else {
            purchaseState.updateProStatus(false)
            print("○ User is on free tier")
        }
    }

    // MARK: - Transaction Updates

    /// Listen for transaction updates from the App Store
    private func listenForTransactions() -> Task<Void, Never> {
        return Task {
            print("Started listening for transaction updates...")

            // Iterate through any transactions that don't come from a direct call to `purchase()`
            for await result in Transaction.updates {
                do {
                    let transaction = try self.checkVerified(result)

                    print("Received transaction update: \(transaction.productID)")
                    print("  Transaction ID: \(transaction.id)")
                    print("  Purchase Date: \(transaction.purchaseDate)")

                    // Handle refunds
                    if let revocationDate = transaction.revocationDate {
                        print("  Transaction was revoked on: \(revocationDate)")
                        if transaction.productID == ProductIdentifiers.proUnlock {
                            self.purchaseState.updateProStatus(false)
                            print("  Pro access revoked due to refund")
                        }
                    }

                    // Update customer product status
                    await self.updateCustomerProductStatus()

                    // Always finish a transaction
                    await transaction.finish()

                    print("✓ Transaction update processed: \(transaction.productID)")

                    // If this was a pending transaction that completed
                    if self.purchaseState.purchaseStatus == .pending {
                        self.purchaseState.updatePurchaseStatus(.purchased)
                        print("  Pending purchase completed!")
                    }

                } catch {
                    print("✗ Transaction verification failed: \(error.localizedDescription)")
                    self.logError(PurchaseError.verificationFailed, underlyingError: error)
                }
            }
        }
    }

    /// Handle any pending transactions on app launch
    private func handlePendingTransactions() async {
        print("Checking for pending transactions...")

        var pendingCount = 0

        for await result in Transaction.unfinished {
            do {
                let transaction = try checkVerified(result)

                print("Found unfinished transaction: \(transaction.productID)")
                print("  Transaction ID: \(transaction.id)")

                // Update entitlements
                await updateCustomerProductStatus()

                // Finish the transaction
                await transaction.finish()

                pendingCount += 1
                print("  Finished pending transaction")

            } catch {
                print("✗ Failed to verify pending transaction: \(error)")
            }
        }

        if pendingCount > 0 {
            print("✓ Processed \(pendingCount) pending transaction(s)")
        } else {
            print("○ No pending transactions found")
        }
    }

    // MARK: - Receipt Validation

    /// Validate receipt with Apple's servers
    private func validateReceipt(transaction: Transaction) async {
        do {
            // Get the app receipt
            guard let receiptURL = Bundle.main.appStoreReceiptURL,
                  let receiptData = try? Data(contentsOf: receiptURL) else {
                print("⚠ No receipt data available")
                return
            }

            // Store receipt data locally
            purchaseState.updateReceiptData(receiptData)

            // Validate with Apple (in production, this should go through your backend)
            let isValid = await receiptValidator.validate(receiptData)

            if isValid {
                print("✓ Receipt validated successfully")
            } else {
                print("⚠ Receipt validation failed - continuing with StoreKit verification")
            }

        } catch {
            print("⚠ Receipt validation error: \(error.localizedDescription)")
            // Don't fail the purchase if receipt validation fails
            // StoreKit 2's built-in verification is the primary check
        }
    }

    /// Validate local receipt on app launch
    private func validateLocalReceipt() async {
        guard let receiptData = purchaseState.receiptData else {
            print("○ No local receipt to validate")
            return
        }

        print("Validating local receipt...")
        let isValid = await receiptValidator.validate(receiptData)

        if !isValid && purchaseState.isPro {
            print("⚠ Local receipt validation failed - refreshing from App Store")
            await updateCustomerProductStatus()
        }
    }

    // MARK: - Error Handling

    /// Handle StoreKit-specific errors with user-friendly messages
    private func handleStoreKitError(_ error: StoreKitError) {
        let purchaseError: PurchaseError

        switch error {
        case .networkError:
            purchaseError = .networkError("Please check your internet connection and try again.")

        case .userCancelled:
            purchaseError = .userCancelled
            purchaseState.updatePurchaseStatus(.cancelled)
            return // Don't show error for user cancellation

        case .notAvailableInStorefront:
            purchaseError = .notAvailableInRegion

        case .notEntitled:
            purchaseError = .notEntitled

        default:
            purchaseError = .purchaseFailed(error.localizedDescription)
        }

        purchaseState.updatePurchaseStatus(.failed(purchaseError.userMessage))
        purchaseState.setError(purchaseError.userMessage)
        logError(purchaseError, underlyingError: error)
    }

    /// Log errors for debugging
    private func logError(_ error: PurchaseError, underlyingError: Error? = nil) {
        print("✗ PurchaseError: \(error.debugDescription)")
        if let underlying = underlyingError {
            print("  Underlying error: \(underlying.localizedDescription)")
        }

        // In production, send to analytics/crash reporting
        // Example: Analytics.logError(error)
    }

    // MARK: - Helper Methods

    /// Check if a specific product has been purchased
    func isPurchased(_ productID: String) async -> Bool {
        for await result in Transaction.currentEntitlements {
            do {
                let transaction = try checkVerified(result)
                if transaction.productID == productID {
                    return true
                }
            } catch {
                print("✗ Failed to verify transaction: \(error.localizedDescription)")
            }
        }
        return false
    }

    /// Get all current entitlements
    func getAllEntitlements() async -> [Transaction] {
        var entitlements: [Transaction] = []

        for await result in Transaction.currentEntitlements {
            do {
                let transaction = try checkVerified(result)
                entitlements.append(transaction)
            } catch {
                print("✗ Failed to verify transaction: \(error)")
            }
        }

        return entitlements
    }

    /// Force refresh receipt from App Store
    func refreshReceipt() async throws {
        print("Requesting receipt refresh from App Store...")
        try await AppStore.sync()
        await updateCustomerProductStatus()
        print("✓ Receipt refreshed successfully")
    }
}

// MARK: - Receipt Validator

/// Handles receipt validation with Apple's servers
class ReceiptValidator {
    /// Validate receipt data (basic implementation)
    /// In production, this should communicate with your backend server
    /// which then validates with Apple's verifyReceipt endpoint
    func validate(_ receiptData: Data) async -> Bool {
        // Basic validation - just check if receipt exists and is not empty
        guard !receiptData.isEmpty else {
            return false
        }

        // In a production app, you would:
        // 1. Send receipt to your backend server
        // 2. Backend validates with Apple's verifyReceipt API
        // 3. Return validation result
        //
        // Example implementation:
        // let result = try await validateWithBackend(receiptData)
        // return result.isValid

        print("Receipt validation: Basic checks passed (\(receiptData.count) bytes)")
        return true
    }

    /// Validate with Apple's servers (through your backend)
    /// This is a placeholder for production implementation
    private func validateWithBackend(_ receiptData: Data) async throws -> ValidationResult {
        // Implement your backend validation here
        // POST to your server: /api/validate-receipt
        // Server validates with Apple and returns result

        throw ValidationError.notImplemented
    }
}

struct ValidationResult {
    let isValid: Bool
    let expirationDate: Date?
    let productIds: [String]
}

enum ValidationError: Error {
    case notImplemented
    case invalidReceipt
    case serverError
}

// MARK: - Custom Errors

/// Custom StoreKit errors
enum StoreError: Error {
    case failedVerification
}

/// Comprehensive purchase error types
enum PurchaseError: Error {
    case productNotAvailable
    case verificationFailed
    case purchaseFailed(String)
    case restoreFailed(String)
    case noPurchasesToRestore
    case networkError(String)
    case userCancelled
    case notAvailableInRegion
    case notEntitled
    case unknownResult

    /// User-friendly error message
    var userMessage: String {
        switch self {
        case .productNotAvailable:
            return "This product is currently unavailable. Please try again later."

        case .verificationFailed:
            return "Unable to verify your purchase. Please contact support if this persists."

        case .purchaseFailed(let details):
            return "Purchase failed: \(details). Please try again."

        case .restoreFailed(let details):
            return "Could not restore purchases: \(details). Please try again."

        case .noPurchasesToRestore:
            return "No previous purchases found. Please purchase Pro to unlock premium features."

        case .networkError(let details):
            return "Network error: \(details)"

        case .userCancelled:
            return "Purchase cancelled"

        case .notAvailableInRegion:
            return "This product is not available in your region."

        case .notEntitled:
            return "You don't have access to this product. Please purchase it first."

        case .unknownResult:
            return "An unexpected error occurred. Please try again."
        }
    }

    /// Debug description for logging
    var debugDescription: String {
        switch self {
        case .productNotAvailable:
            return "Product not available in store"
        case .verificationFailed:
            return "Transaction verification failed"
        case .purchaseFailed(let details):
            return "Purchase failed: \(details)"
        case .restoreFailed(let details):
            return "Restore failed: \(details)"
        case .noPurchasesToRestore:
            return "No purchases to restore"
        case .networkError(let details):
            return "Network error: \(details)"
        case .userCancelled:
            return "User cancelled purchase"
        case .notAvailableInRegion:
            return "Product not available in user's region"
        case .notEntitled:
            return "User not entitled to product"
        case .unknownResult:
            return "Unknown purchase result"
        }
    }
}
