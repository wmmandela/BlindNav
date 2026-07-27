"""CoreML export helper for YOLOv8 models."""
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


def export_to_coreml(
    model_path: str,
    output_dir: str = "exports",
    image_size: int = 640,
    half: bool = False,
    nms: bool = True,
) -> Path:
    """Export a YOLO model to a CoreML `.mlpackage` for iOS deployment."""
    model_file = Path(model_path)
    if not model_file.exists() and not model_path.endswith(".pt"):
        raise FileNotFoundError(f"Model not found: {model_path}")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    model = YOLO(model_path)
    exported = model.export(format="coreml", imgsz=image_size, half=half, nms=nms)
    exported_path = Path(exported)
    target = output_path / exported_path.name

    if exported_path.resolve() != target.resolve():
        exported_path.replace(target)

    return target


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Export a model to CoreML format.")
    parser.add_argument("model", help="Input model path")
    parser.add_argument("--output-dir", default="exports", help="Directory for exported CoreML model")
    parser.add_argument("--image-size", type=int, default=640, help="Export image size")
    parser.add_argument("--half", action="store_true", help="Use fp16 export where supported")
    parser.add_argument("--no-nms", action="store_true", help="Disable CoreML NMS layer")
    args = parser.parse_args()

    exported = export_to_coreml(
        args.model,
        output_dir=args.output_dir,
        image_size=args.image_size,
        half=args.half,
        nms=not args.no_nms,
    )
    print(f"Exported CoreML model to: {exported}")
