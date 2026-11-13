"""Shared helpers of the great tree parts: paths and the bark / leaf / rune materials.
Reuses the temple run's toolkit (tcommon, paint, shapes in temple_ruin/build: user-accepted, read-only here)."""
import sys

import bpy

R = "D:/pantheon/assets-src/model-loop/great_tree"
TEMPLE = "D:/pantheon/assets-src/model-loop/temple_ruin/build"
S = "D:/pantheon/.claude/skills/model-loop/scripts"
for _p in (S, TEMPLE, R + "/build"):
    if _p not in sys.path:
        sys.path.insert(0, _p)
import loop_mat  # noqa: E402
from tcommon import _spec  # noqa: E402


def rel(path):
    return bpy.path.relpath(R + "/" + path)


# Material knobs; colours are tuned by measuring the render against the reference (notes in scores.jsonl).
# r03: measured against the reference limb (lit top #746c40 vs #524634, sides already close): lighter, yellower tops
# (first try top_light 0.8, gain 1.15, tint (0.93, 1, 0.8) overshot to pale khaki: top #6d7645, side #534d2d against #3d3d25)
BARK = dict(tile_m=1.1, rough=1.0, mask="edge", ridge=0.0, obj_var=0.04, top_light=0.22, ao=0.3,
            tex_contrast=0.08, tex_sat=0.75, tint=(0.97, 0.96, 0.9), gain=1.1, face_var=0.22, top_flat=True)
# r04: colstats only counts saturated pixels, on these refs that is the moss (the khaki overshoots came from that). build/barkstats.mjs measures
# the bark itself: refs top #867960 side #534d3b on limb, trunk and roots alike; r03 was #8c7959 / #5b4b2e (right value, too little blue)
SEAM = (0.035, 0.028, 0.02)  # r06: was (0.13, 0.105, 0.075), lighter than the bark itself (about 0.12, 0.09, 0.065): the seams showed pale  # the dark painted lines between bark plates
LEAF = dict(tile_m=0.9, rough=1.0, mask="edge", ridge=0.0, obj_var=0.04, top_light=0.5, ao=0.35, tex_contrast=0.6, tex_sat=0.9,
            tint=(1.0, 1.0, 1.0), gain=0.8, face_var=0.3)
GLOW = (0.42, 0.93, 1.0)  # pale cyan of the runes


def bark_mat(name="M_bark", moss=0.6, seams=0.7, moss_kw=None, **over):
    """Bark with dark painted plate seams (the 'edge' strips) and moss painted on top (moss = threshold, lower = more; None = no moss)."""
    m = _spec(loop_mat.material(name, rel("textures/bark.png"), **dict(BARK, **over)))
    nt = m.node_tree  # loop_mat's ridge only lightens (screen): the seams are mixed in here, on the builder's 'edge' strips
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_type, at.attribute_name = "GEOMETRY", "edge"
    k = nt.nodes.new("ShaderNodeMath")
    k.operation = "MULTIPLY"
    k.inputs[1].default_value = seams
    nt.links.new(at.outputs["Fac"], k.inputs[0])
    nt.links.new(loop_mat._mix(nt, "MIX", k.outputs[0], bsdf.inputs["Base Color"].links[0].from_socket, (*SEAM, 1)), bsdf.inputs["Base Color"])
    if moss is not None:
        paint_moss(m, thresh=moss, **dict(dict(col=MOSS_BARK), **(moss_kw or {})))
    return m


MOSS_COL = (0.095, 0.14, 0.05)  # the temple's painted moss (paint.MOSS_COL)
MOSS_BARK = (0.07, 0.074, 0.034)  # r04: the reference's moss on bark is olive-yellow; the temple green read as lime paint


def paint_moss(m, scale=4.0, thresh=0.6, w_up=0.22, col=MOSS_COL, breakup=0.04, stretch=(0.45, 1.0, 1.0)):
    """Moss as paint (user: moss is texture, not geometry): blobby object-space noise patches with a crisp edge, more of them on up-facing
    faces, none underneath. Mixed over whatever feeds the material's base colour."""
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    src = bsdf.inputs["Base Color"].links[0].from_socket

    def node(kind, **props):
        n = nt.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        return n

    def math_(op, a, b):
        n = node("ShaderNodeMath", operation=op)
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs[0]

    tc = node("ShaderNodeTexCoord")
    nz = node("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value, nz.inputs["Detail"].default_value, nz.inputs["Roughness"].default_value = scale, 3.0, 0.62
    long = node("ShaderNodeVectorMath", operation="MULTIPLY")  # r07: patches run along the limb (object X)
    long.inputs[1].default_value = stretch
    nt.links.new(tc.outputs["Object"], long.inputs[0])
    nt.links.new(long.outputs["Vector"], nz.inputs["Vector"])
    fine = node("ShaderNodeTexNoise")  # value variation inside a patch
    fine.inputs["Scale"].default_value, fine.inputs["Detail"].default_value = scale * 3, 2.0  # r06: dab-sized tones, not specks
    nt.links.new(tc.outputs["Object"], fine.inputs["Vector"])
    sep = node("ShaderNodeSeparateXYZ")
    nt.links.new(node("ShaderNodeNewGeometry").outputs["Normal"], sep.inputs[0])
    up = sep.outputs["Z"]
    val = math_("ADD", nz.outputs["Fac"], math_("MULTIPLY", up, w_up))
    val = math_("ADD", val, math_("MULTIPLY", math_("SUBTRACT", fine.outputs["Fac"], 0.5), breakup))  # r05: small dabs with broken edges, not cut-out blobs
    mask = math_("MULTIPLY", math_("GREATER_THAN", val, thresh), math_("GREATER_THAN", up, -0.25))
    tone = node("ShaderNodeVectorMath", operation="SCALE")
    tone.inputs[0].default_value = col
    nt.links.new(math_("ADD", math_("MULTIPLY", fine.outputs["Fac"], 0.9), 0.45), tone.inputs["Scale"])
    nt.links.new(loop_mat._mix(nt, "MIX", mask, src, tone.outputs["Vector"]), bsdf.inputs["Base Color"])
    return m


def leaf_mat(name="M_leaf", **over):
    return _spec(loop_mat.material(name, rel("textures/leaf.png"), **dict(LEAF, **over)))


def flat_mat(name, col, rough=1.0, emit=None, strength=0.0):
    """Plain colour material (linear RGB), optionally emissive."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Specular IOR Level"].default_value = 0.0
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m
