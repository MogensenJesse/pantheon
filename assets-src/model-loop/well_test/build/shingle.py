"""Part 'shingle': one thin stylised roof shingle, 3 variants. build(name, variant, dims) -> object in P_shingle.

Lies on z = 0, centred in XY, long side along Y, grain along Y. The uneven rounded edge is at -Y (the eave end).
One planar outline (rounded plan corners + a per-variant bottom-edge curve) is extruded into a slightly tapered board
(thick at the eave end, thinner at the top, like a real shingle), then the top rim gets a soft 2-segment round and the
bottom rim a small chamfer, on the still-simple solid (build order lesson: bevel before any deformation, no extra loops).
Low poly on purpose: about 60-80 linked copies go on a roof.
"""
import math

import bmesh
import bpy
from mathutils import Vector

# r01 settings. Bottom-edge curves are dy(x) in metres, relative to the nominal bottom (>= 0 pulls the edge up).
# v2 (judge r10, part scope): the roof read as scalloped, cupped clay tiles; the reference has flat rectangular boards with a
# near-straight, slightly slanted eave. v1 values: top_bevel .006 x2 segments, sharp_deg 50, corner_r .016/.018/.014/.012,
# a: step jog_drop .024, b: round sag .034, c: slant drop .026 wave .0045 notch .01.
P = dict(
    taper=0.006,  # thickness lost from the eave end to the top end
    top_bevel=0.004, top_bevel_segments=1, bottom_bevel=0.003, sharp_deg=30.0,
    corner_r=dict(bl=0.006, br=0.007, tr=0.005, tl=0.005),
    arc_pts=3, bottom_pts=13,
    variants=dict(
        # a: a small step in the eave edge, left part pulled up
        a=dict(dims=(0.230, 0.284, 0.021), kind="step", jog_at=0.42, jog_w=0.03, jog_drop=0.010, wave=0.0015, wave_ph=0.3),
        # b: nearly straight eave, a hair of sag, a little off-centre
        b=dict(dims=(0.242, 0.272, 0.020), kind="round", sag=0.008, centre=0.56, skew=0.004),
        # c: slanted eave end that falls to the right, no notch
        c=dict(dims=(0.222, 0.296, 0.022), kind="slant", drop=0.014, wave=0.0015, notch_at=0.8, notch=0.003),
    ),
)


def _smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def _bottom(v, x, W):
    """Eave-end offset (>= 0, metres) at plan position x in [-W/2, W/2]."""
    u = x / W + 0.5
    k = v["kind"]
    if k == "step":
        d = v["jog_drop"] * (1 - _smooth((u - v["jog_at"]) / (v["jog_w"] / W) + 0.5))
        return d + v["wave"] * math.sin(u * 7.0 + v["wave_ph"]) * _smooth((u - v["jog_at"]) * 4)
    if k == "round":
        c = v["centre"]
        return v["sag"] * (2 * (u - c) * (0.9 if u > c else 1.1)) ** 2 / 1.2 + v["skew"] * (u - 0.5)
    d = v["drop"] * (1 - u) + v["wave"] * math.sin(u * 9.0 + 1.0)
    if abs(u - v["notch_at"]) < 0.08:
        d += v["notch"] * (1 - abs(u - v["notch_at"]) / 0.08)
    return d


def _fillet(prev, cur, nxt, r, n):
    """Quadratic-bezier rounded corner at cur, n+1 points."""
    a, b = (prev - cur), (nxt - cur)
    ra, rb = min(r, a.length * 0.9), min(r, b.length * 0.9)
    p0, p2 = cur + a.normalized() * ra, cur + b.normalized() * rb
    out = []
    for i in range(n + 1):
        t = i / n
        out.append((1 - t) ** 2 * p0 + 2 * t * (1 - t) * cur + t * t * p2)
    return out


