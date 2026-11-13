"""Driver for node 'crank': python run inside crank_work.blend. Usage: blender -b crank_work.blend --python crank_drive.py -- <round> [render=1]
Builds the part, makes M_crank_iron, runs the QA gate per object, renders, saves the work blend and a round snapshot."""
import importlib
import json
import os
import sys

import bpy

R = r"D:/pantheon/assets-src/model-loop/well_test"
S = r"D:/pantheon/.claude/skills/model-loop/scripts"
sys.path.insert(0, S)
sys.path.insert(0, R + "/build")
rnd_tag = (sys.argv[sys.argv.index("--") + 1:] or ["01"])[0]
do_render = "norender" not in sys.argv

import loop_mat  # noqa: E402
import loop_render  # noqa: E402

sys.path.insert(0, os.path.join(loop_render.SKILLS, "blender-asset-qa", "scripts"))
import crank  # noqa: E402
import qa_check  # noqa: E402

for m in (loop_mat, loop_render, crank):
    importlib.reload(m)

# ---- knobs for this round (the per-round story is in crank.py comments and scores.jsonl) ----
PO = {}
WOOD = dict(wood_gain=0.51, wood_tint=(1.0, 0.955, 0.672), tile=(1.0, 0.35, 1.0),
            peg_gain=0.766, peg_tint=(1.0, 0.91, 0.97))
IRON = dict(tile_m=0.25, rough=0.85, ridge=0.14, ridge_col=(0.62, 0.5, 0.42, 1), top_light=0.12, ao=0.3,
            tex_sat=0.7, tex_contrast=0.9, tint=(1.0, 0.629, 0.469), gain=1.27)
PEG_MAT = None
REF_VIEW = (35, 25, 85)
REF_FRAME = round(1 + REF_VIEW[0] / 3)  # turntable frame whose pivot angle matches REF_VIEW: lights are camera-relative, like the 4 views
# --------------------------------------------------------------------------------------------
exec(open(R + "/build/crank_round.py").read()) if os.path.exists(R + "/build/crank_round.py") else None

_orig_rb = loop_render.render_batch.run


def _ref_at_frame(*a, **k):  # the ref camera is not on the pivot: render it at the frame where the lights face it like they do the 4 views
    if k.get("cameras") == ["REF_CAM"]:
        k["frames"] = str(REF_FRAME)
    return _orig_rb(*a, **k)


loop_render.render_batch.run = _ref_at_frame
crank.P.update(PO)
objs = crank.build(seed=1, **WOOD)
iron = loop_mat.material("M_crank_iron", bpy.path.relpath(R + "/textures/iron.png"), mask="edge", **IRON)
iron.node_tree.nodes[[n.type for n in iron.node_tree.nodes].index("BSDF_PRINCIPLED")].inputs["Specular IOR Level"].default_value = 0.1
objs["crank_cap"].data.materials.append(iron)
if PEG_MAT:
    objs["crank_peg"].data.materials.clear()
    objs["crank_peg"].data.materials.append(bpy.data.materials[PEG_MAT])

res = {"round": rnd_tag, "qa": {}}
for name in objs:
    q = qa_check.run(objects=[name], profile="render")
    res["qa"][name] = {"errors": q.get("errors"), "warnings": q.get("warnings")} if isinstance(q, dict) else str(q)
    me = objs[name].data
    res["qa"][name]["verts"] = len(me.vertices)
    res["qa"][name]["dims"] = [round(d, 4) for d in objs[name].dimensions]

if do_render:
    out = loop_render.run("P_crank", R + "/renders/crank", "r" + rnd_tag, ref_view=REF_VIEW, ref_res=(1024, 1024))
    res["render"] = out
bpy.ops.wm.save_as_mainfile(filepath=R + "/crank_work.blend")
os.makedirs(R + "/rounds", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=R + f"/rounds/crank_r{rnd_tag}.blend", copy=True)
print("@@RESULT@@" + json.dumps(res, default=str))
