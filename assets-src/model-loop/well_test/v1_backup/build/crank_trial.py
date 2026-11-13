"""Colour trials for 'crank': several material parameter sets in one Blender run, only the ref view is kept (renders/crank/trial_<n>_ref.png).
Run: blender -b crank_work.blend --python crank_trial.py -- trials.json   (does NOT save the blend)"""
import importlib
import json
import os
import sys

import bpy

R = r"D:/pantheon/assets-src/model-loop/well_test"
S = r"D:/pantheon/.claude/skills/model-loop/scripts"
sys.path.insert(0, S)
sys.path.insert(0, R + "/build")
import loop_mat  # noqa: E402
import loop_render  # noqa: E402

import crank  # noqa: E402

_orig_rb = loop_render.render_batch.run


def _ref_at_frame(*a, **k):
    if k.get("cameras") == ["REF_CAM"]:
        k["frames"] = "13"
    return _orig_rb(*a, **k)


loop_render.render_batch.run = _ref_at_frame
trials = json.load(open(sys.argv[sys.argv.index("--") + 1]))
base_iron = dict(tile_m=0.25, rough=0.6, ridge=0.14, ridge_col=(0.62, 0.5, 0.42, 1), top_light=0.12, ao=0.3, tex_sat=0.7, tex_contrast=0.9)
for i, t in enumerate(trials):
    crank.P.update(t.get("P", {}))
    objs = crank.build(seed=1, **t.get("wood", {}))
    ik = dict(base_iron)
    ik.update({k: tuple(v) if isinstance(v, list) else v for k, v in t.get("iron", {}).items()})
    iron = loop_mat.material("M_crank_iron", bpy.path.relpath(R + "/textures/iron.png"), mask="edge", **ik)
    objs["crank_cap"].data.materials.append(iron)
    out = loop_render.run("P_crank", R + "/renders/crank", f"trial{i}", ref_view=tuple(t.get("ref_view", (35, 25, 85))), ref_res=(1024, 1024))
    print("@@TRIAL@@" + json.dumps({"i": i, "ref": out["ref"], "size_m": out["size_m"]}))
