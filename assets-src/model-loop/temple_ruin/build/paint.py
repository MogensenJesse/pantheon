"""Moss as paint (user: keep it a texture) and concave chips for the temple stone parts.
moss_spec / stone_moss_mat: a mask in the stone material, driven by object-space noise, up-facing bias and closeness to a top corner, so the
patch is one lobed blob that wraps a corner and runs down the side with a crisp painted edge. Linked copies share it; every variant gets its own.
bites: concave chips (rotated cube cutters on corners and edges, exact boolean)."""
import random

import bmesh
import bpy
from mathutils import Euler

import loop_mat
from tcommon import STONE, TIMBER, _rel, _spec

TINT_TOP, TINT_SIDE = (0.94, 0.92, 0.88, 1), (1.66, 1.73, 1.80, 1)  # linear multipliers: warm light tops, lighter near-neutral cool sides (7 judges: sides too dark / too blue, wanted ~#7a8088 .. #a5a9ac)
MOSS_COL = (0.095, 0.14, 0.05, 1)  # measured: render of the ref's lit moss (~#7b8644) through the studio light


def moss_spec(seed, dims, cover):
    """Mask parameters for one block: a top corner, a radius and a threshold from the wanted cover (0 = no moss). Put a `spots` list of
    (point, radius) into the result to grow several patches (a lower side corner, a base corner ...)."""
    rnd = random.Random(seed * 17 + 5)
    w, d, h = dims
    return dict(p0=(rnd.choice((-1, 1)) * w * 0.42, rnd.choice((-1, 1)) * d * 0.42, h), radius=max(w, d) * 0.62,
                thresh=(1.05 - 1.2 * cover) if cover > 0 else 9.0, offset=(rnd.uniform(0, 9), rnd.uniform(0, 9), rnd.uniform(0, 9)))


