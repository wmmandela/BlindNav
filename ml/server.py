"""FastAPI development server for BlindNav ML testing."""
from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from pydantic import BaseModel, Field

from detect import detect

app = FastAPI(title="BlindNav ML API", version="0.1.0")


class SimulatedDetection(BaseModel):
    label: str = "chair"
    confidence: float = Field(0.9, ge=0, le=1)
    x1: float = 450
    y1: float = 150
    x2: float = 850
    y2: float = 900
    image_width: int = 1280
    image_height: int = 960


@app.get("/")
def health_check():
    return {"status": "ok", "service": "BlindNav ML server"}


@app.get("/config")
def config():
    return {
        "default_model": "yolov8n.pt",
        "default_confidence": 0.35,
        "endpoints": ["/", "/config", "/detect", "/simulate"],
    }


@app.post("/detect")
async def detect_image(
    image: UploadFile = File(...),
    model: str = Form("yolov8n.pt"),
    confidence: float = Form(0.35),
    obstacle_only: bool = Form(True),
):
    suffix = Path(image.filename or "frame.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temp_file:
        temp_file.write(await image.read())
        temp_path = temp_file.name

    try:
        return detect(
            temp_path,
            model_path=model,
            confidence=confidence,
            obstacle_only=obstacle_only,
        )
    finally:
        Path(temp_path).unlink(missing_ok=True)


@app.post("/simulate")
def simulate_detection(payload: SimulatedDetection):
    from detect import guidance_for_detections

    box = [payload.x1, payload.y1, payload.x2, payload.y2]
    area = max(0.0, payload.x2 - payload.x1) * max(0.0, payload.y2 - payload.y1)
    frame_area = max(1, payload.image_width * payload.image_height)
    center_x = (payload.x1 + payload.x2) / 2
    position = "left" if center_x < payload.image_width * 0.4 else "right" if center_x > payload.image_width * 0.6 else "center"
    ratio = area / frame_area
    risk = "high" if ratio >= 0.28 else "medium" if ratio >= 0.12 else "low"
    detections = [
        {
            "label": payload.label,
            "class_id": -1,
            "confidence": payload.confidence,
            "bbox_xyxy": box,
            "position": position,
            "risk": risk,
            "area_ratio": round(ratio, 4),
        }
    ]

    return {
        "image": "simulated",
        "model": "simulated",
        "device": "none",
        "image_width": payload.image_width,
        "image_height": payload.image_height,
        "detections": detections,
        "guidance": guidance_for_detections(detections),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
