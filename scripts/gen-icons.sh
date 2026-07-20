#!/usr/bin/env bash
#
# gen-icons.sh: render assets/icon.svg into the per-surface icon formats.
#
# Outputs (committed source, checked in):
#   raycast/assets/icon.png                    512x512 PNG (Raycast command icon)
#   alfred/icon.png                            512x512 PNG (Alfred workflow icon)
#   macos/ClaudeUsage/Resources/AppIcon.icns   macOS app icon
#
# Requires: python3 with Pillow (base render), plus stock sips and iconutil.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVG="$ROOT/assets/icon.svg"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

[ -f "$SVG" ] || { echo "missing $SVG"; exit 1; }

log() { printf '==> %s\n' "$*"; }

# 1) Rasterize the icon at high resolution with a transparent background.
#    qlmanage flattens onto white (opaque corners), so we draw with Pillow
#    instead to keep the area outside the rounded square transparent. The
#    geometry here mirrors assets/icon.svg; keep the two in sync.
log "render base 1024px (transparent)"
BASE="$TMP/icon.png"
python3 - "$BASE" <<'PY'
import sys, math
from PIL import Image, ImageDraw

out = sys.argv[1]
SS = 2048                      # supersample, downscaled to 1024 for smooth edges
scale = SS / 512.0
coral = (217, 119, 87, 255)    # #D97757
white = (255, 255, 255, 255)

img = Image.new("RGBA", (SS, SS), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Rounded square (transparent outside the corners).
d.rounded_rectangle([0, 0, SS - 1, SS - 1], radius=112 * scale, fill=coral)

cx = cy = SS / 2.0
R = 150 * scale
w = 46 * scale
bbox = [cx - R, cy - R, cx + R, cy + R]

# Open ring with a symmetric gap at the top and rounded ends.
gap = 54.0                       # degrees of open space, centered on top
start, end = -90.0 + gap / 2.0, 270.0 - gap / 2.0
d.arc(bbox, start=start, end=end, fill=white, width=int(round(w)))

# Round line caps at each end of the arc.
cap = w / 2.0
for ang in (start, end):
    a = math.radians(ang)
    px, py = cx + R * math.cos(a), cy + R * math.sin(a)
    d.ellipse([px - cap, py - cap, px + cap, py + cap], fill=white)

img.resize((1024, 1024), Image.LANCZOS).save(out)
PY
[ -f "$BASE" ] || { echo "base render failed"; exit 1; }

# 2) 512px PNGs for Raycast and Alfred.
log "png 512 -> raycast + alfred"
sips -z 512 512 "$BASE" --out "$ROOT/raycast/assets/icon.png" >/dev/null
mkdir -p "$ROOT/alfred"
sips -z 512 512 "$BASE" --out "$ROOT/alfred/icon.png" >/dev/null

# 3) macOS .icns from an iconset of the standard sizes.
log "icns -> macos"
ICONSET="$TMP/AppIcon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 64 128 256 512; do
  sips -z "$s"   "$s"   "$BASE" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z "$d"   "$d"   "$BASE" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
mkdir -p "$ROOT/macos/ClaudeUsage/Resources"
iconutil -c icns "$ICONSET" -o "$ROOT/macos/ClaudeUsage/Resources/AppIcon.icns"

log "done"