def stone_moss_mat(name, spec, w_noise=0.4, w_up=0.3, w_prox=0.7, noise_scale=14.0, cell=1.0, noise_gain=0.5, kind="stone", **over):
    """The stone material plus the moss mask (flat olive paint, crisp edge). `spec` comes from moss_spec."""
    if kind == "timber":  # the same painted moss patches on weathered wood
        m = _spec(loop_mat.material(name, _rel("textures/timber_paint.png"), **dict(TIMBER, **over)))
    else:
        m = _spec(loop_mat.material(name, _rel("textures/stone_paint_hi.png"), **dict(STONE, **over)))
    for n in m.node_tree.nodes:  # turn the box-projected texture about Z so symmetric faces differ
        if n.type == "MAPPING":
            n.inputs["Rotation"].default_value = (0.0, 0.0, 0.55 if kind != "timber" else 0.3)
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    stone_col = bsdf.inputs["Base Color"].links[0].from_socket
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Location"].default_value = spec["offset"]
    mp.inputs["Scale"].default_value = (noise_scale,) * 3
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Detail"].default_value = 2.0
    nz.inputs["Roughness"].default_value = 0.55
    # the noise is read at each Voronoi cell's feature point, so it is constant over a cell: patch edges become straight facet-like polygons
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.inputs["Scale"].default_value = cell
    nt.links.new(mp.outputs["Vector"], vor.inputs["Vector"])
    nz.inputs["Scale"].default_value = noise_gain
    nt.links.new(vor.outputs["Position"], nz.inputs["Vector"])

    def mr(src, a, b, c, d):
        n = nt.nodes.new("ShaderNodeMapRange")
        n.clamp = True
        for k, v in (("From Min", a), ("From Max", b), ("To Min", c), ("To Max", d)):
            n.inputs[k].default_value = v
        nt.links.new(src, n.inputs["Value"])
        return n.outputs["Result"]

    def math_(op, a, b):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, float):
                n.inputs[i].default_value = v
            else:
                nt.links.new(v, n.inputs[i])
        return n.outputs[0]

    sepn = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(nt.nodes.new("ShaderNodeNewGeometry").outputs["Normal"], sepn.inputs[0])
    up = mr(sepn.outputs["Z"], 0.2, 0.95, 0.0, 1.0)
    prox = None
    for p0, rad in spec.get("spots") or [(spec["p0"], spec["radius"])]:  # one radial falloff per patch; the strongest wins
        dist = nt.nodes.new("ShaderNodeVectorMath")
        dist.operation = "DISTANCE"
        nt.links.new(vor.outputs["Position"], dist.inputs[0])  # measured from the cell's centre, so the whole patch edge is made of cell sides
        dist.inputs[1].default_value = tuple(c * noise_scale + o for c, o in zip(p0, spec["offset"]))  # the cell position lives in the mapped space
        pr = mr(dist.outputs["Value"], 0.0, rad * noise_scale, 1.0, 0.0)
        prox = pr if prox is None else math_("MAXIMUM", prox, pr)
    val = math_("ADD", math_("ADD", math_("MULTIPLY", mr(nz.outputs["Fac"], 0.3, 0.7, 0.0, 1.0), w_noise), math_("MULTIPLY", up, w_up)), math_("MULTIPLY", prox, w_prox))
    mask = math_("GREATER_THAN", val, spec["thresh"])  # a hard 0/1 step: a cell or face can never land half-way and show up as a ghost patch
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_type, at.attribute_name = "GEOMETRY", "fvar"
    var = mr(at.outputs["Fac"], 0, 1, 0.88, 1.12)
    # painted value variation inside the moss patches: the moss texture's luminance, normalised to ~1, scales the flat moss colour
    mt = nt.nodes.new("ShaderNodeTexImage")
    mt.image = bpy.data.images.load(_rel("textures/moss.png"), check_existing=True)
    mt.projection, mt.projection_blend = "BOX", 0.2
    mmp = nt.nodes.new("ShaderNodeMapping")
    mmp.inputs["Scale"].default_value = (1 / 0.7,) * 3
    nt.links.new(tc.outputs["Object"], mmp.inputs["Vector"])
    nt.links.new(mmp.outputs["Vector"], mt.inputs["Vector"])
    lum = nt.nodes.new("ShaderNodeVectorMath")
    lum.operation = "DOT_PRODUCT"
    lum.inputs[1].default_value = (0.2126, 0.7152, 0.0722)
    nt.links.new(mt.outputs["Color"], lum.inputs[0])
    mvar = mr(lum.outputs["Value"], 0.12, 0.3, 0.97, 1.04)  # texture luminance (mean ~0.21) -> 0.6 .. 1.5
    both = math_("MULTIPLY", var, mvar)
    sc = nt.nodes.new("ShaderNodeVectorMath")
    sc.operation = "SCALE"
    sc.inputs[0].default_value = MOSS_COL[:3]
    nt.links.new(both, sc.inputs["Scale"])
    nz_up = mr(sepn.outputs["Z"], 0.5, 0.95, 0.0, 1.0)
    tm = nt.nodes.new("ShaderNodeMix")  # vector mix, so tints above 1 are not clamped
    tm.data_type = "VECTOR"
    ids = {x.identifier: x for x in tm.inputs}
    ids["A_Vector"].default_value, ids["B_Vector"].default_value = TINT_SIDE[:3], TINT_TOP[:3]
    nt.links.new(nz_up, ids["Factor_Float"])
    tone = nt.nodes.new("ShaderNodeVectorMath")
    tone.operation = "MULTIPLY"
    nt.links.new(stone_col, tone.inputs[0])
    nt.links.new(next(x for x in tm.outputs if x.type == "VECTOR"), tone.inputs[1])
    hv = nt.nodes.new("ShaderNodeMix")  # stone pack look: every facet leans a little pink or a little green (per-facet hue shift from fvar)
    hv.data_type = "VECTOR"
    hid = {x.identifier: x for x in hv.inputs}
    hid["A_Vector"].default_value, hid["B_Vector"].default_value = (1.03, 0.985, 0.99), (0.975, 1.012, 0.996)
    nt.links.new(at.outputs["Fac"], hid["Factor_Float"])
    hue = nt.nodes.new("ShaderNodeVectorMath")
    hue.operation = "MULTIPLY"
    nt.links.new(tone.outputs["Vector"], hue.inputs[0])
    nt.links.new(next(x for x in hv.outputs if x.type == "VECTOR"), hue.inputs[1])
    toned = hue.outputs["Vector"]
    mixed = loop_mat._mix(nt, "MIX", mask, toned if kind != "timber" else stone_col, sc.outputs["Vector"])
    nt.links.new(mixed, bsdf.inputs["Base Color"])
    return m


