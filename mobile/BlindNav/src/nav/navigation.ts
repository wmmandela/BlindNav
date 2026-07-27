import type {ObstacleDetection} from '../camera/frameProcessor';

export type Destination = {
  rawText: string;
  normalizedText: string;
};

export type GuidanceInput = {
  destination?: Destination;
  detections: ObstacleDetection[];
  frameWidth: number;
  serverGuidance?: string;
};

export function parseDestination(command: string): Destination | null {
  const cleaned = command.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return null;
  }

  const match = cleaned.match(/(?:navigate|go|take me|directions)\s+(?:to\s+)?(.+)/i);
  const destination = match?.[1] ?? cleaned;

  return {
    rawText: command,
    normalizedText: destination.trim().toLowerCase(),
  };
}

export function getNavigationMessage(input: GuidanceInput): string {
  if (input.serverGuidance) {
    if (input.destination) {
      return `${input.serverGuidance} Continue toward ${input.destination.normalizedText}.`;
    }
    return input.serverGuidance;
  }

  const obstacle = mostUrgentObstacle(input.detections, input.frameWidth);

  if (obstacle) {
    return obstacle;
  }

  if (input.destination) {
    return `Path clear. Continue toward ${input.destination.normalizedText}.`;
  }

  return 'Path clear. Say a destination when ready.';
}

function mostUrgentObstacle(detections: ObstacleDetection[], frameWidth: number): string | null {
  if (detections.length === 0) {
    return null;
  }

  const sorted = detections
    .slice()
    .sort((left, right) => area(right.bbox_xyxy) - area(left.bbox_xyxy));
  const detection = sorted[0];
  const [x1, , x2] = detection.bbox_xyxy;
  const centerX = (x1 + x2) / 2;
  const leftBoundary = frameWidth * 0.4;
  const rightBoundary = frameWidth * 0.6;

  if (centerX < leftBoundary) {
    return `${detection.label} on your left. Move slightly right.`;
  }

  if (centerX > rightBoundary) {
    return `${detection.label} on your right. Move slightly left.`;
  }

  return `${detection.label} ahead. Slow down.`;
}

function area(box: ObstacleDetection['bbox_xyxy']): number {
  return Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
}
