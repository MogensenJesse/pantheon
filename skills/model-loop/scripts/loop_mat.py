"""Stylised material helpers for the model loop (EEVEE-safe, no UVs needed).

edge_mask(ob)  writes a per-vertex 'curv' colour attribute on the mesh: 0.5 flat, > 0.5 convex ridge,
               < 0.5 crease. Mesh data, so linked duplicates share it. Re-run after every rebuild.
material(name, png, tile_m, rough, ridge, crease)  box-projected image texture, lightened on ridges
               (warm screen) and darkened in creases (multiply) through 'curv', like a hand-painted
               asset. Returns the material; assign it to the mesh yourself.
MCP:
    import sys, importlib; sys.path.insert(0, r"<SKILL_DIR>/scripts")
    import loop_mat; importlib.reload(loop_mat)
    loop_mat.edge_mask(bpy.data.objects["stone_a"])
    m = loop_mat.material("M_stone", r"//textures/stone.png", tile_m=0.6, rough=0.9)
"""
import bpy
import numpy as np


def edge_mask(ob, smooth=3, gain=1.6):
    me = ob.data
    n = len(me.vertices)
    co = np.empty(n * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)
    nor = np.empty(n * 3)
    me.vertex_normals.foreach_get("vector", nor)
    nor = nor.reshape(n, 3)
    ev = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", ev)
    ev = ev.reshape(-1, 2)
    cnt = np.zeros(n)
    np.add.at(cnt, ev[:, 0], 1)
    np.add.at(cnt, ev[:, 1], 1)
    cnt = np.maximum(cnt, 1)

    def avg(x):
        s = np.zeros_like(x)
        np.add.at(s, ev[:, 0], x[ev[:, 1]])
        np.add.at(s, ev[:, 1], x[ev[:, 0]])
        return s / (cnt[:, None] if x.ndim == 2 else cnt)

    edge_len = np.linalg.norm(co[ev[:, 0]] - co[ev[:, 1]], axis=1).mean()
    k = np.einsum("vk,vk->v", nor, co - avg(co)) / edge_len  # ~ bend angle per edge; > 0 on ridges
    for _ in range(smooth):
        k = avg(k)
    curv = 0.5 + np.clip(k * gain, -0.5, 0.5)
    attr = me.color_attributes.get("curv") or me.color_attributes.new("curv", "FLOAT_COLOR", "POINT")
    rgba = np.repeat(curv[:, None], 4, axis=1)
    rgba[:, 3] = 1
    attr.data.foreach_set("color", rgba.ravel())
    me.update()
    return {"ridge_frac": round(float((curv > 0.6).mean()), 3), "crease_frac": round(float((curv < 0.4).mean()), 3)}


def _mix(nt, blend, fac, a, b):
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type, m.blend_type, m.clamp_result = "RGBA", blend, True
    cols = [s for s in m.inputs if s.type == "RGBA"]
    if isinstance(fac, float):
        m.inputs[0].default_value = fac
    else:
        nt.links.new(fac, m.inputs[0])
    for sock, val in ((cols[0], a), (cols[1], b)):
        if isinstance(val, tuple):
            sock.default_value = val
        else:
            nt.links.new(val, sock)
    return next(s for s in m.outputs if s.type == "RGBA")


