"""Driver for node 'frame': run inside frame_work.blend.
blender -b frame_work.blend --factory-startup --python frame_drive.py -- <round> [norender]
Builds G_frame, prints measurements, renders (ref view at the turntable frame matching its azimuth), saves work blend + snapshot."""
import importlib
import json
import os
import sys

import bpy
from mathutils import Vector

R = r"D:/pantheon/assets-src/model-loop/well_test"
S = r"D:/pantheon/.claude/skills/model-loop/scripts"
sys.path.insert(0, S)
sys.path.insert(0, R + "/build")
rnd_tag = (sys.argv[sys.argv.index("--") + 1:] or ["01"])[0]
do_render = "norender" not in sys.argv

import frame  # noqa: E402
import loop_render  # noqa: E402

for m in (loop_render, frame):
    importlib.reload(m)

# ---- knobs for this round (the per-round story is in frame.py comments and scores.jsonl) ----
PO = {}
REF_VIEW = (35, 24, 135)
REF_FRAME = round(1 + REF_VIEW[0] / 3)  # turntable frame whose pivot angle matches REF_VIEW: lights are camera-relative, like the 4 views
# --------------------------------------------------------------------------------------------
exec(open(R + "/build/frame_round.py").read()) if os.path.exists(R + "/build/frame_round.py") else None

_orig_rb = loop_render.render_batch.run


def _ref_at_frame(*a, **k):  # the ref camera is not on the pivot: render it where the lights face it like they do the 4 views
    if k.get("cameras") == ["REF_CAM"]:
        k["frames"] = str(REF_FRAME)
    return _orig_rb(*a, **k)


loop_render.render_batch.run = _ref_at_frame
frame.P.update(PO)
objs = frame.build()

g = bpy.data.collections["G_frame"]
lo, hi = loop_render._bounds(g)
res = {"round": rnd_tag, "size_m": [round(v, 3) for v in (hi - lo)], "lo": [round(v, 3) for v in lo], "hi": [round(v, 3) for v in hi],
       "objs": {}}
for n, o in objs.items():
    if o.type == "MESH":
        pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
        res["objs"][n] = dict(lo=[round(min(p[i] for p in pts), 3) for i in range(3)], hi=[round(max(p[i] for p in pts), 3) for i in range(3)],
                              scale=[round(x, 3) for x in o.scale], shared=o.data.users)
    else:
        res["objs"][n] = dict(loc=[round(x, 3) for x in o.location], scale=[round(x, 3) for x in o.scale])
if do_render:
    out = loop_render.run("G_frame", R + "/renders/frame", "r" + rnd_tag, ref_view=REF_VIEW, ref_res=(1024, 1024))
    res["render"] = out
bpy.ops.wm.save_as_mainfile(filepath=R + "/frame_work.blend")
os.makedirs(R + "/rounds", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=R + f"/rounds/frame_r{rnd_tag}.blend", copy=True)
print("@@RESULT@@" + json.dumps(res, default=str))
