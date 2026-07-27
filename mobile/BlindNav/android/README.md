BlindNav Android native notes
=============================

The shared React Native app is ready for Android, but the detector bridge still needs
an Android implementation. Use a TensorFlow Lite or ONNX export for the YOLO model,
then expose the same JS shape as the iOS `BlindNavDetector` module:

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

Required Android permissions:

- `android.permission.CAMERA`
- `android.permission.RECORD_AUDIO`