def _grade(nt, col, obj_var, top_light, ao, gain=1.0, bottom_dark=0.0, face_var=0.0, face_attr="fvar", end_dark=0.0):
    """Scale the colour by: per-object random value (works on linked copies), a lift on up-facing
    faces, and ambient-occlusion darkening in creases/joints (EEVEE-safe AO node)."""
    def map_range(src, a, b, c, d):
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.clamp = True
        for k, v in (("From Min", a), ("From Max", b), ("To Min", c), ("To Max", d)):
            mr.inputs[k].default_value = v
        nt.links.new(src, mr.inputs["Value"])
        return mr.outputs["Result"]
    factors = []
    if gain != 1.0:  # overall albedo scale, e.g. 0.7 when the rig renders the reference's value too bright
        v = nt.nodes.new("ShaderNodeValue")
        v.outputs[0].default_value = gain
        factors.append(v.outputs[0])
    if obj_var:
        factors.append(map_range(nt.nodes.new("ShaderNodeObjectInfo").outputs["Random"], 0, 1, 1 - obj_var, 1 + obj_var))
    if top_light:
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(nt.nodes.new("ShaderNodeNewGeometry").outputs["Normal"], sep.inputs[0])
        factors.append(map_range(sep.outputs["Z"], 0.6, 0.95, 1, 1 + top_light))
    if ao:
        aon = nt.nodes.new("ShaderNodeAmbientOcclusion")
        aon.inputs["Distance"].default_value = 0.06
        factors.append(map_range(aon.outputs["AO"], 0, 1, 1 - ao, 1))
    if bottom_dark:  # lower ~20 % of each object a little darker (painted value gradient)
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(nt.nodes.new("ShaderNodeTexCoord").outputs["Generated"], sep.inputs[0])
        factors.append(map_range(sep.outputs["Z"], 0.0, 0.25, 1 - bottom_dark, 1))
    if end_dark:  # faces pointing along the object's X axis (wood end grain) darker
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(nt.nodes.new("ShaderNodeTexCoord").outputs["Normal"], sep.inputs[0])
        ab = nt.nodes.new("ShaderNodeMath")
        ab.operation = "ABSOLUTE"
        nt.links.new(sep.outputs["X"], ab.inputs[0])
        factors.append(map_range(ab.outputs[0], 0.7, 0.9, 1, 1 - end_dark))
    if face_var:  # flat value shift per facet: a 0..1 random FACE attribute written by the builder
        at = nt.nodes.new("ShaderNodeAttribute")
        at.attribute_type, at.attribute_name = "GEOMETRY", face_attr
        factors.append(map_range(at.outputs["Fac"], 0, 1, 1 - face_var, 1 + face_var))
    if not factors:
        return col
    f = factors[0]
    for g in factors[1:]:
        m = nt.nodes.new("ShaderNodeMath")
        m.operation = "MULTIPLY"
        nt.links.new(f, m.inputs[0])
        nt.links.new(g, m.inputs[1])
        f = m.outputs[0]
    sc = nt.nodes.new("ShaderNodeVectorMath")
    sc.operation = "SCALE"
    nt.links.new(col, sc.inputs[0])
    nt.links.new(f, sc.inputs["Scale"])
    return sc.outputs["Vector"]


