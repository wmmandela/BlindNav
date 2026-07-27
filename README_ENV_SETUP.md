# BlindNav Environment Setup

BlindNav has two workspaces:

- `ml/`: Mac-side YOLOv8 training, inference, FastAPI testing, and CoreML export.
- `mobile/BlindNav/`: React Native app shell for camera input, voice destination commands, and spoken guidance.

## Project Structure

```text
BlindNav/
├── ml/
│   ├── detect.py
│   ├── export.py
│   ├── train.py
│   ├── server.py
│   ├── README.md
│   └── requirements.txt
├── mobile/
│   └── BlindNav/
│       ├── app.json
│       ├── index.js
│       ├── package.json
│       ├── src/
│       │   ├── App.tsx
│       │   ├── camera/frameProcessor.ts
│       │   ├── nav/navigation.ts
│       │   ├── types/native.d.ts
│       │   └── voice/voice.ts
│       ├── ios/
│       └── android/
└── scripts/
    ├── setup_ml_env.sh
    └── setup_mobile_env.sh
```

## ML Quickstart

```bash
cd /Users/macheraweine/Documents/BlindNav
./scripts/setup_ml_env.sh
```

The script creates `ml/.venv` with Python 3.11 and installs PyTorch, Ultralytics, CoreML Tools, Whisper, FastAPI, Uvicorn, and upload support.

Verify MPS:

```bash
cd /Users/macheraweine/Documents/BlindNav/ml
source .venv/bin/activate
python -c "import torch; print('mps', torch.backends.mps.is_available())"
```

Run local inference:

```bash
python detect.py /path/to/image.jpg --model yolov8n.pt
```

Train:

```bash
python train.py datasets/blindnav.yaml --epochs 50 --batch 8
```

Export to CoreML:

```bash
python export.py runs/blindnav/obstacle-detector/weights/best.pt --output-dir exports
```

Run the dev detector API:

```bash
cd /Users/macheraweine/Documents/BlindNav/ml
source .venv/bin/activate
uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

Check the backend:

```bash
curl http://127.0.0.1:8000/
curl -X POST http://127.0.0.1:8000/simulate \
  -H "Content-Type: application/json" \
  -d '{"label":"chair"}'
```

## Mobile Quickstart

```bash
cd /Users/macheraweine/Documents/BlindNav
./scripts/setup_mobile_env.sh
```

Then run Metro:

```bash
cd /Users/macheraweine/Documents/BlindNav/mobile/BlindNav
npm run start -- --port 8081
```

Run iOS:

```bash
npm run ios
```

Run Android:

```bash
npm run android
```

Validate JS/TS:

```bash
npm run typecheck
```

The app can:

- show the live camera preview,
- accept typed or spoken destination input,
- speak guidance with text-to-speech,
- call the ML backend with a captured frame,
- run `/simulate` to test obstacle guidance without a model/image.

## Native Model Integration

The JS app expects an iOS native module named `BlindNavDetector` for direct CoreML frame inference. The module contract is documented in `mobile/BlindNav/ios/README.md`.

Android can share the same JS contract once the YOLO model is exported to a mobile-friendly Android format such as TFLite or ONNX.
