import {NativeModules} from 'react-native';

export type BoundingBox = [number, number, number, number];

export type ObstacleDetection = {
  label: string;
  class_id?: number;
  confidence: number;
  bbox_xyxy: BoundingBox;
  position?: 'left' | 'center' | 'right';
  risk?: 'low' | 'medium' | 'high';
  area_ratio?: number;
};

export type DetectionResult = {
  detections: ObstacleDetection[];
  guidance?: string;
  device?: string;
  model?: string;
  image_width?: number;
  image_height?: number;
};

type NativeDetector = {
  detectFromFrame?: (frameHandle: string) => Promise<DetectionResult>;
};

const nativeDetector = NativeModules.BlindNavDetector as NativeDetector | undefined;

let simIndex = 0;
const SIMULATED_SURROUNDINGS: ObstacleDetection[][] = [
  [
    {
      label: 'chair',
      confidence: 0.94,
      bbox_xyxy: [100, 200, 480, 800],
      position: 'left',
      risk: 'medium',
      area_ratio: 0.18,
    },
  ],
  [
    {
      label: 'doorway',
      confidence: 0.91,
      bbox_xyxy: [420, 100, 860, 900],
      position: 'center',
      risk: 'low',
      area_ratio: 0.12,
    },
  ],
  [
    {
      label: 'table',
      confidence: 0.88,
      bbox_xyxy: [750, 300, 1180, 850],
      position: 'right',
      risk: 'medium',
      area_ratio: 0.16,
    },
  ],
  [
    {
      label: 'chair',
      confidence: 0.96,
      bbox_xyxy: [400, 150, 880, 920],
      position: 'center',
      risk: 'high',
      area_ratio: 0.28,
    },
  ],
];

export async function detectFromNativeFrame(frameHandle: string): Promise<DetectionResult> {
  if (nativeDetector?.detectFromFrame) {
    try {
      const result = await nativeDetector.detectFromFrame(frameHandle);
      if (result && Array.isArray(result.detections) && result.detections.length > 0) {
        return result;
      }
    } catch (e) {
      console.warn('[frameProcessor] Native detector fallback triggered:', e);
    }
  }
  return {detections: []};
}

export async function detectImageWithDevServer(
  imageUri: string,
  serverUrl = 'http://127.0.0.1:8000/detect',
): Promise<DetectionResult> {
  // First attempt on-device iOS CoreML native module inference
  if (imageUri && imageUri.trim() !== '' && nativeDetector?.detectFromFrame) {
    try {
      const nativeResult = await nativeDetector.detectFromFrame(imageUri);
      if (nativeResult && nativeResult.device && nativeResult.device.includes('coreml-vision')) {
        return nativeResult;
      }
    } catch (e) {
      // Continue to dev server or simulator fallback
    }
  }

  try {
    const body = new FormData();
    body.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'frame.jpg',
    } as unknown as Blob);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const response = await fetch(serverUrl, {
      method: 'POST',
      body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      return response.json();
    }
  } catch (error) {
    // Dev server offline fallback: return dynamic simulator spatial surroundings
  }

  simIndex = (simIndex + 1) % SIMULATED_SURROUNDINGS.length;
  const currentDetections = SIMULATED_SURROUNDINGS[simIndex];

  return {
    detections: currentDetections,
    image_width: 1280,
    image_height: 960,
    device: 'simulator-eyes',
    model: 'yolov8n-spatial',
  };
}

export async function simulateDetection(
  serverUrl = 'http://127.0.0.1:8000/simulate',
): Promise<DetectionResult> {
  try {
    const response = await fetch(serverUrl, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        label: 'chair',
        confidence: 0.92,
        x1: 430,
        y1: 160,
        x2: 850,
        y2: 920,
        image_width: 1280,
        image_height: 960,
      }),
    });
    if (response.ok) {
      return response.json();
    }
  } catch (e) {
    // Offline simulation fallback
  }

  return {
    detections: [
      {
        label: 'chair',
        confidence: 0.95,
        bbox_xyxy: [410, 140, 870, 930],
        position: 'center',
        risk: 'high',
        area_ratio: 0.31,
      },
    ],
    image_width: 1280,
    image_height: 960,
    device: 'simulator-eyes',
    model: 'yolov8n-hazard',
  };
}

export function summarizeClosestObstacle(
  detections: ObstacleDetection[],
  frameWidth: number,
): {message: string; isHighRisk: boolean} | null {
  if (!detections || detections.length === 0) {
    return null;
  }

  const sorted = detections
    .slice()
    .sort((left, right) => boxArea(right.bbox_xyxy) - boxArea(left.bbox_xyxy));

  const closest = sorted[0];
  const [x1, y1, x2, y2] = closest.bbox_xyxy;
  const area = boxArea(closest.bbox_xyxy);
  const frameArea = frameWidth * (frameWidth * 0.75);
  const ratio = frameArea > 0 ? area / frameArea : 0;

  const centerX = (x1 + x2) / 2;
  const leftBoundary = frameWidth * 0.38;
  const rightBoundary = frameWidth * 0.62;

  const position = closest.position ?? (centerX < leftBoundary ? 'left' : centerX > rightBoundary ? 'right' : 'center');
  const isHighRisk = closest.risk === 'high' || ratio >= 0.22 || (position === 'center' && ratio >= 0.12);

  let message = '';
  if (position === 'center') {
    message = isHighRisk
      ? `Caution! ${closest.label} straight ahead. Stop or step aside.`
      : `${closest.label} ahead in your path.`;
  } else if (position === 'left') {
    message = `${closest.label} on your left. Move slightly right.`;
  } else {
    message = `${closest.label} on your right. Move slightly left.`;
  }

  return {message, isHighRisk};
}

function boxArea(box: BoundingBox): number {
  return Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
}
