# BlindNav ML

This directory contains the Mac-side model workflow for BlindNav:

- `train.py` fine-tunes YOLOv8 on an Ultralytics dataset YAML.
- `detect.py` runs local image inference and returns obstacle detections.
- `export.py` exports a trained YOLO model to CoreML.
- `server.py` exposes FastAPI `/detect` and `/simulate` endpoints.
- `requirements.txt` lists the ML dependency set.

Activate the environment with:
```bash
cd /Users/macheraweine/Documents/BlindNav/ml
source .venv/bin/activate
```

Verify MPS:

```bash
python -c "import torch; print(torch.backends.mps.is_available())"
```

Run inference:

```bash
python detect.py /path/to/image.jpg --model yolov8n.pt
```

Train with a dataset YAML:

```bash
python train.py datasets/blindnav.yaml --epochs 50 --batch 8
```

Export the best model to CoreML:

```bash
python export.py runs/blindnav/obstacle-detector/weights/best.pt --output-dir exports
```

Run the local API:

```bash
uvicorn server:app --reload
curl -F image=@/path/to/image.jpg http://127.0.0.1:8000/detect
curl -X POST http://127.0.0.1:8000/simulate -H "Content-Type: application/json" -d '{"label":"chair"}'
```

Detection responses include `detections`, image dimensions, position/risk metadata, and a short `guidance` string ready for text-to-speech.
