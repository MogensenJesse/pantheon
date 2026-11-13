"""Driver for node 'shingle'. Env SHINGLE_ROUND=r01 (tag). Rebuilds the 3 variants, materials, QA, renders, saves the work blend."""
import importlib
import json
import os
import sys

import bpy

R = "D:/pantheon/assets-src/model-loop/well_test"
S = "D:/pantheon/.claude/skills/model-loop/scripts"
sys.path[:0] = [S, R + "/build"]
tag = os.environ.get("SHINGLE_ROUND", "r01")
mode = os.environ.get("SHINGLE_MODE", "full")  # full | build (no render)
import loop_render  # noqa: E402

sys.path.insert(0, os.path.join(loop_render.SKILLS, "blender-asset-qa", "scripts"))
import qa_check  # noqa: E402
import shingle  # noqa: E402

importlib.reload(shingle)
REF_VIEW = (16, 41, 50)  # the AI reference is really drawn from ~16 deg azimuth, ~41 deg elevation (measured from its edges), not the plan's 35/25
out = {}
parts = bpy.data.collections["PARTS"]
col = bpy.data.collections.get("P_shingle") or bpy.data.collections.new("P_shingle")
if col.name not in parts.children:
    parts.children.link(col)
names = {"a": "shingle_a", "b": "shingle_b", "c": "shingle_c"}
mats = shingle.make_materials(bpy.path.relpath(R + "/textures/shingle.png"))
obs = {}
for v, n in names.items():
    ob = shingle.build(n, v)
    ob.data.materials.clear()
    ob.data.materials.append(mats["M_shingle" + ("" if v == "a" else "_" + v)])
    obs[v] = ob
dg = bpy.context.evaluated_depsgraph_get()
out["tris"] = {}
for v, ob in obs.items():
    me = ob.evaluated_get(dg).to_mesh()
    out["tris"][v] = sum(len(p.vertices) - 2 for p in me.polygons)
    ob.evaluated_get(dg).to_mesh_clear()
if mode in ("full", "qa"):
    out["qa"] = {}
    for v, n in names.items():
        r = qa_check.run(objects=[n], profile="render")
        out["qa"][v] = {"errors": r.get("errors"), "warnings": r.get("warnings")} if isinstance(r, dict) else str(r)[:300]
if mode == "full":
    out["render"] = {}
    for v, n in names.items():
        t = tag if v == "a" else f"{tag}{v}"
        r = loop_render.run("P_shingle", R + "/renders/shingle", t, ref_view=REF_VIEW, ref_res=(1024, 1024), only=[n])
        out["render"][v] = r if v == "a" else {"ref": r["ref"], "size_m": r["size_m"]}
bpy.ops.wm.save_as_mainfile(filepath=R + "/shingle_work.blend")
if mode == "full":
    bpy.ops.wm.save_as_mainfile(filepath=R + f"/rounds/shingle_{tag}.blend", copy=True)
print("@@RESULT@@" + json.dumps(out, default=str))
