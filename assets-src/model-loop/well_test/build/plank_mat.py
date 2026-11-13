"""Part 'plank', material only (shape stays frozen at r05 + user chips): re-grade M_plank toward the reference's duller, lighter ochre.
apply() edits the two grading nodes of the frozen graph in place (gain Value node, the MULTIPLY tint colour), nothing else.

v2 (judge r10, part scope): planks read saturated orange. v1 gain .28 tint (1, .91, .41). Deck slab rect (1350,1280,600,100) of a 2752x1536
ref view: render median (151,91,24) vs reference (193,124,57) -> linear x(1.72, 1.97, 6.7) -> gain .77, tint (.62, .65, 1).
"""
import bpy

V2 = dict(gain=0.46, tint=(0.99, 1.0, 0.883))  # v2c: gain .52 tint (.875,.885,1) gave median 192,123,74 (peach); B target ~62 -> factor .406. v2a gain .46 tint (.99,1,.535) matched the reference median 193,124,57 (measured 193,124,43, saturation .78 vs .70)
# v2b (user: deck too saturated): raise only blue, to median B ~76 (saturation .6): factor .246 x (76/43)^1.43 = .556; .52 after log interpolation


def apply(gain=None, tint=None):
    m = bpy.data.materials["M_plank"]
    nt = m.node_tree
    (gain_node,) = [n for n in nt.nodes if n.type == "VALUE"]
    (tint_node,) = [n for n in nt.nodes if n.type == "MIX" and n.blend_type == "MULTIPLY"]
    gain_node.outputs[0].default_value = V2["gain"] if gain is None else gain
    cols = [s for s in tint_node.inputs if s.type == "RGBA"]
    cols[1].default_value = (*(V2["tint"] if tint is None else tint), 1)
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.2  # judge r22: planks read glossy
    return m
