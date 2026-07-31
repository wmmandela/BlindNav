import Foundation
import AVFoundation
import Vision
import CoreML
import React

@objc(BlindNavDetector)
class BlindNavDetector: NSObject {

  private var visionModel: VNCoreMLModel?

  override init() {
    super.init()
    setupCoreML()
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  private func setupCoreML() {
    guard let modelURL = Bundle.main.url(forResource: "yolov8n", withExtension: "mlmodelc") ??
                          Bundle.main.url(forResource: "best", withExtension: "mlmodelc") else {
      print("[BlindNavDetector] CoreML compiled model not found in bundle resources.")
      return
    }

    do {
      let compiledModel = try MLModel(contentsOf: modelURL)
      self.visionModel = try VNCoreMLModel(for: compiledModel)
      print("[BlindNavDetector] CoreML Vision model successfully initialized.")
    } catch {
      print("[BlindNavDetector] Failed to load CoreML model: \(error)")
    }
  }

  @objc(detectFromFrame:resolver:rejecter:)
  func detectFromFrame(_ framePath: String,
                       resolver resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {
    let cleanPath = framePath.replacingOccurrences(of: "file://", with: "")
    guard !cleanPath.isEmpty,
          let image = UIImage(contentsOfFile: cleanPath),
          let cgImage = image.cgImage else {
      resolve([
        "detections": [],
        "image_width": 1280,
        "image_height": 960,
        "device": "ios-coreml",
        "guidance": "Camera frame empty."
      ])
      return
    }

    let imageWidth = Int(cgImage.width)
    let imageHeight = Int(cgImage.height)

    guard let visionModel = self.visionModel else {
      resolve([
        "detections": [],
        "image_width": imageWidth,
        "image_height": imageHeight,
        "device": "ios-coreml-unloaded",
        "guidance": "Model loading."
      ])
      return
    }

    let request = VNCoreMLRequest(model: visionModel) { request, error in
      if error != nil {
        resolve([
          "detections": [],
          "image_width": imageWidth,
          "image_height": imageHeight,
          "device": "ios-coreml-error"
        ])
        return
      }

      guard let results = request.results as? [VNRecognizedObjectObservation] else {
        resolve([
          "detections": [],
          "image_width": imageWidth,
          "image_height": imageHeight,
          "device": "ios-coreml"
        ])
        return
      }

      let detections: [[String: Any]] = results.compactMap { obs in
        guard let topLabel = obs.labels.first else { return nil }

        let rect = obs.boundingBox
        let x1 = rect.origin.x * CGFloat(imageWidth)
        let y1 = (1.0 - rect.origin.y - rect.height) * CGFloat(imageHeight)
        let x2 = (rect.origin.x + rect.width) * CGFloat(imageWidth)
        let y2 = (1.0 - rect.origin.y) * CGFloat(imageHeight)

        let areaRatio = Double(rect.width * rect.height)
        let centerX = x1 + (x2 - x1) / 2.0
        let position: String = centerX < CGFloat(imageWidth) * 0.38 ? "left" :
                               centerX > CGFloat(imageWidth) * 0.62 ? "right" : "center"
        let risk: String = areaRatio >= 0.25 ? "high" : areaRatio >= 0.10 ? "medium" : "low"

        return [
          "label": topLabel.identifier,
          "confidence": topLabel.confidence,
          "bbox_xyxy": [Double(x1), Double(y1), Double(x2), Double(y2)],
          "position": position,
          "risk": risk,
          "area_ratio": round(areaRatio * 10000) / 10000.0
        ]
      }

      resolve([
        "detections": detections,
        "image_width": imageWidth,
        "image_height": imageHeight,
        "device": "ios-coreml-vision"
      ])
    }

    request.imageCropAndScaleOption = .scaleFill

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])
      } catch {
        resolve([
          "detections": [],
          "image_width": imageWidth,
          "image_height": imageHeight,
          "device": "ios-coreml-fallback"
        ])
      }
    }
  }
}
