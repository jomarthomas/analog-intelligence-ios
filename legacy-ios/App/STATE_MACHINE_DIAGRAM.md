# Scan State Machine - State Transition Diagram

## State Flow Overview

```
┌──────────┐
│   IDLE   │ ◄──────────────────────────────────────┐
└─────┬────┘                                         │
      │ startSession                                 │
      ▼                                              │
┌─────────────┐                                      │
│ CALIBRATING │                                      │
└──────┬──────┘                                      │
       │ calibrationCompleted                        │
       ▼                                             │
┌──────────┐                                         │
│  READY   │ ◄─────────────────────┐                │
└────┬─────┘                       │                │
     │ captureRequested            │ filmAdvanced   │
     ▼                             │                │
┌───────────┐                      │                │
│ CAPTURING │                      │                │
└─────┬─────┘                      │                │
      │ captureCompleted           │                │
      ▼                            │                │
┌────────────┐                     │                │
│ PROCESSING │                     │                │
└──────┬─────┘                     │                │
       │ processingCompleted       │                │
       ▼                           │                │
┌───────────┐                      │                │
│ REVIEWING │                      │                │
└─────┬─────┘                      │                │
      │ reviewCompleted            │                │
      ▼                            │                │
┌────────────┐                     │                │
│ EXPORTING  │                     │                │
└──────┬─────┘                     │                │
       │ exportCompleted           │                │
       ▼                           │                │
┌────────────────────┐             │                │
│ WAITING FOR FILM   │─────────────┘                │
│     ADVANCE        │                               │
└────────────────────┘                               │
      │ endSession                                   │
      └──────────────────────────────────────────────┘


┌────────┐
│ PAUSED │ ◄───── pauseSession (from ready, waiting, reviewing)
└────┬───┘
     │ resumeSession → returns to READY
     │ endSession → returns to IDLE
     └─────────────────────────────────────┐
                                           ▼
                                      ┌────────┐
                                      │  IDLE  │
                                      └────────┘

┌────────┐
│ ERROR  │ ◄───── errorOccurred (from any state)
└────┬───┘
     │ retryAfterError (if recoverable) → returns to READY
     │ cancelAfterError → returns to IDLE
     └─────────────────────────────────────┐
                                           ▼
                                      ┌────────┐
                                      │  IDLE  │
                                      └────────┘
```

## State Descriptions

### Phase 1: Manual Scanning States (Implemented)

| State | Description | User Actions | Next States |
|-------|-------------|--------------|-------------|
| **idle** | No active session | Start session | calibrating |
| **calibrating** | Locking camera settings | Wait | ready, error |
| **ready** | Ready to capture | Press capture button | capturing, paused, idle |
| **waitingForFilmAdvance** | Waiting for user to advance film | Confirm film advanced | ready, paused, idle |
| **capturing** | Taking photo | Wait | processing, error |
| **processing** | Running image pipeline | Wait | reviewing, error |
| **reviewing** | Adjusting processed image | Save or cancel | exporting, waitingForFilmAdvance, paused |
| **exporting** | Saving final image | Wait | waitingForFilmAdvance, error |
| **paused** | Session paused | Resume or end session | ready, idle |
| **error** | Error occurred | Retry or cancel | ready, idle |

### Phase 3: Auto Roll Scan States (Stubbed)

| State | Description | Trigger |
|-------|-------------|---------|
| **connectingToDock** | Establishing BLE connection | Dock connection initiated |
| **waitingForDockAlignment** | Waiting for frame alignment sensor | Dock connected |
| **verifyingQuality** | Checking capture quality | Capture completed |
| **retryingCapture** | Re-capturing due to quality issues | Quality check failed |
| **completed** | All frames scanned | Roll scanning finished |

## Event Triggers

### Session Events
- `startSession` - Begin new scanning session
- `endSession` - End current session
- `pauseSession` - Pause session
- `resumeSession` - Resume paused session

### Calibration Events
- `startCalibration` - Begin camera calibration
- `calibrationCompleted` - Calibration successful
- `calibrationFailed` - Calibration failed

### Capture Events
- `captureRequested` - User pressed capture
- `captureStarted` - Capture in progress
- `captureCompleted` - Photo captured successfully
- `captureFailed` - Capture failed

### Film Advance Events
- `filmAdvanced` - User advanced film manually
- `skipFilmAdvance` - Skip to ready (for first frame)

### Processing Events
- `processingStarted` - Image processing begun
- `processingCompleted` - Processing finished
- `processingFailed` - Processing error

### Review Events
- `reviewStarted` - User opened adjust screen
- `reviewCompleted` - User saved adjustments
- `reviewCanceled` - User discarded image

### Export Events
- `exportStarted` - Export begun
- `exportCompleted` - Export successful
- `exportFailed` - Export failed

### Error Events
- `errorOccurred` - Error happened
- `retryAfterError` - User chose to retry
- `cancelAfterError` - User chose to cancel

## Workflow Example

### Typical Manual Scanning Session

1. User taps "Start Session" → **idle** → **calibrating**
2. Camera locks focus/exposure/WB → **calibrating** → **ready**
3. User places first negative and taps capture → **ready** → **capturing**
4. Photo captured → **capturing** → **processing**
5. Image inverted and corrected → **processing** → **reviewing**
6. User adjusts exposure/warmth → stays in **reviewing**
7. User taps "Save" → **reviewing** → **exporting**
8. Image saved to gallery → **exporting** → **waitingForFilmAdvance**
9. User advances film manually and taps "Next" → **waitingForFilmAdvance** → **ready**
10. Repeat steps 3-9 for each frame
11. User taps "End Session" → **waitingForFilmAdvance** → **idle**

### Error Recovery Example

1. In **capturing** state, camera fails → **capturing** → **error**
2. User taps "Retry" → **error** → **ready**
3. User taps capture again → **ready** → **capturing**
4. Continues normally

### Pause/Resume Example

1. In **ready** state, user pauses → **ready** → **paused**
2. User puts phone away
3. Later, user resumes → **paused** → **ready**
4. Continues scanning

## State Properties

Each state provides computed properties for UI:

- `description: String` - Human-readable state name
- `allowsUserInteraction: Bool` - Can user interact with UI?
- `shouldShowCameraPreview: Bool` - Display camera feed?
- `captureButtonEnabled: Bool` - Can capture be triggered?

## Implementation Notes

- State machine uses `@Observable` macro for SwiftUI observation
- State changes publish through Combine for reactive UI updates
- State history kept for debugging and analytics (max 100 transitions)
- Invalid transitions are prevented and logged
- Error states track whether error is recoverable
- All Phase 3 dock states are commented/stubbed for future implementation