def outline(v):
    W, L, _ = v["dims"]
    xs = [-W / 2 + W * i / (P["bottom_pts"] - 1) for i in range(P["bottom_pts"])]
    bot = [Vector((x, -L / 2 + _bottom(v, x, W))) for x in xs]
    tr, tl = Vector((W / 2, L / 2)), Vector((-W / 2, L / 2))
    r, n = P["corner_r"], P["arc_pts"]
    pts = []
    pts += _fillet(Vector((-W / 2, 0.0)), bot[0], bot[1], r["bl"], n)  # left side comes down into the first bottom point
    pts += bot[1:-1]
    pts += _fillet(bot[-2], bot[-1], Vector((W / 2, 0.0)), r["br"], n)
    pts += _fillet(Vector((W / 2, 0.0)), tr, tl, r["tr"], n)
    pts += _fillet(tr, tl, Vector((-W / 2, 0.0)), r["tl"], n)
    return pts


def build(name="shingle_a", variant="a", dims=None, col="P_shingle"):
    v = P["variants"][variant]
    if dims:
        v = dict(v, dims=dims)
    W, L, T = v["dims"]
    old = bpy.data.objects.get(name)
    if old:
        me_old = old.data
        bpy.data.objects.remove(old)
        bpy.data.meshes.remove(me_old)
    pts = outline(v)
    bm = bmesh.new()
    vs = [bm.verts.new((p.x, p.y, 0.0)) for p in pts]
    f = bm.faces.new(vs)
    if f.normal.z > 0:
        f.normal_flip()
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [x for x in ext["geom"] if isinstance(x, bmesh.types.BMVert)]
    ymin = min(p.y for p in pts)
    for x in top:  # tapered: thick at the eave end (-Y), thinner towards the top
        x.co.z = T - P["taper"] * (x.co.y - ymin) / L
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    lay = bm.faces.layers.float.get("edge") or bm.faces.layers.float.new("edge")
    bottom = [e for e in bm.edges if e.verts[0].co.z < 1e-6 and e.verts[1].co.z < 1e-6]
    bmesh.ops.bevel(bm, geom=bottom, offset=P["bottom_bevel"], segments=1, profile=0.5, affect="EDGES", clamp_overlap=False)
    topedges = [e for e in bm.edges if e.is_valid and e.verts[0].co.z > T * 0.5 and e.verts[1].co.z > T * 0.5
                and not (abs(e.verts[0].co.z - e.verts[1].co.z) > 0.9 * e.calc_length()) and e.calc_face_angle(0) > math.radians(10)]
    res = bmesh.ops.bevel(bm, geom=topedges, offset=P["top_bevel"], segments=P["top_bevel_segments"], profile=0.5,
                          affect="EDGES", clamp_overlap=False)
    for fc in res["faces"]:
        if fc.is_valid:
            fc[lay] = 1.0
    for fc in bm.faces:
        fc.smooth = True
    for e in bm.edges:
        e.smooth = not (e.is_manifold and e.calc_face_angle(0) > math.radians(P["sharp_deg"]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    zmin = min(x.co.z for x in bm.verts)
    for x in bm.verts:
        x.co.z -= zmin
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.data.collections[col].objects.link(ob)
    return ob


# r01 material knobs (colour calibrated with colstats against refs/shingle.png: top #eb8345, side #d66f3e)
# v2: render median (202,98,29) vs reference (241,128,78) on the roof slope rect (1020,230,520,230): gain .55 tint (1,.716,.248) -> gain 1.2 tint (.68,.60,1)
MAT = dict(tile_m=0.5, rough=0.8, ridge=0.08, ridge_col=(0.95, 0.62, 0.38, 1), mask="edge", obj_var=0.07, top_light=0.15,
           bottom_dark=0.10, tex_sat=0.85, top_flat=True, gain=0.82, tint=(1.0, 0.88, 0.515),  # 1st try gain 1.2 tint (.68,.6,1) -> median 236,130,126 (pink): B x0.35
           shade_bottom=0.16, shade_side=0.10, shade_rim=1.0, rim_col=(0.84, 0.62, 0.5), grain_fine=0.09)  # shade_*: soft painted darkening towards the eave end and the long edges
OFFSETS = {"M_shingle": (0.0, 0.0, 0.0), "M_shingle_b": (0.31, 0.0, 0.0), "M_shingle_c": (0.63, 0.0, 0.0)}  # three grain crops


def _shade(mat, bottom, side, rim=0.0, rim_col=(1, 1, 1), grain=0.0):
    """Multiply the final base colour by a soft value falloff: darker toward the eave end (-Y) and the long edges."""
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    link = bsdf.inputs["Base Color"].links[0]
    src = link.from_socket
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(nt.nodes.new("ShaderNodeTexCoord").outputs["Generated"], sep.inputs[0])

    def mr(sock, a, b, c, d):
        n = nt.nodes.new("ShaderNodeMapRange")
        n.clamp = True
        for k, val in (("From Min", a), ("From Max", b), ("To Min", c), ("To Max", d)):
            n.inputs[k].default_value = val
        nt.links.new(sock, n.inputs["Value"])
        return n.outputs["Result"]
    fy = mr(sep.outputs["Y"], 0.0, 0.45, 1 - bottom, 1.0)
    dist = nt.nodes.new("ShaderNodeMath")  # distance from the centre line in X: 0 .. 0.5
    dist.operation = "SUBTRACT"
    nt.links.new(sep.outputs["X"], dist.inputs[0])
    dist.inputs[1].default_value = 0.5
    ab = nt.nodes.new("ShaderNodeMath")
    ab.operation = "ABSOLUTE"
    nt.links.new(dist.outputs[0], ab.inputs[0])
    fx = mr(ab.outputs[0], 0.34, 0.5, 1.0, 1 - side)
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = "MULTIPLY"
    nt.links.new(fy, m.inputs[0])
    nt.links.new(fx, m.inputs[1])
    fac = m.outputs[0]
    if grain:  # thin lengthwise grain lines: noise squeezed along Y, so it adds crisp fine streaks the texture lacks
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (110.0, 7.0, 7.0)
        nt.links.new(nt.nodes.new("ShaderNodeTexCoord").outputs["Object"], mp.inputs["Vector"])
        nz = nt.nodes.new("ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 1.0
        nz.inputs["Detail"].default_value = 3.0
        nz.inputs["Roughness"].default_value = 0.6
        nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
        g = mr(nz.outputs["Fac"], 0.25, 0.75, 1 - grain, 1 + grain * 0.6)
        mg = nt.nodes.new("ShaderNodeMath")
        mg.operation = "MULTIPLY"
        nt.links.new(fac, mg.inputs[0])
        nt.links.new(g, mg.inputs[1])
        fac = mg.outputs[0]
    sc = nt.nodes.new("ShaderNodeVectorMath")
    sc.operation = "SCALE"
    nt.links.new(src, sc.inputs[0])
    nt.links.new(fac, sc.inputs["Scale"])
    out = sc.outputs["Vector"]
    if rim:  # rim and side faces (normal not up): darker and browner, reads as a soft dark edge from far away
        nz_ = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(nt.nodes.new("ShaderNodeNewGeometry").outputs["Normal"], nz_.inputs[0])
        k = mr(nz_.outputs["Z"], 0.9, 0.3, 0.0, rim)  # 0 on the top face .. rim on the vertical side
        mx = nt.nodes.new("ShaderNodeMix")
        mx.data_type, mx.blend_type = "RGBA", "MULTIPLY"
        a_in, b_in = [s_ for s_ in mx.inputs if s_.type == "RGBA"]
        nt.links.new(out, a_in)
        b_in.default_value = (*rim_col, 1)
        mx.inputs[0].default_value = 0.0
        nt.links.new(k, mx.inputs[0])
        out = next(s_ for s_ in mx.outputs if s_.type == "RGBA")
    nt.links.new(out, bsdf.inputs["Base Color"])
    for name in ("Specular IOR Level",):
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = 0.22


def make_materials(png):
    import importlib
    import loop_mat
    importlib.reload(loop_mat)
    kw = {k: v for k, v in MAT.items() if not k.startswith("shade_") and k not in ("rim_col", "grain_fine")}
    mats = {}
    for name, off in OFFSETS.items():
        m = loop_mat.material(name, png, tex_offset=off, **kw)
        _shade(m, MAT["shade_bottom"], MAT["shade_side"], MAT["shade_rim"], MAT["rim_col"], MAT["grain_fine"])
        mats[name] = m
    return mats
