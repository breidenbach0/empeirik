#!/usr/bin/env bash
#
# Install the official CircuitJS1 offline web runtime same-origin.
#
# Downloads the Falstad offline ZIP (or uses a ZIP you already downloaded),
# extracts resources/app/war, and places the runtime in ./circuitjs.
#
# Usage:
#   npm run install:circuitjs
#   bash scripts/install-circuitjs.sh /path/to/circuitjs1-win.zip
#
set -euo pipefail

ZIP_URL="https://www.falstad.com/circuit/offline/circuitjs1-win.zip"
# SHA-256 recorded when this MVP was built; upstream ships new builds, so a
# mismatch is reported as a warning, not a failure.
KNOWN_SHA256="52e33bf1728da8a5010ffbec948525cbecc634699e42e983bfb36ae86355049b"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEST_DIR="$PROJECT_DIR/circuitjs"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/empeirik-circuitjs.XXXXXX")"

cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

ZIP_FILE="${1:-}"

if [ -z "$ZIP_FILE" ]; then
  ZIP_FILE="$TMP_DIR/circuitjs1-win.zip"
  echo "Downloading the official CircuitJS1 offline ZIP (~100 MB)…"
  echo "  $ZIP_URL"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar -o "$ZIP_FILE" "$ZIP_URL"
  elif command -v wget >/dev/null 2>&1; then
    wget --show-progress -O "$ZIP_FILE" "$ZIP_URL"
  else
    echo "error: need curl or wget to download, or pass a local ZIP path:" >&2
    echo "  bash scripts/install-circuitjs.sh /path/to/circuitjs1-win.zip" >&2
    exit 1
  fi
else
  echo "Using provided ZIP: $ZIP_FILE"
fi

if command -v shasum >/dev/null 2>&1; then
  ACTUAL_SHA256="$(shasum -a 256 "$ZIP_FILE" | awk '{print $1}')"
  if [ "$ACTUAL_SHA256" = "$KNOWN_SHA256" ]; then
    echo "Checksum matches the build recorded for this MVP."
  else
    echo "note: SHA-256 of this ZIP is $ACTUAL_SHA256"
    echo "      (differs from the one recorded at MVP build time; upstream"
    echo "      ships new builds regularly — continuing)"
  fi
fi

echo "Extracting…"
unzip -q -o "$ZIP_FILE" -d "$TMP_DIR/unpacked"

WAR_DIR="$(find "$TMP_DIR/unpacked" -type d -path "*resources/app/war" | head -n 1)"
if [ -z "$WAR_DIR" ]; then
  echo "error: could not find resources/app/war inside the ZIP." >&2
  echo "       The upstream layout may have changed; see UPSTREAM.md." >&2
  exit 1
fi

mkdir -p "$DEST_DIR"
# Keep our README so the directory stays documented; copy the runtime around it.
find "$WAR_DIR" -mindepth 1 -maxdepth 1 -exec cp -R {} "$DEST_DIR/" \;

if [ ! -f "$DEST_DIR/circuitjs.html" ]; then
  echo "error: circuitjs.html missing after extraction." >&2
  exit 1
fi

echo "Installed the CircuitJS1 runtime in $DEST_DIR"
echo "Restart the server and reopen the app:"
echo "  npm start"
echo "The header should change to “CircuitJS1 connected”."
