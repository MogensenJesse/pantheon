"""Render G_shaft (as left in root_work.blend by the last root round) like refs/shaft.png: renders/shaft/<tag>_*.png. Env SHAFT_TAG (default r07)."""
import json
import os
import sys

R = "D:/pantheon/assets-src/model-loop/well_test"
sys.path[:0] = ["D:/pantheon/.claude/skills/model-loop/scripts", R + "/build"]
import loop_render  # noqa: E402

for _ in range(4):  # loop_render.run sometimes sees a None object; the retry passes
    try:
        out = loop_render.run("G_shaft", R + "/renders/shaft", os.environ.get("SHAFT_TAG", "r07"), res=768, ref_view=(35, 25, 50), ref_res=(1024, 1024))
        break
    except AttributeError:
        continue
print("@@RESULT@@" + json.dumps(out, default=str)[:1500])
