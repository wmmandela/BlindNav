#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/macheraweine/Documents/BlindNav"
MOBILE_DIR="$ROOT/mobile"
APP_DIR="$MOBILE_DIR/BlindNav"

mkdir -p "$MOBILE_DIR"

# Ensure Node is present
command -v node >/dev/null 2>&1 || { echo "node not found"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm not found"; exit 1; }

# Xcode command line tools (best-effort)
xcode-select -p >/dev/null 2>&1 || true

if [[ ! -f "$APP_DIR/package.json" ]]; then
  npx @react-native-community/cli@latest init BlindNav --directory "$APP_DIR" --skip-install
fi

cd "$APP_DIR"

npm install

# iOS permissions / pod install will be handled next.

if [[ -d ios ]]; then
  cd ios
  pod install --repo-update
  cd ..
fi

echo "Mobile deps installed in $APP_DIR"