def bites(ob, seed, top=3, base=1, vertical=1, size=(0.035, 0.06), cracks=0):
    """Concave chips: rotated cube cutters centred on top corners / top edges, on the base edge and on vertical edges, subtracted with an exact
    boolean. Positions come from the object's bounding box and differ with the seed."""
    rnd = random.Random(seed * 29 + 11)
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    x0, x1, y0, y1, z1 = min(xs), max(xs), min(ys), max(ys), max(zs)
    spots = []
    for _ in range(top):
        k = rnd.random()
        if k < 0.5:  # a top corner
            spots.append((rnd.choice((x0, x1)), rnd.choice((y0, y1)), z1))
        elif k < 0.75:  # along a top edge parallel to x
            spots.append((rnd.uniform(0.2, 0.8) * (x1 - x0) + x0, rnd.choice((y0, y1)), z1))
        else:
            spots.append((rnd.choice((x0, x1)), rnd.uniform(0.2, 0.8) * (y1 - y0) + y0, z1))
    for _ in range(base):
        spots.append((rnd.uniform(0.15, 0.85) * (x1 - x0) + x0, rnd.choice((y0, y1)), 0.0))
    for _ in range(vertical):
        spots.append((rnd.choice((x0, x1)), rnd.choice((y0, y1)), rnd.uniform(0.25, 0.7) * z1))
    cut = bmesh.new()
    for x, y, z in spots:
        res = bmesh.ops.create_cube(cut, size=rnd.uniform(*size))
        bmesh.ops.transform(cut, matrix=Euler((rnd.uniform(0, 3.14), rnd.uniform(0, 3.14), rnd.uniform(0, 3.14))).to_matrix().to_4x4(), verts=res["verts"])
        bmesh.ops.translate(cut, vec=(x, y, z), verts=res["verts"])
    from mathutils import Matrix
    for _ in range(cracks):  # a thin plank half sunk into the top: a crack groove across the stone
        res = bmesh.ops.create_cube(cut, size=1.0)
        m = Matrix.Translation((rnd.choice((-1, 1)) * (x1 - x0) * rnd.uniform(0.18, 0.3) + (x0 + x1) / 2, rnd.choice((-1, 1)) * (y1 - y0) * rnd.uniform(0.15, 0.4) + (y0 + y1) / 2, z1)) @ Matrix.Rotation(rnd.uniform(0, 3.14), 4, 'Z') @ Matrix.Diagonal((max(x1 - x0, y1 - y0) * rnd.uniform(0.25, 0.45), 0.014, 0.035, 1.0))
        bmesh.ops.transform(cut, matrix=m, verts=res['verts'])
    bmesh.ops.recalc_face_normals(cut, faces=cut.faces[:])
    me = bpy.data.meshes.new("bites")
    cut.to_mesh(me)
    cut.free()
    cob = bpy.data.objects.new("bites", me)
    bpy.context.scene.collection.objects.link(cob)
    mod = ob.modifiers.new("bites", "BOOLEAN")
    mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cob
    mod.use_self = True
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier="bites")
    bpy.data.objects.remove(cob)
    bpy.data.meshes.remove(me)


def cut_boxes(ob, boxes):
    """Subtract oriented boxes [(centre, size, (rx, ry, rz))] from `ob`, one exact boolean per box (overlapping cutters in one boolean can break the solid)."""
    from mathutils import Matrix
    for k, (c, size, rot) in enumerate(boxes):
        cut = bmesh.new()
        res = bmesh.ops.create_cube(cut, size=1.0)
        m = Matrix.Translation(c) @ Euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((size[0], size[1], size[2], 1.0))
        bmesh.ops.transform(cut, matrix=m, verts=res["verts"])
        bmesh.ops.recalc_face_normals(cut, faces=cut.faces[:])
        me = bpy.data.meshes.new("cuts")
        cut.to_mesh(me)
        cut.free()
        cob = bpy.data.objects.new("cuts", me)
        bpy.context.scene.collection.objects.link(cob)
        mod = ob.modifiers.new("cuts", "BOOLEAN")
        mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cob
        mod.use_hole_tolerant = True
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
            bpy.ops.object.modifier_apply(modifier="cuts")
        bpy.data.objects.remove(cob)
        bpy.data.meshes.remove(me)


def drop_islands(ob, min_verts=60):
    """Delete loose bits left over after cuts: connected pieces with fewer than `min_verts` vertices."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    seen, dead = set(), []
    for v0 in bm.verts:
        if v0.index in seen:
            continue
        comp, stack = [], [v0]
        seen.add(v0.index)
        while stack:
            v = stack.pop()
            comp.append(v)
            for e in v.link_edges:
                o = e.other_vert(v)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        if len(comp) < min_verts:
            dead += comp
    if dead:
        bmesh.ops.delete(bm, geom=dead, context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()
