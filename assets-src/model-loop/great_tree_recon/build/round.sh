#!/bin/bash
# usage: build/round.sh <tag> <piece> [piece ...]   -> runs piece.py for each piece and writes renders/<piece>/<tag>_sheet.png
# needs BPY_PY (python with bpy); run from the repo root
R=assets-src/model-loop/great_tree_recon
tag=$1; shift
for p in "$@"; do
  rm -f "$R/renders/$p/${tag}_result.json"
  skills/scene-recon/scripts/run_bpy.sh $R/build/piece.py -- $p $tag 2>&1 | grep -E "Traceback|Error |rror:|File \"" | grep -v "CUEW\|HIPEW" | cut -c1-400
  python3 - "$R" "$p" "$tag" <<'PY'
import json, os, sys
R, p, tag = sys.argv[1:]
f = f"{R}/renders/{p}/{tag}_result.json"
if not os.path.isfile(f):
    sys.exit(f"{p} {tag}: no result file (the piece script failed)")
d = json.load(open(f)); i = d["import"]; qa = d["qa_errors"]
print(p, tag, "tris", i["tris_in"], "->", i.get("tris_after_voxel", "-"), "->", i["tris_out"], "facets", d["facets"], "loose removed", i["loose_removed"],
      "size", i["size_m"], d.get("split", ""), d.get("rune", ""))
print("  qa errors:", len(qa), *[("\n    " + e[:160]) for e in qa[:6]], ("\n    ..." if len(qa) > 6 else ""))
PY
  ref=$(python3 -c "import json; print(next(x['ref'] for x in json.load(open('$R/scene.json'))['pieces'] if x['id'] == '$p'))")
  node skills/model-loop/scripts/sheet.mjs --out $R/renders/$p/${tag}_sheet.png --cols 6 --h 420 ref=$R/$ref render_ref=$R/renders/$p/${tag}_ref.png front=$R/renders/$p/${tag}_front.png right=$R/renders/$p/${tag}_right.png back=$R/renders/$p/${tag}_back.png left=$R/renders/$p/${tag}_left.png > /dev/null
done
