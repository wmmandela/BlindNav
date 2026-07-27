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

export async function detectFromNativeFrame(frameHandle: string): Promise<DetectionResult> {
  if (!nativeDetector?.detectFromFrame) {
    return {detections: []};
  }

  return nativeDetector.detectFromFrame(frameHandle);
}

export async function detectImageWithDevServer(
  imageUri: string,
  serverUrl = 'http://127.0.0.1:8000/detect',
): Promise<DetectionResult> {
  const body = new FormData();
  body.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'frame.jpg',
  } as unknown as Blob);

  const response = await fetch(serverUrl, {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    throw new Error(`Detector request failed: ${response.status}`);
  }

  return response.json();
}

export async function simulateDetection(
  serverUrl = 'http://127.0.0.1:8000/simulate',
): Promise<DetectionResult> {
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

  if (!response.ok) {
    throw new Error(`Simulation request failed: ${response.status}`);
  }

  return response.json();
}

export function summarizeClosestObstacle(
  detections: ObstacleDetection[],
  frameWidth: number,
): string | null {
  if (detections.length === 0) {
    return null;
  }

  const closest = detections
    .slice()
    .sort((left, right) => boxArea(right.bbox_xyxy) - boxArea(left.bbox_xyxy))[0];
  const centerX = (closest.bbox_xyxy[0] + closest.bbox_xyxy[2]) / 2;
  const third = frameWidth / 3;
  const side = centerX < third ? 'left' : centerX > third * 2 ? 'right' : 'ahead';

  return `${closest.label} ${side}`;
}

function boxArea(box: BoundingBox): number {
  return Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
}
