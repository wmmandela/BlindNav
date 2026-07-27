"""YOLOv8 inference helpers for BlindNav."""
from __future__ import annotations

import json
import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import Any

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "blindnav-matplotlib"))
os.environ.setdefault("YOLO_CONFIG_DIR", str(Path(tempfile.gettempdir()) / "blindnav-ultralytics"))
os.environ.setdefault("XDG_CACHE_HOME", str(Path(tempfile.gettempdir()) / "blindnav-cache"))
Path(os.environ["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["YOLO_CONFIG_DIR"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["XDG_CACHE_HOME"]).mkdir(parents=True, exist_ok=True)

import torch
from ultralytics import YOLO
from PIL import Image


OBSTACLE_CLASSES = {
    "person",
    "bicycle",
    "car",
    "motorcycle",
    "bus",
    "truck",
    "traffic light",
    "fire hydrant",
    "stop sign",
    "bench",
    "chair",
    "couch",
    "potted plant",
    "bed",
    "dining table",
    "toilet",
}


@lru_cache(maxsize=3)
def load_model(model_path: str) -> YOLO:
    """Load and cache YOLO models so API requests stay responsive."""
    return YOLO(model_path)


def best_device() -> str:
    """Prefer Apple Silicon MPS, then CUDA, then CPU."""
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def _box_area(box: list[float]) -> float:
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def _position(box: list[float], image_width: int) -> str:
    center_x = (box[0] + box[2]) / 2
    if center_x < image_width * 0.4:
        return "left"
    if center_x > image_width * 0.6:
        return "right"
    return "center"


def _risk_level(box: list[float], image_width: int, image_height: int) -> str:
    frame_area = max(1, image_width * image_height)
    ratio = _box_area(box) / frame_area
    if ratio >= 0.28:
        return "high"
    if ratio >= 0.12:
        return "medium"
    return "low"


def guidance_for_detections(detections: list[dict[str, Any]]) -> str:
    """Create a short spoken navigation cue from detections."""
    if not detections:
        return "Path clear."

    closest = max(detections, key=lambda detection: detection["area_ratio"])
    label = closest["label"]
    position = closest["position"]
    risk = closest["risk"]

    if position == "left":
        action = "move slightly right"
    elif position == "right":
        action = "move slightly left"
    else:
        action = "slow down"

    if risk == "high":
        return f"{label} very close {position}. Stop and {action}."
    if risk == "medium":
        return f"{label} {position}. {action}."
    return f"{label} detected {position}."


def _result_to_detections(
    result: Any,
    obstacle_only: bool,
    image_width: int,
    image_height: int,
) -> list[dict[str, Any]]:
    names = result.names
    detections: list[dict[str, Any]] = []

    for box in result.boxes:
        class_id = int(box.cls[0].item())
        label = names[class_id]
        if obstacle_only and label not in OBSTACLE_CLASSES:
            continue

        xyxy = [round(float(value), 2) for value in box.xyxy[0].tolist()]
        area_ratio = round(_box_area(xyxy) / max(1, image_width * image_height), 4)
        detections.append(
            {
                "label": label,
                "class_id": class_id,
                "confidence": round(float(box.conf[0].item()), 4),
                "bbox_xyxy": xyxy,
                "position": _position(xyxy, image_width),
                "risk": _risk_level(xyxy, image_width, image_height),
                "area_ratio": area_ratio,
            }
        )

    return sorted(detections, key=lambda detection: detection["area_ratio"], reverse=True)


def detect(
    image_path: str,
    model_path: str = "yolov8n.pt",
    confidence: float = 0.35,
    image_size: int = 640,
    obstacle_only: bool = True,
) -> dict[str, Any]:
    """Run YOLO inference on a single image and return obstacle detections."""
    image_file = Path(image_path)
    if not image_file.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    with Image.open(image_file) as image:
        image_width, image_height = image.size

    model = load_model(model_path)
    device = best_device()
    results = model.predict(
        source=str(image_file),
        conf=confidence,
        imgsz=image_size,
        device=device,
        verbose=False,
    )

    detections = _result_to_detections(
        results[0],
        obstacle_only,
        image_width=image_width,
        image_height=image_height,
    )

    return {
        "image": str(image_file),
        "model": model_path,
        "device": device,
        "image_width": image_width,
        "image_height": image_height,
        "detections": detections,
        "guidance": guidance_for_detections(detections),
    }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run YOLO obstacle detection on an image file.")
    parser.add_argument("image", help="Path to the image file.")
    parser.add_argument("--model", default="yolov8n.pt", help="Path to the YOLO model.")
    parser.add_argument("--confidence", type=float, default=0.35, help="Minimum confidence.")
    parser.add_argument("--image-size", type=int, default=640, help="Inference image size.")
    parser.add_argument("--all-classes", action="store_true", help="Return non-obstacle classes too.")
    args = parser.parse_args()

    result = detect(
        args.image,
        args.model,
        confidence=args.confidence,
        image_size=args.image_size,
        obstacle_only=not args.all_classes,
    )
    print(json.dumps(result, indent=2))
