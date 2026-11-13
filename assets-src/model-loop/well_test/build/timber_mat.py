"""Part 'timber', material only: lighter and redder (user: too dark; reference mahogany). Same in-place edit as plank_mat.py (gain Value node +
the tint MULTIPLY colour, not the darker end-grain multiply). Also M_crank_peg, the crank handle, which is a copy of M_timber's grading.

v2: lit top of a post, saturated-pixel median (colstats on a crop of a 2752x1536 ref view): render #51250e (81,37,14) vs reference #923a29
(146,58,41). The render responds to the albedo factor roughly as factor^0.7 (exposure -2 + Khronos Neutral), so the factor change is
(target/render)^(1/0.7): R x2.33, G x1.9, B x4.6. v1: M_timber gain .45 tint (1, .53, .32); M_crank_peg gain .766, same tint.
"""
import bpy

V2 = {"M_timber": dict(gain=1.44, tint=(1.0, 0.4375, 0.254)), "M_crank_peg": dict(gain=2.45, tint=(1.0, 0.437, 0.255))}
# 1st try gain 1.05 tint (1,.432,.63) -> lit top #752e3e (117,46,62): magenta, blue far too high. Rescaled per channel by (target/render)^(1/0.7):
# R x1.37, G x1.39, B x0.555 -> factors (1.44, .63, .366). Rule learned twice (stone, deck, timber): never raise blue by the full ratio.


def apply(over=None):
    for name, v in (over or V2).items():
        nt = bpy.data.materials[name].node_tree
        (gain_node,) = [n for n in nt.nodes if n.type == "VALUE"]
        # the tint multiply is the one whose colour is not the dark end-grain (0.45, 0.4, 0.38) pair
        tint_node = next(n for n in nt.nodes if n.type == "MIX" and n.blend_type == "MULTIPLY"
                         and abs([s for s in n.inputs if s.type == "RGBA"][1].default_value[0] - 0.45) > 0.02)
        gain_node.outputs[0].default_value = v["gain"]
        [s for s in tint_node.inputs if s.type == "RGBA"][1].default_value = (*v["tint"], 1)
