# BlindNav iOS

This folder is reserved for iOS-specific native code and Xcode project files.

Use this path for:
- `ios/Podfile`
- `ios/Runner.xcworkspace`
- native iOS modules and configuration.
BlindNav iOS native notes
=========================

The React Native app expects an iOS native module named `BlindNavDetector` with:

```swift
detectFromFrame(_ frameHandle: String) async throws -> [String: Any]
```

That module should load the exported YOLO CoreML `.mlpackage`, run inference on camera frames, and return:

```json
{
  "detections": [
    {
      "label": "person",
      "confidence": 0.91,
      "bbox_xyxy": [10, 20, 200, 420]
    }
  ]
}
```

Required iOS permissions in `Info.plist`:

- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`
- `NSSpeechRecognitionUsageDescription`
