#!/usr/bin/env bash
# Compiles Glyph.icon and exports the app's macOS icon assets.
# Requires Xcode to be installed (actool depends on it)

set -euo pipefail

export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ICON_PATH="$ROOT_DIR/Glyph.icon"
OUTPUT_PATH="$ROOT_DIR/src-tauri/icons"
PLIST_PATH="$OUTPUT_PATH/assetcatalog_generated_info.plist"
TEMP_PATH="$(mktemp -d)"
trap 'rm -rf "$TEMP_PATH"; rm -f "$PLIST_PATH"' EXIT

actool "$ICON_PATH" --compile "$OUTPUT_PATH" \
  --output-format human-readable-text --notices --warnings --errors \
  --output-partial-info-plist "$PLIST_PATH" \
  --app-icon Glyph --include-all-app-icons \
  --enable-on-demand-resources NO \
  --development-region en \
  --target-device mac \
  --minimum-deployment-target 26.0 \
  --platform macosx

ICONSET_PATH="$TEMP_PATH/Glyph.iconset"
iconutil -c iconset "$OUTPUT_PATH/Glyph.icns" -o "$ICONSET_PATH"
cp "$OUTPUT_PATH/Glyph.icns" "$OUTPUT_PATH/icon.icns"

# Use Apple's rendered margins consistently in the Dock and in-app previews.
cp "$ICONSET_PATH/icon_128x128@2x.png" "$OUTPUT_PATH/icon.png"
cp "$ICONSET_PATH/icon_128x128@2x.png" "$ROOT_DIR/public/glyph-app-icon.png"
for size in 32 64 128; do
  sips -z "$size" "$size" "$OUTPUT_PATH/icon.png" \
    --out "$OUTPUT_PATH/${size}x${size}.png" >/dev/null
done
cp "$ICONSET_PATH/icon_128x128@2x.png" "$OUTPUT_PATH/128x128@2x.png"

echo "Exported Assets.car, ICNS, PNG sizes, and the in-app icon preview."
