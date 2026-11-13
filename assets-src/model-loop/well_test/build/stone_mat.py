"""Part 'stone', material only (shape stays frozen at r05): re-grade M_stone toward the reference's dark slate.
apply() rebuilds M_stone with loop_mat.material (same projection, ridge, AO as before) plus tint/gain/tex_contrast.

v2 (judge r10, part scope): stones read light warm grey (render front ring mean 101,89,86) where the reference is charcoal slate
(65,60,62), light mottling too strong. Measured with build/rect_mean.mjs on the front ring rect (1170,963,550,275) of a 2752x1536 ref view.
tint/gain from (target/current)^2.2 per channel, normalised to max 1.
"""
import sys

import bpy

S = r"D:/pantheon/.claude/skills/model-loop/scripts"
R = r"D:/pantheon/assets-src/model-loop/well_test"
# v1 values (read back from the frozen graph): tile_m 0.6, rough 0.85, mask edge, ridge 0.55, ridge_col (0.7,0.66,0.64), obj_var 0.08, top_light 0.12, ao 0.3
MAT = dict(tile_m=0.6, rough=0.85, mask="edge", ridge=0.55, ridge_col=(0.7, 0.66, 0.64, 1), obj_var=0.08, top_light=0.12, ao=0.3,
           tex_contrast=0.8, tint=(0.89, 0.945, 1.0), gain=0.767)
# history: measured (tint*gain -> ring mean): .38,.42,.49 -> 53,47,51; .60,.72,.755 -> 72,70,69; .64,.57,.64 -> 77,59,61; v2a gain .65 tint (.78,.878,1) matched the mean 65,60,62.
# v2b (user: somewhat too dark): lit median of the front-ring rect (1170,963,550,275) was 81,78,84 vs the reference 89,79,78; aim for lit ~100,92,94
# so it reads lighter than the measured mean match: factor (target/lit)^(1/0.7) -> gain .767, tint (.89,.945,1).


def apply(**over):
    sys.path.insert(0, S)
    import importlib

    import loop_mat
    importlib.reload(loop_mat)
    kw = dict(MAT, **over)
    m = loop_mat.material("M_stone", bpy.path.relpath(R + "/textures/stone.png"), **kw)
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.22  # painted stone: matte, not plastic (skill rule)
    return m
