"""Driver for part 'timber' v2: rebuild the irregular variants c..f, QA gate, render each variant from the front and from above (renders/timber/v2_*).
blender -b root_work.blend --factory-startup --python timber_drive.py   (saves nothing: the root round rebuilds the variants itself)"""
import importlib
import json
import os
import sys

import bpy

R = "D:/pantheon/assets-src/model-loop/well_test"
S = "D:/pantheon/.claude/skills/model-loop/scripts"
sys.path[:0] = [S, R + "/build"]
import loop_render  # noqa: E402

sys.path.insert(0, os.path.join(loop_render.SKILLS, "blender-asset-qa", "scripts"))
import qa_check  # noqa: E402
import timber  # noqa: E402

importlib.reload(timber)
out = {"qa": {}, "render": {}}
for n in "cdef":
    name = "timber_" + n
    ob = timber.build(name)
    dg = bpy.context.evaluated_depsgraph_get()
    out["qa"][name] = {k: v for k, v in qa_check.run(objects=[name], profile="render").items() if k in ("errors", "warnings")}
    out.setdefault("dims", {})[name] = [round(v, 3) for v in ob.dimensions]
for n in "abcdef":
    name = "timber_" + n
    for tag, view in (("f", (20, 20, 60)), ("t", (0, 80, 60))):
        for _try in range(3):  # loop_render.run sometimes sees a None object in col.all_objects on a repeated call; the retry passes
            try:
                out["render"][f"{name}_{tag}"] = loop_render.run("P_timber", R + "/renders/timber", f"v2{n}{tag}", res=512, ref_view=view, ref_res=(900, 500), only=[name])["ref"]
                break
            except AttributeError:
                continue
print("@@RESULT@@" + json.dumps(out, default=str)[:3000])
