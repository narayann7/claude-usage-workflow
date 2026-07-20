#!/usr/bin/env bash
#
# Build ClaudeUsage.app from the Swift package.
#
# Steps: compile release, assemble a .app bundle (executable + Info.plist),
# then ad-hoc codesign so it launches without a developer certificate.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="ClaudeUsage"
BUILD_DIR="$SCRIPT_DIR/../build"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"

echo "==> Building release binary..."
swift build -c release

BIN_PATH="$(swift build -c release --show-bin-path)/$APP_NAME"
if [[ ! -f "$BIN_PATH" ]]; then
    echo "error: built binary not found at $BIN_PATH" >&2
    exit 1
fi

echo "==> Assembling $APP_NAME.app ..."
rm -rf "$APP_BUNDLE"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

cp "$BIN_PATH" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"
cp "$SCRIPT_DIR/Resources/Info.plist" "$APP_BUNDLE/Contents/Info.plist"

# App icon (Finder / Dock / DMG). Optional: skip cleanly if not generated yet.
if [[ -f "$SCRIPT_DIR/Resources/AppIcon.icns" ]]; then
    cp "$SCRIPT_DIR/Resources/AppIcon.icns" "$APP_BUNDLE/Contents/Resources/AppIcon.icns"
fi

# PkgInfo is optional but conventional for a proper bundle.
printf 'APPL????' > "$APP_BUNDLE/Contents/PkgInfo"

echo "==> Ad-hoc codesigning..."
codesign --force --deep --sign - "$APP_BUNDLE"

echo "==> Done: $APP_BUNDLE"
