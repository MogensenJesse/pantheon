"""FROZEN 2026-10-30: the user picked this variant as the best style (shaft r02 first render).
Do not change it from group rounds; group judges' part-level notes are logged only.
Recipe: convex polyhedron (planes tangent to a superquadric guide) + 1.2 cm 3-segment bevel strips
('edge' face attribute -> highlight), smooth shading, sharp above 40 deg. Material: loop_mat mask='edge'.
"""
"""Part 'stone': chunky hand-chiselled well-shaft block. build(name, seed, dims) -> object in P_stone.

Recipe (round 5). Judge r04: facets read as soft dents (remesh + smooth shading round every crease).
So the stone is now an exact convex polyhedron, low-poly, flat-shaded:
  - a boxy pillow (superellipsoid, power ~5, front bowed ~1.2 cm) is only a guide;
  - planes tangent to it at chosen spots (rows per face and per edge), tilted and pushed in a
    little, cut a box with bmesh bisect + fill -> every facet planar, every crease hard;
  - explicit rows: front 2-3 rows of facets, top 3-5, ends 6, top-front zig-zag band (alternating
    roll), top-back band, unequal vertical chamfers, bottom-front bevel + planar chips, flat bed;
  - 3 mm bevel strips on the creases carry a face attribute 'edge' (=1) for the edge highlight.
"""
import math
import random

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

P = dict(
    # shaft judge r01: at shaft scale the r05 stone (rounds/stone_r05.blend) reads as crumpled paper ->
    # fewer broad planes (3-5 per face, 1-2 cm deep), evenly rounded 3-segment bevels, smooth shading
    power=(4.0, 6.0), bow=0.01, edge_bevel=0.012, edge_segments=3, subsurf=0, crease_hi=0.3, crease_lo=0.85, cast=0.0, crease_split_deg=25.0, smooth_shade=True, sharp_deg=40.0,
    crease_deg=4.0, split=False, scoop_min_area=0.0025, scoop_pass=False, silhouette_cuts=False,
    # scoop pass: region -> (inset depth range m (+ = raised), rim thickness range m)
    scoop={"front": ((-0.012, -0.008), (0.012, 0.02)), "band": ((-0.006, -0.003), (0.006, 0.01)),
           "endL": ((-0.009, -0.005), (0.01, 0.016)), "endR": ((-0.009, -0.005), (0.01, 0.016)),
           "top": ((0.003, 0.006), (0.015, 0.025)), "back": ((-0.006, -0.003), (0.012, 0.02))},
    # rows: name -> (count, target-on-box fn key, depth range m, tilt jitter deg)
    face_depth=(0.008, 0.016), face_tilt=7.0,
    rows={"front": 4, "back": 3, "end": 3, "top": 3},
    band_front=(3, (0.004, 0.01), 6.0, 0.0),   # count, depth, roll alternation deg, yaw deg (yaw on a straight edge eats it)
    band_back=(2, (0.003, 0.007), 6.0, 0.0),
    band_end=(1, (0.003, 0.008), 8.0, 6.0),
    verticals=((0.0, 0.006), (0.004, 0.012)),  # depth range per corner: some small, some big
    bottom_front=(2, (0.006, 0.01), 40.0),      # count, depth, angle below horizontal deg
    bottom_other=(1, (0.002, 0.006)),
    chips=(1, (0.008, 0.012)),                    # count, depth: corner cuts at bottom-front vertices
    lean_left_deg=4.0,
)


def _rot(v, axis, deg):
    return np.array(Matrix.Rotation(math.radians(deg), 3, Vector(axis).normalized()) @ Vector(v))


class Pillow:
    """Superquadric guide centred at (0, 0, c): round in plan (p1), flat-topped with steep sides (p2).
    Radial projection + outward normal (numeric gradient); the front is bowed in plan."""
    def __init__(self, a, b, c, p, bow):
        self.ax = np.array([a, b, c])
        self.p1, self.p2 = p
        self.bow, self.c = bow, c

    def f(self, q):
        xy = (np.abs(q[0] / self.ax[0]) ** self.p1 + np.abs(q[1] / self.ax[1]) ** self.p1) ** (self.p2 / self.p1)
        return xy + np.abs(q[2] / self.ax[2]) ** self.p2

    def point(self, target):
        t = np.array(target, float) - [0, 0, self.c]
        u = t / np.linalg.norm(t)
        q = u * self.f(u) ** (-1 / self.p2)
        e = 1e-5
        g = np.array([(self.f(q + dv) - self.f(q - dv)) / (2 * e) for dv in np.eye(3) * e])
        n = g / np.linalg.norm(g)
        if q[1] < 0:  # bow the front in plan: push out at the middle, tilt normals toward the ends
            k = max(0.0, 1 - (q[0] / self.ax[0]) ** 2) * min(1.0, -n[1] / 0.7)
            q[1] -= self.bow * k
            n = n + np.array([2 * self.bow * q[0] / self.ax[0] ** 2, 0, 0]) * min(1.0, -n[1] / 0.7)
            n /= np.linalg.norm(n)
        return q + [0, 0, self.c], n


