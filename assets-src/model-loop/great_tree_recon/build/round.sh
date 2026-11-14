#!/bin/bash
# usage: build/round.sh <tag> <piece> [piece ...]   -> runs piece.py for each piece and writes renders/<piece>/<tag>_sheet.png
# needs BPY_PY (python with bpy); run from the repo root
set -e
R=assets-src/model-loop/great_tree_recon
tag=$1; shift
for p in "$@"; do
  skills/scene-recon/scripts/run_bpy.sh $R/build/piece.py -- $p $tag 2>&1 | grep -E "Traceback|Error |rror:|File \"|@@RESULT@@" | grep -v "CUEW\|HIPEW" | python3 -c "
import sys, json
for l in sys.stdin:
    if l.startswith('@@RESULT@@'):
        d = json.loads(l[10:]); i = d['import']
        print(d['piece'], d['tag'], 'tris', i['tris_in'], '->', i.get('tris_after_voxel', '-'), '->', i['tris_out'], 'facets', d['facets'], 'loose', i['loose_removed'], 'size', i['size_m'], 'qa', d['qa_errors'], d.get('rune', ''))
    else: print(l.rstrip()[:400])"
  node skills/model-loop/scripts/sheet.mjs --out $R/renders/$p/${tag}_sheet.png --cols 6 --h 420 ref=$R/refs/$p.png render_ref=$R/renders/$p/${tag}_ref.png front=$R/renders/$p/${tag}_front.png right=$R/renders/$p/${tag}_right.png back=$R/renders/$p/${tag}_back.png left=$R/renders/$p/${tag}_left.png > /dev/null
done
