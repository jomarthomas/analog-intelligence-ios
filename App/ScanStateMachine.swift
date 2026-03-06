//
//  ScanStateMachine.swift
//  AnalogIntelligence
//
//  Core state machine for managing scan workflow transitions.
//

import Foundation
import Combine

/// State machine that manages transitions between scan states based on events
@Observable
final class ScanStateMachine {
    // MARK: - Properties

    /// Current state of the scan workflow
    private(set) var currentState: ScanState = .idle

    /// Publisher for state changes (for SwiftUI/Combine observation)
    private let stateSubject = CurrentValueSubject<ScanState, Never>(.idle)
    var statePublisher: AnyPublisher<ScanState, Never> {
        stateSubject.eraseToAnyPublisher()
    }

    /// History of states for debugging and analytics
    private(set) var stateHistory: [StateTransition] = []

    /// Maximum history to keep in memory
    private let maxHistoryCount = 100

    // MARK: - Initialization

    init() {
        recordTransition(from: nil, to: .idle, triggeredBy: "initialization")
    }

    // MARK: - Public API

    /// Process an event and transition to appropriate state
    /// - Parameter event: The event triggering the transition
    /// - Returns: The new state after transition
    @discardableResult
    func handle(_ event: ScanEvent) -> ScanState {
        let previousState = currentState
        let newState = nextState(from: currentState, on: event)

        // Only transition if state actually changes
        guard newState != currentState else {
            return currentState
        }

        // Validate transition is allowed
        guard isTransitionAllowed(from: currentState, to: newState, on: event) else {
            print("⚠️ Invalid transition from \(currentState) to \(newState) on event \(event.description)")
            return currentState
        }

        // Perform transition
        currentState = newState
        stateSubject.send(newState)
        recordTransition(from: previousState, to: newState, triggeredBy: event.description)

        print("✓ State transition: \(previousState.description) → \(newState.description)")

        return newState
    }

    /// Reset state machine to idle
    func reset() {
        let previousState = currentState
        currentState = .idle
        stateSubject.send(.idle)
        recordTransition(from: previousState, to: .idle, triggeredBy: "reset")
        print("✓ State machine reset to idle")
    }

    /// Check if a transition is currently allowed
    func canHandle(_ event: ScanEvent) -> Bool {
        let nextState = nextState(from: currentState, on: event)
        return isTransitionAllowed(from: currentState, to: nextState, on: event)
    }

    // MARK: - State Transition Logic

    /// Determine next state based on current state and event
    private func nextState(from state: ScanState, on event: ScanEvent) -> ScanState {
        switch (state, event) {

        // MARK: Idle State
        case (.idle, .startSession):
            return .calibrating

        // MARK: Calibrating State
        case (.calibrating, .calibrationCompleted):
            return .ready
        case (.calibrating, .calibrationFailed(let reason)):
            return .error(.calibrationFailed(reason: reason))
        case (.calibrating, .errorOccurred(let error)):
            return .error(error)

        // MARK: Ready State
        case (.ready, .captureRequested):
            return .capturing
        case (.ready, .pauseSession):
            return .paused
        case (.ready, .endSession):
            return .idle

        // MARK: Capturing State
        case (.capturing, .captureCompleted(_, _)):
            // Store capture data in event context for processing
            return .processing
        case (.capturing, .captureFailed(let reason)):
            return .error(.captureFailed(reason: reason))
        case (.capturing, .errorOccurred(let error)):
            return .error(error)

        // MARK: Processing State
        case (.processing, .processingCompleted(let result)):
            return .reviewing(frameIndex: result.frameIndex)
        case (.processing, .processingFailed(let reason)):
            return .error(.processingFailed(reason: reason))
        case (.processing, .errorOccurred(let error)):
            return .error(error)

        // MARK: Reviewing State
        case (.reviewing, .reviewCompleted):
            return .exporting
        case (.reviewing, .reviewCanceled):
            return .waitingForFilmAdvance
        case (.reviewing, .pauseSession):
            return .paused

        // MARK: Exporting State
        case (.exporting, .exportCompleted):
            return .waitingForFilmAdvance
        case (.exporting, .exportFailed(let reason)):
            return .error(.exportFailed(reason: reason))
        case (.exporting, .errorOccurred(let error)):
            return .error(error)

        // MARK: Waiting for Film Advance State
        case (.waitingForFilmAdvance, .filmAdvanced):
            return .ready
        case (.waitingForFilmAdvance, .pauseSession):
            return .paused
        case (.waitingForFilmAdvance, .endSession):
            return .idle

        // MARK: Paused State
        case (.paused, .resumeSession):
            return .ready
        case (.paused, .endSession):
            return .idle

        // MARK: Error State
        case (.error(let scanError), .retryAfterError):
            // Retry logic depends on the error type
            if scanError.isRecoverable {
                return .ready
            } else {
                return .error(scanError) // Stay in error if not recoverable
            }
        case (.error, .cancelAfterError):
            return .idle
        case (.error, .endSession):
            return .idle

        // MARK: Special Cases
        case (_, .startCalibration):
            return .calibrating

        // Ignore invalid events
        default:
            return state
        }
    }