def _cut(bm, co, no):
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co), plane_no=Vector(no), clear_outer=True, dist=1e-5)
    edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and e.is_valid]
    if edges:
        try:
            bmesh.ops.edgeloop_fill(bm, edges=edges)
        except Exception:
            bmesh.ops.holes_fill(bm, edges=bm.edges[:], sides=0)


def _region(bm, key):
    def ok(n):
        return {"front": n.y < -0.85, "back": n.y > 0.85, "endL": n.x < -0.85, "endR": n.x > 0.85,
                "top": n.z > 0.9, "band": n.y < -0.3 and n.z > 0.3 and n.z < 0.9}[key]
    bm.normal_update()
    return [f for f in bm.faces if ok(f.normal)]


def _split(bm, faces, co, no):
    """Knife only these faces with a plane (no material removed)."""
    if not faces:
        return
    geom = list(set(faces) | {e for f in faces for e in f.edges} | {v for f in faces for v in f.verts})
    bmesh.ops.bisect_plane(bm, geom=geom, plane_co=Vector(co), plane_no=Vector(no), dist=1e-5)


def _scoop_pass(bm, rnd, a, b, h):
    """Split each face region into the facet pattern, then dish every piece (inset + push in):
    concave chisel scoops with crisp rims. Rows are staggered on the front and the ends."""
    def rows(key, axis_cut, span, z_mid, counts, tilt):
        zc = z_mid + rnd.uniform(-0.02, 0.02)
        _split(bm, _region(bm, key), (0, 0, zc), _rot((0, 0, 1), (1, 0, 0) if axis_cut == 1 else (0, 1, 0), rnd.uniform(-6, 6)))
        for upper, cnt in zip((True, False), counts):
            for i in range(cnt):
                t = -span + 2 * span * (i + 1 + rnd.uniform(-0.25, 0.25)) / (cnt + 1)
                faces = [f for f in _region(bm, key) if (f.calc_center_median().z > zc) == upper]
                co = [0, 0, 0]
                co[axis_cut] = t
                nrm = [0, 0, 0]
                nrm[axis_cut] = 1
                face_axis = (0, 1, 0) if axis_cut == 0 else (1, 0, 0)  # lean the cut line within the face
                _split(bm, faces, co, _rot(nrm, face_axis, rnd.uniform(-tilt, tilt)))
    if not P["split"]:
        rows = lambda *a_, **k_: None  # noqa: E731  (round 6b: dish the polytope facets as they are)
    rows("front", 0, a, 0.5 * h, (rnd.choice((4, 5)), rnd.choice((3, 4))), 12)
    rows("back", 0, a, 0.5 * h, (2, 2), 10)
    for key in ("endL", "endR"):
        rows(key, 1, b, 0.5 * h, (rnd.choice((1, 2)), rnd.choice((1, 2))), 15)
    for i in range(7 if P["split"] else 0):  # band: 8 segments, cut lines leaning +-15 deg
        x = -a + 2 * a * (i + 1 + rnd.uniform(-0.2, 0.2)) / 8
        _split(bm, _region(bm, "band"), (x, 0, 0), _rot((1, 0, 0), (0, -1, 1), rnd.uniform(-15, 15)))
    for i in range(2 if P["split"] else 0):  # top: 3-4 broad facets
        ang = rnd.uniform(0, 3.14)
        _split(bm, _region(bm, "top"), (rnd.uniform(-0.4, 0.4) * a, rnd.uniform(-0.4, 0.4) * b, 0),
               (math.cos(ang), math.sin(ang), 0))
    for key, (dr, tr) in P["scoop"].items():
        for f in _region(bm, key):
            if not f.is_valid:
                continue
            area = f.calc_area()
            if area < P["scoop_min_area"]:
                continue
            t = min(rnd.uniform(*tr), 0.25 * math.sqrt(area))
            bmesh.ops.inset_individual(bm, faces=[f], thickness=t, depth=rnd.uniform(*dr), use_even_offset=True)


