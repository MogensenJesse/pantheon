"""Driver for node 'roof': blender -b roof_work.blend --python roof_drive.py -- <tag> [norender]
Builds G_roof from the frozen shingle/timber, checks it, renders (ref view lit like the turntable views), saves."""
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
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
tag = args[0] if args else "01"
do_render = "norender" not in args

import loop_render  # noqa: E402
import roof  # noqa: E402

importlib.reload(roof)
REF_VIEW = (36, 26, 50)  # measured from the reference (plan said 35/25): ridge/eave/tie-beam line slopes give az ~30, el ~22
PO = {}
exec(open(R + "/build/roof_round.py").read()) if os.path.exists(R + "/build/roof_round.py") else None
REF_FRAME = round(1 + REF_VIEW[0] / 3)  # turntable frame whose pivot angle matches the azimuth: lights face the ref camera like the 4 views

_orig = loop_render.render_batch.run


def _ref_at_frame(*a, **k):
    if k.get("cameras") == ["REF_CAM"]:
        k["frames"] = str(REF_FRAME)
    return _orig(*a, **k)


loop_render.render_batch.run = _ref_at_frame
roof.P.update(PO)
info = roof.build()
g = bpy.data.collections["G_roof"]
pts = []
for o in g.objects:
    pts += [o.matrix_world @ Vector(c) for c in o.bound_box]
info["bbox"] = [[round(min(p[i] for p in pts), 3) for i in range(3)], [round(max(p[i] for p in pts), 3) for i in range(3)]]
info["objects"] = len(g.objects)
info["shared"] = all(o.data.name.startswith(("shingle_", "timber_")) for o in g.objects if not o.name.startswith("roof_under"))
if do_render:
    info["render"] = loop_render.run("G_roof", R + "/renders/roof", "r" + tag, ref_view=REF_VIEW, ref_res=(1024, 1024))
bpy.ops.wm.save_as_mainfile(filepath=R + "/roof_work.blend")
os.makedirs(R + "/rounds", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=R + f"/rounds/roof_r{tag}.blend", copy=True)
print("@@RESULT@@" + json.dumps(info, default=list))
