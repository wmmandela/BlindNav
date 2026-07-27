"""YOLOv8 training entrypoint for BlindNav obstacle detection."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

os.environ.setdefault("MPLCONFIGDIR", str(Path(tempfile.gettempdir()) / "blindnav-matplotlib"))
os.environ.setdefault("YOLO_CONFIG_DIR", str(Path(tempfile.gettempdir()) / "blindnav-ultralytics"))
os.environ.setdefault("XDG_CACHE_HOME", str(Path(tempfile.gettempdir()) / "blindnav-cache"))
Path(os.environ["MPLCONFIGDIR"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["YOLO_CONFIG_DIR"]).mkdir(parents=True, exist_ok=True)
Path(os.environ["XDG_CACHE_HOME"]).mkdir(parents=True, exist_ok=True)

from ultralytics import YOLO

from detect import best_device


def train(
    data_yaml: str,
    base_model: str = "yolov8n.pt",
    epochs: int = 50,
    image_size: int = 640,
    batch: int = 8,
    project: str = "runs/blindnav",
    run_name: str = "obstacle-detector",
) -> Path:
    """Fine-tune YOLOv8 on a dataset described by an Ultralytics data YAML."""
    data_file = Path(data_yaml)
    if not data_file.exists():
        raise FileNotFoundError(f"Dataset YAML not found: {data_yaml}")

    model = YOLO(base_model)
    result = model.train(
        data=str(data_file),
        epochs=epochs,
        imgsz=image_size,
        batch=batch,
        device=best_device(),
        project=project,
        name=run_name,
    )
    return Path(result.save_dir) / "weights" / "best.pt"


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Train/fine-tune a YOLOv8 obstacle detector.")
    parser.add_argument("data", help="Path to Ultralytics dataset YAML")
    parser.add_argument("--base-model", default="yolov8n.pt", help="Base YOLO model")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--image-size", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--project", default="runs/blindnav")
    parser.add_argument("--run-name", default="obstacle-detector")
    args = parser.parse_args()

    best_model = train(
        args.data,
        base_model=args.base_model,
        epochs=args.epochs,
        image_size=args.image_size,
        batch=args.batch,
        project=args.project,
        run_name=args.run_name,
    )
    print(f"Best model: {best_model}")