def material(name, png, tile_m=1.0, rough=0.85, ridge=0.55, crease=0.45,
             ridge_col=(0.62, 0.55, 0.5, 1), crease_col=(0.22, 0.22, 0.26, 1), mask="curv",
             obj_var=0.0, top_light=0.0, ao=0.0, gain=1.0, bottom_dark=0.0, face_var=0.0,
             tex_sat=1.0, tex_contrast=1.0, tint=None, top_flat=False, end_dark=0.0, tex_scale=(1.0, 1.0, 1.0),
             warp=0.0, side_sat=1.0, end_rings=0.0, ring_scale=6.0, ring_offset=(0.0, 0.0), tex_offset=(0.0, 0.0, 0.0)):
    """mask='curv': per-vertex curvature from edge_mask() (dense meshes).
    mask='edge': a 0/1 face attribute on bevel strips (low-poly meshes): ridge only.
    obj_var: +-value per object (e.g. 0.08); top_light: lift on up-facing faces (0.12); ao: crease darkening (0.3);
    gain: overall albedo scale; bottom_dark: darker lower edge (0.08); face_var: per-facet value from
    the 'fvar' face attribute (0.06); tex_sat / tex_contrast: pull the texture toward grey / its mean colour;
    tint: RGB multiplier for a slight hue shift, e.g. (0.97, 0.95, 1.0);
    top_flat: up/down-facing faces use a FLAT (x, y) projection so grain follows the object's X axis on top too
    (BOX projection turns it 90 deg there); model directional textures (wood) with their length along X;
    end_dark: darker faces along the object's X axis (wood end grain), e.g. 0.3;
    tex_scale: per-axis multiplier on tile_m, e.g. (1, 3, 3) for grain bands 3x wider across a plank;
    warp: let lengthwise bands wander (noise offset across Y/Z, in texture units, e.g. 0.01);
    side_sat: saturation of non-up faces (e.g. 0.75 for browner wood sides);
    end_rings: darker growth rings on the faces along the object's X axis (wood end grain), e.g. 0.25;
    ring_scale: rings across the end face (bounding-box coords, centred), e.g. 6;
    ring_offset: move the ring centre (pith) in bounding-box units (Y, Z), e.g. (0.15, -0.2);
    tex_offset: shift the texture (in texture units) so a feature such as a knot row lands on the part."""
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt = mat.node_tree
    for nd in [nd for nd in nt.nodes if nd.type not in ("BSDF_PRINCIPLED", "OUTPUT_MATERIAL")]:
        nt.nodes.remove(nd)
    bsdf = next(nd for nd in nt.nodes if nd.type == "BSDF_PRINCIPLED")
    tc, mp, tex = nt.nodes.new("ShaderNodeTexCoord"), nt.nodes.new("ShaderNodeMapping"), nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(png, check_existing=True)
    tex.projection, tex.projection_blend = "BOX", 0.2
    mp.inputs["Scale"].default_value = tuple(1 / (tile_m * k) for k in tex_scale)
    mp.inputs["Location"].default_value = tex_offset
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    uv = mp.outputs["Vector"]
    if warp:  # wandering grain: low-frequency noise pushes the bands sideways (Y/Z), never along X
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 3.0
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        sub = nt.nodes.new("ShaderNodeVectorMath")
        sub.operation = "SUBTRACT"
        nt.links.new(nz.outputs["Color"], sub.inputs[0])
        sub.inputs[1].default_value = (0.5, 0.5, 0.5)
        mul = nt.nodes.new("ShaderNodeVectorMath")
        mul.operation = "MULTIPLY"
        nt.links.new(sub.outputs[0], mul.inputs[0])
        mul.inputs[1].default_value = (0.0, 2 * warp, 2 * warp)
        add = nt.nodes.new("ShaderNodeVectorMath")
        add.operation = "ADD"
        nt.links.new(uv, add.inputs[0])
        nt.links.new(mul.outputs[0], add.inputs[1])
        uv = add.outputs[0]
    nt.links.new(uv, tex.inputs["Vector"])
    tex_col = tex.outputs["Color"]
    if top_flat:
        flat = nt.nodes.new("ShaderNodeTexImage")
        flat.image, flat.projection = tex.image, "FLAT"
        nt.links.new(uv, flat.inputs["Vector"])
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(nt.nodes.new("ShaderNodeNewGeometry").outputs["Normal"], sep.inputs[0])
        ab = nt.nodes.new("ShaderNodeMath")
        ab.operation = "ABSOLUTE"
        nt.links.new(sep.outputs["Z"], ab.inputs[0])
        mr = nt.nodes.new("ShaderNodeMapRange")
        mr.clamp = True
        mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = 0.6, 0.8
        nt.links.new(ab.outputs[0], mr.inputs["Value"])
        tex_col = _mix(nt, "MIX", mr.outputs["Result"], tex_col, flat.outputs["Color"])
    if tex_sat != 1.0:
        hs = nt.nodes.new("ShaderNodeHueSaturation")
        hs.inputs["Saturation"].default_value = tex_sat
        nt.links.new(tex_col, hs.inputs["Color"])
        tex_col = hs.outputs["Color"]
    if tex_contrast != 1.0:  # blend toward the image's mean colour: softer blotches, same average
        import numpy as np
        px = np.empty(len(tex.image.pixels), dtype=np.float32)
        tex.image.pixels.foreach_get(px)
        mean = px.reshape(-1, 4)[:, :3].mean(axis=0)
        if tex.image.colorspace_settings.name == "sRGB":  # pixels are stored sRGB; the node outputs linear
            mean = np.where(mean <= 0.04045, mean / 12.92, ((mean + 0.055) / 1.055) ** 2.4)
        g = mean.mean()
        mean = mean + (g - mean) * (1 - tex_sat)  # same desaturation as above
        tex_col = _mix(nt, "MIX", 1 - tex_contrast, tex_col, (float(mean[0]), float(mean[1]), float(mean[2]), 1))
    if tint:
        tex_col = _mix(nt, "MULTIPLY", 1.0, tex_col, (*tint, 1))
    if end_rings:  # concentric growth rings on the end faces, centred on the end face (bbox coords, Y/Z only)
        sep3 = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Generated"], sep3.inputs[0])
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        for axis, off in (("Y", ring_offset[0]), ("Z", ring_offset[1])):
            c = nt.nodes.new("ShaderNodeMath")
            c.operation = "SUBTRACT"
            nt.links.new(sep3.outputs[axis], c.inputs[0])
            c.inputs[1].default_value = 0.5 + off
            nt.links.new(c.outputs[0], comb.inputs[axis])
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type, wave.rings_direction = "RINGS", "SPHERICAL"
        wave.inputs["Scale"].default_value = ring_scale
        wave.inputs["Distortion"].default_value = 2.0
        nt.links.new(comb.outputs[0], wave.inputs["Vector"])
        sepn = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Normal"], sepn.inputs[0])
        absx = nt.nodes.new("ShaderNodeMath")
        absx.operation = "ABSOLUTE"
        nt.links.new(sepn.outputs["X"], absx.inputs[0])
        endm = nt.nodes.new("ShaderNodeMapRange")
        endm.clamp = True
        endm.inputs["From Min"].default_value, endm.inputs["From Max"].default_value = 0.7, 0.9
        endm.inputs["To Max"].default_value = end_rings
        nt.links.new(absx.outputs[0], endm.inputs["Value"])
        ringm = nt.nodes.new("ShaderNodeMath")
        ringm.operation = "MULTIPLY"
        nt.links.new(endm.outputs["Result"], ringm.inputs[0])
        nt.links.new(wave.outputs["Fac"], ringm.inputs[1])
        tex_col = _mix(nt, "MULTIPLY", ringm.outputs[0], tex_col, (0.45, 0.4, 0.38, 1))
    if side_sat != 1.0:  # less saturated on faces that don't point up (wood sides read browner)
        hs2 = nt.nodes.new("ShaderNodeHueSaturation")
        hs2.inputs["Saturation"].default_value = side_sat
        nt.links.new(tex_col, hs2.inputs["Color"])
        sep2 = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(nt.nodes.new("ShaderNodeNewGeometry").outputs["Normal"], sep2.inputs[0])
        mr2 = nt.nodes.new("ShaderNodeMapRange")
        mr2.clamp = True
        mr2.inputs["From Min"].default_value, mr2.inputs["From Max"].default_value = 0.8, 0.5
        nt.links.new(sep2.outputs["Z"], mr2.inputs["Value"])
        tex_col = _mix(nt, "MIX", mr2.outputs["Result"], tex_col, hs2.outputs["Color"])
    at = nt.nodes.new("ShaderNodeAttribute")
    at.attribute_type, at.attribute_name = "GEOMETRY", mask
    if mask != "curv":
        hf = nt.nodes.new("ShaderNodeMath")
        hf.operation = "MULTIPLY"
        nt.links.new(at.outputs["Fac"], hf.inputs[0])
        hf.inputs[1].default_value = ridge
        col = _mix(nt, "SCREEN", hf.outputs[0], tex_col, ridge_col)
        nt.links.new(_grade(nt, col, obj_var, top_light, ao, gain, bottom_dark, face_var, end_dark=end_dark), bsdf.inputs["Base Color"])
        bsdf.inputs["Roughness"].default_value = rough
        return mat
    hi, lo = nt.nodes.new("ShaderNodeMapRange"), nt.nodes.new("ShaderNodeMapRange")
    for mr, a, b in ((hi, 0.55, 0.85), (lo, 0.45, 0.2)):
        mr.clamp = True
        mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = a, b
        nt.links.new(at.outputs["Fac"], mr.inputs["Value"])
    hf, lf = nt.nodes.new("ShaderNodeMath"), nt.nodes.new("ShaderNodeMath")
    for mth, src, s in ((hf, hi, ridge), (lf, lo, crease)):
        mth.operation = "MULTIPLY"
        nt.links.new(src.outputs["Result"], mth.inputs[0])
        mth.inputs[1].default_value = s
    col = _mix(nt, "SCREEN", hf.outputs[0], tex_col, ridge_col)
    col = _mix(nt, "MULTIPLY", lf.outputs[0], col, crease_col)
    nt.links.new(_grade(nt, col, obj_var, top_light, ao, gain, bottom_dark, face_var, end_dark=end_dark), bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = rough
    return mat
