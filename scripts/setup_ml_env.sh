#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/macheraweine/Documents/BlindNav"
ML_DIR="$ROOT/ml"

mkdir -p "$ML_DIR"

# Use python3.11 installed via brew: /opt/homebrew/bin/python3.11
PYBIN="/opt/homebrew/bin/python3.11"
if [[ ! -x "$PYBIN" ]]; then
  echo "python3.11 not found at $PYBIN"
  echo "Expected to have: brew install python@3.11"
  exit 1
fi

if [[ ! -d "$ML_DIR/.venv" ]]; then
  "$PYBIN" -m venv "$ML_DIR/.venv"
fi

source "$ML_DIR/.venv/bin/activate"

python -m pip install --upgrade pip setuptools wheel

pip install -r "$ML_DIR/requirements.txt"

echo "ML env ready. Python: $(python -V)"
echo "Torch: $(python -c 'import torch; print(torch.__version__)')"
echo "MPS available: $(python -c 'import torch; print(torch.backends.mps.is_available())')"
