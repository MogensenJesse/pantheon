"""Generic part driver: builds a part (build/<part>.py build_all() -> object names), QA gate, renders each variant like the reference
(renders/<part>/<tag>_<name>_*.png) and a part sheet next to the reference; saves great_tree_work.blend.
blender -b great_tree_work.blend --factory-startup --python build/drive.py -- <part> <tag> [view az,el,lens]"""
import importlib
import json
import os
import sys

import bpy

R = "D:/pantheon/assets-src/model-loop/great_tree"
sys.path[:0] = [R + "/build", "D:/pantheon/.claude/skills/model-loop/scripts"]
import loop_render  # noqa: E402
import tree_common  # noqa: E402,F401

sys.path.insert(0, os.path.join(loop_render.SKILLS, "blender-asset-qa", "scripts"))
import qa_check  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1:]
part, tag = args[0], args[1]
view = tuple(float(x) for x in (args[2] if len(args) > 2 else "35,25,85").split(","))
mod = importlib.import_module(part)
importlib.reload(mod)
names = mod.build_all()
out = {"qa": {}, "dims": {}, "render": {}}
for n in names:
    ob = bpy.data.objects[n]
    out["qa"][n] = qa_check.run(objects=[n], profile="render").get("errors", [])
    out["dims"][n] = [round(v, 3) for v in ob.dimensions]


def _run(*a, **k):
    for _ in range(4):  # loop_render.run sometimes throws on a repeated call; the retry passes
        try:
            return loop_render.run(*a, **k)["ref"]
        except AttributeError:
            continue
    raise RuntimeError("loop_render.run kept failing")


for n in names:
    out["render"][n] = _run("P_" + part, f"{R}/renders/{part}", f"{tag}_{n.split('_', 1)[-1]}", res=512, ref_view=view, ref_res=(1024, 1024), only=[n])
print("@@RESULT@@" + json.dumps(out, default=str)[:2500])
bpy.ops.wm.save_mainfile()
