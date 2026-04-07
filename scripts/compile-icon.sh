#!/usr/bin/env bash
# Compiles the Glyph.icon (Liquid Glass) into an Assets.car for macOS 26+
# Requires Xcode to be installed (actool depends on it)

set -euo pipefail

export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ICON_PATH="$ROOT_DIR/Glyph.icon"
OUTPUT_PATH="$ROOT_DIR/src-tauri/icons"
PLIST_PATH="$OUTPUT_PATH/assetcatalog_generated_info.plist"

actool "$ICON_PATH" --compile "$OUTPUT_PATH" \
  --output-format human-readable-text --notices --warnings --errors \
  --output-partial-info-plist "$PLIST_PATH" \
  --app-icon Glyph --include-all-app-icons \
  --enable-on-demand-resources NO \
  --development-region en \
  --target-device mac \
  --minimum-deployment-target 26.0 \
  --platform macosx

rm -f "$PLIST_PATH"

echo "✅ Assets.car created at $OUTPUT_PATH/Assets.car"