def build(name="stone_a", seed=1, dims=(0.42, 0.24, 0.25), col="P_stone"):
    rnd = random.Random(seed)
    w, d, h = dims
    a, b, c = w / 2 + 0.006, d / 2 - P["bow"] / 2 + 0.004, h / 2 + 0.004
    pil = Pillow(a, b, c, P["power"], P["bow"])
    planes = []  # (point, normal)

    def plane_at(target, depth, tilt=0.0, roll=None, yaw=None):
        q, n = pil.point(target)
        if tilt:
            n = _rot(n, np.cross(n, [rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1)]), rnd.uniform(-tilt, tilt))
        if roll is not None:
            n = _rot(n, roll[0], roll[1])
        if yaw is not None:
            n = _rot(n, yaw[0], yaw[1])
        planes.append((q - n * depth, n / np.linalg.norm(n)))

    def spread(count, lo, hi, jit=0.3):
        return [lo + (hi - lo) * (i + 0.5 + rnd.uniform(-jit, jit)) / count for i in range(count)]

    fd, ft = P["face_depth"], P["face_tilt"]
    # faces: rows of tangent planes on the flat-ish parts of the pillow
    nf = P["rows"]["front"]
    for z, cnt in ((0.25, nf // 3 + 1), (0.55, nf // 3), (0.8, nf - 2 * (nf // 3) - 1)):
        for x in spread(cnt, -0.8 * a, 0.8 * a):
            plane_at((x, -b, z * h + rnd.uniform(-0.04, 0.04)), rnd.uniform(*fd), ft)
    nb = P["rows"]["back"]
    for z, cnt in ((0.3, nb // 2), (0.7, nb - nb // 2)):
        for x in spread(cnt, -0.8 * a, 0.8 * a):
            plane_at((x, b, z * h + rnd.uniform(-0.04, 0.04)), rnd.uniform(*fd) * 0.8, ft * 0.8)
    for sx in (-1, 1):
        for i in range(P["rows"]["end"]):
            y, z = rnd.uniform(-0.7, 0.7) * b, rnd.uniform(0.2, 0.85) * h
            lean = (np.array([0, 1, 0]), -sx * P["lean_left_deg"]) if sx < 0 else None
            plane_at((sx * a, y, z), rnd.uniform(*fd), ft * 1.1, roll=lean)
    for i in range(P["rows"]["top"]):
        plane_at((rnd.uniform(-0.6, 0.6) * a, rnd.uniform(-0.5, 0.5) * b, h), rnd.uniform(0.004, 0.009), 2.5)
    # top-front band: zig-zag chain (roll alternates about the edge, small yaw)
    cnt, dr, roll, yaw = P["band_front"]
    for i, x in enumerate(spread(cnt, -0.92 * a, 0.92 * a, 0.2)):
        plane_at((x, -b, h), rnd.uniform(*dr), 0,
                 roll=((1, 0, 0), roll * (1 if i % 2 else -1) + rnd.uniform(-3, 3)),
                 yaw=((0, 0, 1), rnd.uniform(-yaw, yaw)))
    cnt, dr, roll, yaw = P["band_back"]
    for i, x in enumerate(spread(cnt, -0.9 * a, 0.9 * a, 0.2)):
        plane_at((x, b, h), rnd.uniform(*dr), 0, roll=((1, 0, 0), roll * (1 if i % 2 else -1)),
                 yaw=((0, 0, 1), rnd.uniform(-yaw, yaw)))
    cnt, dr, roll, yaw = P["band_end"]
    for sx in (-1, 1):
        for i, y in enumerate(spread(cnt, -0.85 * b, 0.85 * b, 0.2)):
            plane_at((sx * a, y, h), rnd.uniform(*dr), 0, roll=((0, 1, 0), roll * (1 if i % 2 else -1)))
    # vertical corners: unequal chamfers, two planes each
    for sx in (-1, 1):
        for sy in (-1, 1):
            dr = P["verticals"][rnd.randrange(2)]
            for z in (0.35, 0.7):
                plane_at((sx * a, sy * b, z * h), rnd.uniform(*dr), 4.0)
    # bottom edges: front bevel steps back (planes angled down), others small
    cnt, dr, ang = P["bottom_front"]
    for x in spread(cnt, -0.85 * a, 0.85 * a):
        q, _ = pil.point((x, -b, 0.0))
        n = np.array([0, -math.cos(math.radians(ang)), -math.sin(math.radians(ang))])
        n = _rot(n, (0, 0, 1), rnd.uniform(-2, 2))
        planes.append((q - n * rnd.uniform(*dr), n))
    cnt, dr = P["bottom_other"]
    for key in ("back", "endL", "endR"):
        for i in range(cnt):
            tgt = {"back": (rnd.uniform(-0.7, 0.7) * a, b, 0.0), "endL": (-a, rnd.uniform(-0.6, 0.6) * b, 0.0),
                   "endR": (a, rnd.uniform(-0.6, 0.6) * b, 0.0)}[key]
            plane_at(tgt, rnd.uniform(*dr), 5.0)
    # silhouette: a 5-6 cm top-left chamfer and a tucked-in bottom-left
    for tgt, nv, dep in (((-a, -0.4 * b, h), (-1, -0.3, 1.0), 0.012), ((-a, 0, 0.0), (-1, 0, -0.6), 0.008)) if P["silhouette_cuts"] else ():
        q, _ = pil.point(tgt)
        nv = np.array(nv, float) / np.linalg.norm(nv)
        planes.append((q - nv * dep, nv))
    # cut a box with every plane; flat bed at z = 0
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * (2 * a + 0.04), v.co.y * (2 * b + 0.08), v.co.z * (2 * c + 0.04) + c))
    _cut(bm, (0, 0, 0), (0, 0, -1))
    rnd.shuffle(planes)
    for q, n in planes:
        _cut(bm, q, n)
    # chips: cut a small pyramid off a few bottom-front corner vertices (local by construction)
    bm.normal_update()
    cand = [(np.array(v.co), np.array(v.normal)) for v in bm.verts if v.co.z < 0.04 and v.co.y < -0.5 * b]
    rnd.shuffle(cand)
    cnt, dr = P["chips"]
    used = []
    for co_v, n in cand:  # snapshot: cuts delete verts
        if len(used) == cnt:
            break
        if all(abs(co_v[0] - u) > 0.07 for u in used):
            used.append(co_v[0])
            _cut(bm, co_v - n * rnd.uniform(*dr), n)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0015)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=0.0015)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if P["scoop_pass"]:
        _scoop_pass(bm, rnd, a, b, h)
    if P["cast"]:  # pillowy: pull the cage part-way to an ellipsoid (corners in, face centres out), bed stays flat
        cz = (max(v.co.z for v in bm.verts)) / 2
        half = np.array([max(abs(v.co.x) for v in bm.verts), max(abs(v.co.y) for v in bm.verts), cz])
        pts = np.array([[v.co.x, v.co.y, v.co.z - cz] for v in bm.verts]) / half
        rad = np.linalg.norm(pts, axis=1)
        tgt = pts / rad[:, None] * rad.mean()
        new = (pts + P["cast"] * (tgt - pts)) * half
        for v, q in zip(bm.verts, new):
            if v.co.z > 0.004:  # bed vertices keep z = 0
                v.co = Vector((q[0], q[1], max(q[2] + cz, 0.0)))
            else:
                v.co = Vector((q[0], q[1], 0.0))
    fv = bm.faces.layers.float.get("fvar") or bm.faces.layers.float.new("fvar")
    for f in bm.faces:  # per-facet value shift for the material (subsurf children inherit it)
        f[fv] = rnd.random()
    if P["subsurf"]:
        # stylised-rock rounding: creased Catmull-Clark over the facets (broad planes, soft creases, round corners)
        cl = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
        for e in bm.edges:
            steep = e.is_manifold and e.calc_face_angle(0) > math.radians(P["crease_split_deg"])
            e[cl] = P["crease_hi"] if steep else P["crease_lo"]
    else:
        # thin bevel strips on the convex creases (rims, chamfers) -> 'edge' face attribute for the highlight
        creases = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(P["crease_deg"])]
        res = bmesh.ops.bevel(bm, geom=creases, offset=P["edge_bevel"], segments=P["edge_segments"], profile=0.5,
                              affect="EDGES", clamp_overlap=True)
        lay = bm.faces.layers.float.get("edge") or bm.faces.layers.float.new("edge")
        for f in res["faces"]:
            if f.is_valid:
                f[lay] = 1.0
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old)
    for f in bm.faces:
        f.smooth = P["smooth_shade"]
    if P["smooth_shade"]:  # auto-smooth: keep only steep creases sharp
        for e in bm.edges:
            e.smooth = not (e.is_manifold and e.calc_face_angle(0) > math.radians(P["sharp_deg"]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.data.collections[col].objects.link(ob)
    if P["subsurf"]:
        sub = ob.modifiers.new("Subsurf", "SUBSURF")
        sub.levels = sub.render_levels = P["subsurf"]
        dg = bpy.context.evaluated_depsgraph_get()
        dense = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        ob.modifiers.clear()
        ob.data = dense
        bpy.data.meshes.remove(me)
        dense.name = name
        me = dense
        me.shade_smooth()
    mat = bpy.data.materials.get("M_stone") or bpy.data.materials.new("M_stone")
    me.materials.append(mat)
    return ob
