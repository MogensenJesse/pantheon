#!/bin/bash
# usage: psheet.sh <part> <tag> -> renders/<part>/<tag>_sheet.png: reference + every variant's ref render. Run from anywhere.
cd /d/pantheon
R=assets-src/model-loop/temple_ruin
args=("ref=$R/refs/$1.png")
for f in $R/renders/$1/$2_*_ref.png; do b=$(basename $f _ref.png); args+=("${b#${2}_}=$f"); done
node .claude/skills/model-loop/scripts/sheet.mjs --out $R/renders/$1/$2_sheet.png "${args[@]}" | tail -1
