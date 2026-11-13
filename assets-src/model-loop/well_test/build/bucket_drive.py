"""Driver for the bucket node: blender -b bucket_work.blend --factory-startup --python bucket_drive.py -- <round> [render|norender]"""
import importlib
import json
import os
import sys

import bpy

R = "D:/pantheon/assets-src/model-loop/well_test"
S = "D:/pantheon/.claude/skills/model-loop/scripts"
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
rd = args[0] if args else "01"
do_render = not (len(args) > 1 and args[1] == "norender")
sys.path.insert(0, S)
sys.path.insert(0, R + "/build")
import loop_mat  # noqa: E402
import loop_render  # noqa: E402

sys.path.insert(0, os.path.join(loop_render.SKILLS, "blender-asset-qa", "scripts"))
import qa_check  # noqa: E402
import bucket  # noqa: E402

importlib.reload(bucket)
out = {"round": rd}
objs, info = bucket.build()
out["staves"] = [(round(p, 3), round(h, 3)) for p, h in info]

W, I = bucket.MAT["wood"], bucket.MAT["iron"]
mw = loop_mat.material("M_bucket_wood", bpy.path.relpath(R + "/textures/bucket_wood.png"), mask="edge", **W)
mi = loop_mat.material("M_bucket_iron", bpy.path.relpath(R + "/textures/iron.png"), mask="edge",
                       ridge_col=(0.62, 0.6, 0.68, 1), **I)
for m, spec, met in ((mw, 0.25, 0.0), (mi, 0.35, 0.0)):
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Specular IOR Level"].default_value = spec
    b.inputs["Metallic"].default_value = met
for o in objs:
    o.data.materials.clear()
    o.data.materials.append(mw if o.name in ("bucket", "bucket_grip") else mi)

out["tris"] = {o.name: len(o.data.polygons) for o in objs}
qa = qa_check.run(objects=[o.name for o in objs], profile="render")
out["qa"] = {"pass": qa["pass"], "errors": qa["errors"], "warnings": qa["warnings"][:6]}
if do_render:
    out["render"] = loop_render.run("P_bucket", f"{R}/renders/bucket", f"r{rd}", ref_view=(35, 25, 50), ref_res=(1024, 1024))
bpy.ops.wm.save_as_mainfile(filepath=f"{R}/bucket_work.blend")
bpy.ops.wm.save_as_mainfile(filepath=f"{R}/rounds/bucket_r{rd}.blend", copy=True)
print("@@RESULT@@" + json.dumps(out, default=str))