    /// Validate if a transition is allowed
    private func isTransitionAllowed(from: ScanState, to: ScanState, on event: ScanEvent) -> Bool {
        // Allow same-state transitions (no-ops)
        if from == to {
            return true
        }

        // Define forbidden transitions
        switch (from, to) {
        // Cannot go directly from idle to anything except calibrating
        case (.idle, _) where to != .calibrating && to != .idle:
            return false

        // Cannot skip processing after capture
        case (.capturing, _) where to != .processing && to != .error(.captureFailed(reason: "")):
            return false

        // Cannot skip reviewing after processing
        case (.processing, _) where to != .reviewing(frameIndex: 0) && !isErrorState(to):
            return false

        // All other transitions are allowed
        default:
            return true
        }
    }

    // MARK: - Helper Methods

    private func isErrorState(_ state: ScanState) -> Bool {
        if case .error = state {
            return true
        }
        return false
    }

    private func recordTransition(from: ScanState?, to: ScanState, triggeredBy: String) {
        let transition = StateTransition(
            from: from,
            to: to,
            timestamp: Date(),
            triggeredBy: triggeredBy
        )
        stateHistory.append(transition)

        // Limit history size
        if stateHistory.count > maxHistoryCount {
            stateHistory.removeFirst(stateHistory.count - maxHistoryCount)
        }
    }

    // MARK: - Analytics & Debugging

    /// Get recent state transitions for debugging
    func getRecentTransitions(count: Int = 10) -> [StateTransition] {
        let startIndex = max(0, stateHistory.count - count)
        return Array(stateHistory[startIndex...])
    }

    /// Print current state and recent history
    func debugPrint() {
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        print("Current State: \(currentState.description)")
        print("Recent Transitions:")
        for transition in getRecentTransitions(count: 5) {
            let fromDesc = transition.from?.description ?? "nil"
            print("  \(fromDesc) → \(transition.to.description) [\(transition.triggeredBy)]")
        }
        print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    }
}

// MARK: - Supporting Types

/// Record of a state transition
struct StateTransition {
    let from: ScanState?
    let to: ScanState
    let timestamp: Date
    let triggeredBy: String
}

// MARK: - Phase 3 Extensions (Stubbed)
// Future dock-related state transitions will be added here

extension ScanStateMachine {
    /*
    // MARK: - Dock State Transitions

    /// Handle dock connection events
    private func handleDockEvent(_ event: ScanEvent, from state: ScanState) -> ScanState {
        switch (state, event) {
        case (.idle, .dockConnectionStarted):
            return .connectingToDock
        case (.connectingToDock, .dockConnected):
            return .calibrating
        case (.connectingToDock, .dockDisconnected):
            return .error(.dockConnectionFailed)
        case (.waitingForDockAlignment, .frameAligned):
            return .capturing
        case (.waitingForDockAlignment, .filmJamDetected):
            return .error(.filmJamDetected)
        case (.verifyingQuality, .qualityVerificationPassed):
            return .processing
        case (.verifyingQuality, .qualityVerificationFailed):
            return .retryingCapture
        case (.retryingCapture, .captureCompleted):
            return .verifyingQuality
        case (_, .rollCompleted):
            return .completed
        default:
            return state
        }
    }
    */
}
