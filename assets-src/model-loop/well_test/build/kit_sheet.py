"""Render one picture of every building block (part variant a, or the whole group) into renders/kit/, for a contact sheet.
blender -b root_work.blend --factory-startup --python kit_sheet.py"""
import json
import sys

import bpy

R = r"D:/pantheon/assets-src/model-loop/well_test"
sys.path.insert(0, r"D:/pantheon/.claude/skills/model-loop/scripts")
import loop_render  # noqa: E402

ONLY = {"stone": ["stone_d"], "plank": ["plank_a"], "timber": ["timber_c"], "windlass": ["windlass", "windlass_rope"],
        "crank": ["crank", "crank_peg", "crank_cap"], "bucket": ["bucket", "bucket_band", "bucket_bail", "bucket_grip"], "shingle": ["shingle_a"]}
def _run(*a, **k):
    for _ in range(4):  # loop_render.run sometimes sees a None object in col.all_objects on a repeated call; the retry passes
        try:
            return loop_render.run(*a, **k)["ref"]
        except AttributeError:
            continue
    raise RuntimeError("loop_render.run kept failing: " + a[0])


out = {}
for i, only in ONLY.items():
    out["part_" + i] = _run("P_" + i, R + "/renders/kit", "p_" + i, res=640, ref_view=(35, 25, 60), ref_res=(640, 640), only=only)
for i in ("shaft", "deck", "frame", "roof"):
    out["group_" + i] = _run("G_" + i, R + "/renders/kit", "g_" + i, res=640, ref_view=(35, 25, 60), ref_res=(640, 640))
print("@@RESULT@@" + json.dumps(out))
