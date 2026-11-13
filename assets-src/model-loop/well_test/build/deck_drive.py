"""Driver: python deck_drive.py -- <tag> [render=1]. Builds G_deck in the open work blend, checks, renders, saves."""
import json
import os
import sys

import bpy
from mathutils import Vector

R = r"D:/pantheon/assets-src/model-loop/well_test"
S = r"D:/pantheon/.claude/skills/model-loop/scripts"
sys.path.insert(0, R + "/build")
sys.path.insert(0, S)
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
tag = args[0] if args else "r01"
do_render = (args[1] != "0") if len(args) > 1 else True
REF_VIEW = (35, 42, 85)

import deck  # noqa: E402

if len(args) > 2:
    deck.P["seed"] = int(args[2])

info = deck.build()
g = bpy.data.collections["G_deck"]
dg = bpy.context.evaluated_depsgraph_get()
zlo, zhi = 9, -9
xs, ys = [], []
high = []
for o in g.objects:
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    zlo = min(zlo, min(p.z for p in pts))
    if o.name != "deck_under":
        zhi = max(zhi, max(p.z for p in pts))
        xs += [p.x for p in pts]
        ys += [p.y for p in pts]
        if max(p.z for p in pts) > 0.09:
            high.append(o.name)
info.update(zmin=round(zlo, 4), zmax=round(zhi, 4), x=(round(min(xs), 3), round(max(xs), 3)),
            y=(round(min(ys), 3), round(max(ys), 3)), floating=high)
# planks must still share the frozen mesh
whole = [o for o in g.objects if o.name != "deck_under" and not o.data.name.startswith("deck_piece")]
info["shared_mesh"] = all(o.data.name.startswith("plank_") or o.data.users >= 2 for o in whole)
info["whole"], info["pieces"] = len(whole), len(g.objects) - len(whole) - 1
if do_render:
    import importlib

    import loop_render
    importlib.reload(loop_render)
    res = loop_render.run("G_deck", R + "/renders/deck", tag, ref_view=REF_VIEW, ref_res=(1024, 1024))
    info["render"] = res
bpy.ops.wm.save_as_mainfile(filepath=R + "/deck_work.blend")
os.makedirs(R + "/rounds", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=R + f"/rounds/deck_{tag}.blend", copy=True)
print("@@RESULT@@" + json.dumps(info, default=list))
