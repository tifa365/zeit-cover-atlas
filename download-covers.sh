#!/bin/bash
# Download all 4,187 ZEIT cover images locally
# Uses parallel downloads for speed

BASE="https://interactive.zeit.de/g/2026/80-jahre-zeit-2026/static/cover/webp"
OUT="public/covers"
PARALLEL=20

mkdir -p "$OUT"

# Extract all cover IDs from JSON, strip .jpg extension, download as .webp
python3 -c "
import json
data = json.load(open('fullCoversData.json'))
for entry in data:
    stem = entry['id'].replace('.jpg', '')
    print(stem)
" | while read -r stem; do
  # Skip if already downloaded
  if [ -f "$OUT/${stem}.webp" ]; then
    continue
  fi
  echo "$BASE/${stem}.webp $OUT/${stem}.webp"
done | xargs -P "$PARALLEL" -L 1 bash -c '
  curl -s -o "$1" "$0" \
    -H "Referer: https://www.zeit.de/" \
    -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"
  if [ $? -eq 0 ] && [ -s "$1" ]; then
    echo "OK: $(basename $1)"
  else
    echo "FAIL: $(basename $1)" >&2
    rm -f "$1"
  fi
'

TOTAL=$(ls -1 "$OUT"/*.webp 2>/dev/null | wc -l)
echo ""
echo "Downloaded $TOTAL cover images to $OUT/"
