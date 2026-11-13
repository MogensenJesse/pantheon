"""Inspect root_work.blend: collections, view layer state, bounds of each child group, shaft ring radii."""
import json
import math
import sys

import bpy
from mathutils import Vector

S = r"D:/pantheon/.claude/skills/model-loop/scripts"
sys.path.insert(0, S)
import loop_render  # noqa: E402

res = {"collections": {}, "layers": {}, "scene_objs": [o.name for o in bpy.context.scene.collection.objects]}


def walk(lc, d=0):
    res["layers"][("  " * d) + lc.name] = dict(exclude=lc.exclude, hide=lc.hide_viewport)
    for c in lc.children:
        walk(c, d + 1)


walk(bpy.context.view_layer.layer_collection)
for c in bpy.data.collections:
    res["collections"][c.name] = dict(objs=len(c.objects), children=[x.name for x in c.children])
res["scene_children"] = [c.name for c in bpy.context.scene.collection.children]
for g in ("G_deck", "G_shaft", "G_frame", "G_roof"):
    col = bpy.data.collections[g]
    lo, hi = loop_render._bounds(col)
    res[g] = dict(lo=[round(v, 3) for v in lo], hi=[round(v, 3) for v in hi])
# shaft ring radii from evaluated object instances / meshes
col = bpy.data.collections["G_shaft"]
rin, rout, zs = [], [], []
dg = bpy.context.evaluated_depsgraph_get()
for o in col.all_objects:
    if o.type != "MESH":
        continue
    me = o.data
    mw = o.matrix_world
    rs = [math.hypot((mw @ v.co).x, (mw @ v.co).y) for v in me.vertices]
    zz = [(mw @ v.co).z for v in me.vertices]
    rin.append(min(rs))
    rout.append(max(rs))
    zs += zz
res["shaft_objs"] = len(list(col.all_objects))
res["shaft_names"] = sorted({o.name.split(".")[0][:10] for o in col.all_objects})[:20]
res["shaft_r"] = [round(min(rin), 3), round(max(rout), 3)]
res["shaft_z"] = [round(min(zs), 3), round(max(zs), 3)]
# radial histogram of verts at stone layer
for name in ("G_frame", "G_roof"):
    pass
print("@@RESULT@@" + json.dumps(res, default=str))
