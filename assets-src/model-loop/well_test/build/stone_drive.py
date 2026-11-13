"""Driver for part 'stone' v2: build the variants d..i, QA gate, render each from a three-quarter view like refs/stone.png and from the front
(renders/stone/v2_*). Env STONE_TAG (default 'v2'). blender -b root_work.blend --factory-startup --python stone_drive.py (saves nothing)"""
import importlib
import json
import os
import sys

import bpy

R = "D:/pantheon/assets-src/model-loop/well_test"
S = "D:/pantheon/.claude/skills/model-loop/scripts"
sys.path[:0] = [S, R + "/build"]
tag0 = os.environ.get("STONE_TAG", "v2")
import loop_render  # noqa: E402

sys.path.insert(0, os.path.join(loop_render.SKILLS, "blender-asset-qa", "scripts"))
import qa_check  # noqa: E402
import stone  # noqa: E402

importlib.reload(stone)
out = {"qa": {}, "render": {}, "dims": {}}
names = list(stone.VARIANTS)
for name in names:
    ob = stone.build_variant(name, over=({"cast": float(os.environ["STONE_CAST"])} if os.environ.get("STONE_CAST") else None))  # tuning: same cast for all
    out["qa"][name] = {k: v for k, v in qa_check.run(objects=[name], profile="render").items() if k == "errors"}
    out["dims"][name] = [round(v, 3) for v in ob.dimensions]


def _run(*a, **k):
    for _ in range(4):  # loop_render.run sometimes sees a None object in col.all_objects on a repeated call; the retry passes
        try:
            return loop_render.run(*a, **k)["ref"]
        except AttributeError:
            continue
    raise RuntimeError("loop_render.run kept failing")


for name in ["stone_a"] + names:
    out["render"][name] = _run("P_stone", R + "/renders/stone", f"{tag0}_{name[-1]}", res=512, ref_view=(35, 25, 85), ref_res=(1024, 1024), only=[name])
print("@@RESULT@@" + json.dumps(out, default=str)[:2500])
