"""Group driver: builds a group (build/g_<group>.py build() -> places linked duplicates in G_<group>), renders it like its reference
(renders/<group>/<tag>_{ref,front,right,back,left}.png) and saves temple_work.blend.
blender -b temple_work.blend --factory-startup --python build/gdrive.py -- <group> <tag>"""
import importlib
import json
import sys

import bpy
from mathutils import Vector

R = "D:/pantheon/assets-src/model-loop/temple_ruin"
sys.path[:0] = [R + "/build", "D:/pantheon/.claude/skills/model-loop/scripts"]
import loop_render  # noqa: E402
import tcommon  # noqa: E402,F401

args = sys.argv[sys.argv.index("--") + 1:]
g, tag = args[0], args[1]
plan = json.load(open(R + "/plan.json", encoding="utf-8"))
node = next(n for n in plan["nodes"] if n["id"] == g)
view = tuple(args[2].split(",")) if len(args) > 2 else tuple(node["ref_view"])
view = tuple(float(x) for x in view)
mod = importlib.import_module("g_" + g)
importlib.reload(mod)
mod.build()
col = bpy.data.collections["G_" + g]
bpy.context.view_layer.update()
pts = [o.matrix_world @ Vector(c) for o in col.all_objects if o.type == "MESH" for c in o.bound_box]
lo = [round(min(p[i] for p in pts), 2) for i in range(3)]
hi = [round(max(p[i] for p in pts), 2) for i in range(3)]
out = {"objects": len(col.all_objects), "lo": lo, "hi": hi, "size": [round(h - l, 2) for l, h in zip(lo, hi)]}
fit = node.get("fit")  # < 1 frames tighter than the bounding sphere (wide, flat scenes look small otherwise)
if fit:
    _orig = loop_render._aim_ref_cam
    loop_render._aim_ref_cam = lambda lo, hi, *a, **k: _orig((lo + hi) / 2 + (lo - hi) / 2 * fit, (lo + hi) / 2 + (hi - lo) / 2 * fit, *a, **k)
for _ in range(4):  # loop_render.run sometimes throws on a repeated call; the retry passes
    try:
        out["render"] = loop_render.run("G_" + g, f"{R}/renders/{g}", tag, res=512, ref_view=view, ref_res=tuple(node.get("ref_res", (1024, 1024))))["ref"]
        break
    except AttributeError:
        continue
print("@@RESULT@@" + json.dumps(out, default=str)[:2500])
bpy.ops.wm.save_mainfile()
