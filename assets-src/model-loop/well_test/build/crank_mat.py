"""Part 'crank', plate material only (shape stays frozen at r06): re-grade M_crank_wood toward the reference's darker red-brown plate.
Same in-place edit as plank_mat.py (gain Value node + the MULTIPLY tint colour).

v2 (judge r10, part scope): plate reads pale yellow-ochre. v1 gain .51 tint (1, .91, .41). Plate rect, 2752x1536 ref view: render median
(94,56,12) vs reference (79,41,24) -> R x0.68, G x0.50 (linear); the blue channel is left alone (the reference's sky light lifts its blue,
the grey studio does not) -> gain .347, tint (1, .67, .60).
"""
import bpy

V2 = dict(gain=0.347, tint=(1.0, 0.67, 0.60))


def apply(gain=None, tint=None):
    m = bpy.data.materials["M_crank_wood"]
    nt = m.node_tree
    (gain_node,) = [n for n in nt.nodes if n.type == "VALUE"]
    (tint_node,) = [n for n in nt.nodes if n.type == "MIX" and n.blend_type == "MULTIPLY"]
    gain_node.outputs[0].default_value = V2["gain"] if gain is None else gain
    cols = [s for s in tint_node.inputs if s.type == "RGBA"]
    cols[1].default_value = (*(V2["tint"] if tint is None else tint), 1)
    return m
