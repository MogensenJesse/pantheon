"""Part 'bucket': chunky stylised wooden stave bucket with one iron band, a faceted iron bail with
eye rings and a wooden grip block (ref refs/bucket.png). build() -> objects in P_bucket:
  bucket       10 staves (wood, overlapping 1 mm so seams are chamfer V-grooves) + inner floor
  bucket_band  hammered iron band (cone ring)
  bucket_bail  faceted iron bail swept along an arch, two eye rings, pins, lug plates
  bucket_grip  octagonal wooden grip on the bail apex (built upright, rotated: grain runs along its length)
Axis = Z, bottom at z = 0. The bail plane is XZ (eyes on the +/-X staves, which are taller).
Round notes go next to P (judge fixes).
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

P = dict(
    n=10, H=0.27, R_top=0.155, R_bot=0.132, t=0.030,
    ear_extra=0.04, top_jit=0.006, tilt_t=0.004, tilt_ear=0.014, overlap=-0.002,
    ang_jit=0.012, lean_deg=0.8,
    corner_ch=0.007, top_ch_out=0.008, top_ch_in=0.004, bot_ch=0.004,
    floor_z=0.03, floor_t=0.016,
    band_z=0.185, band_h=0.055, band_t=0.012, band_seg=64, band_ch=0.003, band_jit=0.0011,
    arch=[(0.182, 0.277), (0.184, 0.308), (0.176, 0.357), (0.154, 0.405), (0.120, 0.442), (0.082, 0.466), (0.046, 0.478)],
    apex_z=0.481, bail_hn=0.0125, bail_hy=0.015, bail_sub=3, bail_jit=0.002,
    eye_r=0.026, eye_hole=0.0095, eye_w=0.018, eye_z=0.255, eye_off=0.028, pin_r=0.0098, pin_len=0.040,
    plate=(0.009, 0.038, 0.055),
    grip_len=0.13, grip_r=0.0235, grip_ch=0.006, grip_sides=8, grip_jit=0.14, grip_cut=0.008,
    sharp_deg=40.0,
)
MAT = dict(wood=dict(tile_m=0.5, tex_scale=(1.0, 1.0, 2.7), rough=0.8, tint=(1.0, 0.55, 0.12), gain=0.55, tex_sat=0.8,
                     ridge=0.1, ao=0.14, top_light=0.0, face_var=0.07, obj_var=0.04, bottom_dark=0.08, side_sat=0.85),
           iron=dict(tile_m=0.3, rough=0.6, tint=(1.0, 0.75, 0.69), gain=2.4, tex_contrast=0.55, ridge=0.12, ao=0.25, top_light=0.12, obj_var=0.04))


def Ro(z):
    return P["R_bot"] + (P["R_top"] - P["R_bot"]) * z / P["H"]


def _edge_layers(bm):
    return (bm.faces.layers.float.get("edge") or bm.faces.layers.float.new("edge"),
            bm.faces.layers.float.get("fvar") or bm.faces.layers.float.new("fvar"))


def _loft(bm, rings, closed_ends=True, edge_lay=None, fvar=None, edge_rows=(), val=0.5):
    """Quad strip between consecutive rings (lists of BMVerts, same length), caps at both ends.
    edge_rows: ring-pair indices whose faces get edge=1."""
    vs = [[bm.verts.new(p) for p in r] for r in rings]
    faces = []
    for i in range(len(vs) - 1):
        a, b = vs[i], vs[i + 1]
        for k in range(len(a)):
            k2 = (k + 1) % len(a)
            f = bm.faces.new((a[k], a[k2], b[k2], b[k]))
            faces.append(f)
            if edge_lay is not None and (i, k) in edge_rows:
                f[edge_lay] = 1.0
    if closed_ends:
        faces.append(bm.faces.new(vs[0][::-1]))
        faces.append(bm.faces.new(vs[-1]))
    if fvar is not None:
        for f in faces:
            f[fvar] = val
    return vs, faces


def _stave(bm, i, rnd, lay_e, lay_v):
    n, t = P["n"], P["t"]
    phi = 2 * math.pi * i / n + rnd.uniform(-1, 1) * P["ang_jit"] * 0.5
    ear = i % (n // 2) == 0
    ht = P["H"] + (P["ear_extra"] if ear else rnd.uniform(-1, 1) * P["top_jit"])
    slope_t = rnd.uniform(-1, 1) * (P["tilt_ear"] if ear else P["tilt_t"]) / 0.045
    slope_r = rnd.uniform(-0.15, 0.15)
    lean = math.radians(P["lean_deg"]) * rnd.uniform(-1, 1)
    dmid = math.pi / n + P["overlap"] * 0.5 / P["R_top"] + rnd.uniform(-1, 1) * P["ang_jit"] * 0.25
    cs = P["corner_ch"]
    levels = [(0.0, P["bot_ch"], P["bot_ch"], P["bot_ch"] * 0.5), (P["bot_ch"], 0, 0, 0),
              (ht - P["top_ch_out"], 0, 0, 0), (ht, P["top_ch_out"], P["top_ch_in"], 0.003)]
    rings = []
    for li, (z, co, ci, cside) in enumerate(levels):
        ro = Ro(z) - co
        ri = Ro(z) - t + ci
        d = dmid - cside / ro
        eps = cs / ro
        pts = [(-d, ro - cs), (-d + eps, ro), (0.0, ro), (d - eps, ro), (d, ro - cs), (d, ri), (0.0, ri), (-d, ri)]
        ring = []
        for th, r in pts:
            a = phi + th
            x, y = r * math.cos(a), r * math.sin(a)
            zz = z
            if li >= 2:  # slanted hand-cut top
                zz += slope_t * r * th + slope_r * (r - Ro(z))
            x += lean * zz * math.cos(phi)
            y += lean * zz * math.sin(phi)
            ring.append(Vector((x, y, zz)))
        rings.append(ring)
    # chamfer faces (outer corners + top chamfer) carry the faint edge highlight
    rows = {(0, k) for k in range(8)} | {(2, k) for k in range(8)} | {(1, 0), (1, 3)}
    _loft(bm, rings, True, lay_e, lay_v, rows, rnd.random())
    return phi, ht


def _floor(bm, lay_e, lay_v):
    z0, z1 = P["floor_z"], P["floor_z"] + P["floor_t"]
    r = Ro(z1) - P["t"] + 0.004
    rings = []
    for z, rr in ((z0, r - 0.004), (z0 + 0.003, r), (z1 - 0.003, r), (z1, r - 0.003)):
        rings.append([Vector((rr * math.cos(2 * math.pi * k / 40), rr * math.sin(2 * math.pi * k / 40), z)) for k in range(40)])
    _loft(bm, rings, True, lay_e, lay_v, {(2, k) for k in range(40)}, 0.5)


def _finish(bm, name, col, sharp=None):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    sharp = P["sharp_deg"] if sharp is None else sharp
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (e.is_manifold and e.calc_face_angle(0) > math.radians(sharp))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old)
    ob = bpy.data.objects.new(name, me)
    bpy.data.collections[col].objects.link(ob)
    return ob


def _body(col, rnd):
    bm = bmesh.new()
    lay_e, lay_v = _edge_layers(bm)
    info = [_stave(bm, i, rnd, lay_e, lay_v) for i in range(P["n"])]
    _floor(bm, lay_e, lay_v)
    return _finish(bm, "bucket", col), info


def _band(col, rnd):
    bm = bmesh.new()
    lay_e, lay_v = _edge_layers(bm)
    zc, h, th, ch, seg = P["band_z"], P["band_h"], P["band_t"], P["band_ch"], P["band_seg"]
    slope = (P["R_top"] - P["R_bot"]) / P["H"]
    ph = rnd.uniform(0, 6.28)
    # profile in (outward offset from the stave surface, dz): chamfered rectangle, 8 points
    prof = [(-0.002, -h / 2), (th - ch, -h / 2), (th, -h / 2 + ch), (th, h / 2 - ch), (th - ch, h / 2), (-0.002, h / 2)]
    rings = []
    knots = [rnd.uniform(-1, 1) for _ in range(seg // 4)]
    jit = [knots[(k // 4) % len(knots)] * (1 - (k % 4) / 4) + knots[(k // 4 + 1) % len(knots)] * ((k % 4) / 4) for k in range(seg)]
    for k in range(seg):
        a = 2 * math.pi * k / seg
        w = P["band_jit"] * (0.5 * math.sin(3 * a + ph) + 0.9 * jit[k])
        ring = []
        for off, dz in prof:
            z = zc + dz
            r = Ro(z) + off + (w if off > 0 else 0)
            ring.append(Vector((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    rings.append(rings[0])
    # closed ring (no caps): the last ring wraps to ring 0; chamfer strips (k = 1, 3) carry the edge highlight
    vs = [[bm.verts.new(p) for p in r] for r in rings[:-1]]
    for i in range(seg):
        a, b = vs[i], vs[(i + 1) % seg]
        for k in range(len(a) - 1):
            f = bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
            if k in (1, 3):
                f[lay_e] = 1.0
        bm.faces.new((a[-1], a[0], b[0], b[-1]))
    for f in bm.faces:
        f[lay_v] = 0.5
    return _finish(bm, "bucket_band", col, sharp=55.0)


def _cr(pts, sub):
    """Catmull-Rom through pts (uniform), sub samples per segment."""
    out = []
    q = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(q) - 2):
        p0, p1, p2, p3 = (Vector(v) for v in q[i - 1:i + 3])
        for s in range(sub):
            u = s / sub
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    out.append(Vector(pts[-1]))
    return out


def _sweep(bm, path, hn, hy, sides=8, rot=22.5):
    """Octagon (hn in-plane, hy along Y) swept along a path in the XZ plane."""
    rings = []
    for i, c in enumerate(path):
        a = path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]
        T = a.normalized()
        N = Vector((-T.z, 0, T.x))
        B = Vector((0, 1, 0))
        ring = []
        for k in range(sides):
            th = math.radians(rot + 360 * k / sides)
            ring.append(c + N * (hn * math.cos(th)) + B * (hy * math.sin(th)))
        rings.append(ring)
    return _loft(bm, rings, True)


def _ring_y(bm, c, r_out, r_in, w, seg=18, ch=0.003):
    """Flat eye ring, axis along Y, chamfered rim."""
    rings = []
    prof = [(r_in, -w / 2 + ch * 0.6), (r_in + ch * 0.6, -w / 2), (r_out - ch, -w / 2), (r_out, -w / 2 + ch),
            (r_out, w / 2 - ch), (r_out - ch, w / 2), (r_in + ch * 0.6, w / 2), (r_in, w / 2 - ch * 0.6)]
    vs = []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        vs.append([bm.verts.new(Vector((c.x + r * math.cos(a), c.y + y, c.z + r * math.sin(a)))) for r, y in prof])
    for k in range(seg):
        a, b = vs[k], vs[(k + 1) % seg]
        for j in range(len(a)):
            bm.faces.new((a[j], a[(j + 1) % len(a)], b[(j + 1) % len(a)], b[j]))


def _box(bm, c, size, ch=0.0015):
    r = bmesh.ops.create_cube(bm, size=1.0)
    for v in r["verts"]:
        v.co = Vector((v.co.x * size[0] + c.x, v.co.y * size[1] + c.y, v.co.z * size[2] + c.z))
    return r


def _cyl_y(bm, c, r, length, seg=10):
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=r, depth=length)
    bmesh.ops.rotate(bm, verts=res["verts"], cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "X"))
    for v in res["verts"]:
        v.co += c


def _bail(col, rnd):
    bm = bmesh.new()
    half = [Vector((x + rnd.uniform(-1, 1) * P["bail_jit"], 0, z + rnd.uniform(-1, 1) * P["bail_jit"])) for x, z in P["arch"]]
    half[0] = Vector((Ro(P["eye_z"]) + P["eye_off"], 0, P["eye_z"] + P["eye_r"] * 0.8))  # arm lands on the eye ring's top
    right = _cr([(v.x, 0, v.z) for v in half] + [(0.0, 0, P["apex_z"])], P["bail_sub"])
    left = [Vector((-v.x, 0, v.z)) for v in right]  # left eye -> apex
    path = left + right[::-1][1:]                  # ... then down the right arm
    _sweep(bm, path, P["bail_hn"], P["bail_hy"])
    for s in (-1, 1):
        zc = P["eye_z"]
        xr = (Ro(zc) + P["eye_off"]) * s
        c = Vector((xr, 0, zc))
        _ring_y(bm, c, P["eye_r"], P["eye_hole"], P["eye_w"])
        _cyl_y(bm, c, P["pin_r"], P["pin_len"])
        pl = P["plate"]
        _box(bm, Vector(((Ro(zc) + pl[0] * 0.5 - 0.003) * s, 0, zc)), pl)
    return _finish(bm, "bucket_bail", col)


def _grip(col, rnd, z_apex):
    bm = bmesh.new()
    lay_e, lay_v = _edge_layers(bm)
    L, r, ch, sides = P["grip_len"], P["grip_r"], P["grip_ch"], P["grip_sides"]
    jit = [1 + rnd.uniform(-1, 1) * P["grip_jit"] for _ in range(sides)]
    cut = [rnd.uniform(0, 6.28), rnd.uniform(0, 6.28)]
    rings = []
    for ri, (z, k) in enumerate(((-L / 2, 1 - ch / r), (-L / 2 + ch, 1.0), (0.0, 1.06), (L / 2 - ch, 1.0), (L / 2, 1 - ch / r))):
        ring = []
        for s in range(sides):
            a = 2 * math.pi * s / sides + 0.39
            zz = z
            if ri in (0, 1):  # oblique hand-cut ends
                zz += P["grip_cut"] * math.sin(a + cut[0]) * (1.0 if ri == 0 else 0.7)
            if ri in (3, 4):
                zz += P["grip_cut"] * math.sin(a + cut[1]) * (1.0 if ri == 4 else 0.7)
            ring.append(Vector((r * k * jit[s] * math.cos(a), r * k * jit[s] * math.sin(a), zz)))
        rings.append(ring)
    rows = {(0, s) for s in range(sides)} | {(3, s) for s in range(sides)}
    _loft(bm, rings, True, lay_e, lay_v, rows, rnd.random())
    ob = _finish(bm, "bucket_grip", col, sharp=35.0)
    ob.rotation_euler = (0, math.pi / 2, 0)
    ob.location = (0, 0, z_apex)
    return ob


def build(col="P_bucket", seed=7):
    rnd = random.Random(seed)
    if col not in bpy.data.collections:
        c = bpy.data.collections.new(col)
        (bpy.data.collections.get("PARTS") or bpy.context.scene.collection).children.link(c)
    body, info = _body(col, rnd)
    objs = [body, _band(col, rnd), _bail(col, rnd), _grip(col, rnd, P["apex_z"])]
    return objs, info
