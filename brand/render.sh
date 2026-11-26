#!/bin/sh
# Turns the SVGs from make.mjs into every PNG size, plus the favicon. Needs macOS (sips), Google Chrome and exiftool.
# Run from the repo root: node brand/make.mjs && sh brand/render.sh
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP=$(mktemp -d)
big() { # svg, out, [transparent]. Chrome won't draw tiny windows, so everything starts at 1024 and is shrunk.
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    ${3:+--default-background-color=00000000} --window-size=1024,1024 --screenshot="$2" "file://$PWD/$1" >/dev/null 2>&1
}
small() { sips -z "$2" "$2" "$1" --out "$3" >/dev/null; }

big brand/gobbler-logo.svg brand/gobbler-logo.png
big brand/gobbler-logo-transparent.svg brand/gobbler-logo-transparent.png t
small brand/gobbler-logo.png 120 brand/gobbler-logo-120.png
small brand/gobbler-logo.png 180 workers/mcp/landing/apple-touch-icon.png

big workers/mcp/landing/turkey.svg "$TMP/icon.png" t
small "$TMP/icon.png" 16 "$TMP/16.png"
small "$TMP/icon.png" 32 "$TMP/32.png"
python3 - "$TMP/16.png" "$TMP/32.png" workers/mcp/landing/favicon.ico <<'PY'
import struct, sys
pngs = [open(p, 'rb').read() for p in sys.argv[1:3]]
out = struct.pack('<HHH', 0, 1, len(pngs))
offset = 6 + 16 * len(pngs)
for data, size in zip(pngs, (16, 32)):
    out += struct.pack('<BBBBHHII', size, size, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
open(sys.argv[3], 'wb').write(out + b''.join(pngs))
PY
rm -rf "$TMP"
exiftool -all= -overwrite_original brand/*.png workers/mcp/landing/apple-touch-icon.png >/dev/null
echo "rendered"
