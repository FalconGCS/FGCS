#!/usr/bin/env bash
set -euo pipefail

# Build FGCS for macOS. Run from any directory.
# Usage: ./build.sh [version] [arch]
# version: optional, will prompt if not provided
# arch: optional (x64 or arm64), defaults to host architecture if not specified

VERSION="${1:-}"
ARCH="${2:-}"

echo "Assuming location is FGCS/building/macos"
cd ../../

# Read and display current version from package.json
echo "Reading current version from package.json..."
PACKAGE_JSON_PATH="./gcs/package.json"
if [[ -f "$PACKAGE_JSON_PATH" ]]; then
  CURRENT_VERSION=$(grep '"version"' "$PACKAGE_JSON_PATH" | sed 's/.*"version": *"\([^"]*\)".*/\1/')
  echo "Current version: $CURRENT_VERSION"

  # Prompt for version if not provided
  if [[ -z "$VERSION" ]]; then
    read -p "Enter new version number: " VERSION
    if [[ -z "$VERSION" ]]; then
      echo "Error: Version is required to continue"
      exit 1
    fi
  fi

  echo "New version will be: $VERSION"
else
  echo "Warning: Could not find package.json at $PACKAGE_JSON_PATH"

  # Still prompt for version if package.json not found
  if [[ -z "$VERSION" ]]; then
    read -p "Enter version number: " VERSION
    if [[ -z "$VERSION" ]]; then
      echo "Error: Version is required to continue"
      exit 1
    fi
  fi
fi

echo "Building backend"
cd radio
source ./venv/bin/activate
python3 -m pip show pyinstaller >/dev/null 2>&1 || python3 -m pip install pyinstaller

# Clean previous dist if present (pyinstaller asks otherwise)
rm -rf dist/fgcs_backend dist/fgcs_backend.app || true

# Build
pyinstaller \
  --paths ./venv/lib/python3.11/site-packages/ \
  --add-data="./venv/lib/python*/site-packages/pymavlink/message_definitions:message_definitions" \
  --add-data="./venv/lib/python*/site-packages/pymavlink:pymavlink" \
  --hidden-import pymavlink \
  --hidden-import engineio.async_drivers.threading \
  --windowed \
  --name fgcs_backend \
  ./app.py

# Move backend app bundle into gcs/extras
BACKEND_APP_PATH="dist/fgcs_backend.app"
EXTRAS_DIR="../gcs/extras"

rm -rf "$EXTRAS_DIR" && mkdir -p "$EXTRAS_DIR"
cp -R "$BACKEND_APP_PATH" "$EXTRAS_DIR/"

echo "Copied backend to ${EXTRAS_DIR}/fgcs_backend.app"

# Generate param definitions and log message descriptions, then build frontend + Electron package (DMG)
cd ../gcs/data
python3 generate_param_definitions.py
echo "Generated param definitions"
python3 generate_log_message_descriptions.py
echo "Generated log message descriptions"

cd ../
yarn
yarn version --new-version "$VERSION" --no-git-tag-version --no-commit-hooks

# Build with optional arch specification
if [[ -n "$ARCH" ]]; then
  echo "Building for architecture: $ARCH"
  yarn build --arch="$ARCH"
else
  echo "Building for host architecture"
  yarn build
fi

echo "Build finished, check gcs/release/${VERSION} for output."
