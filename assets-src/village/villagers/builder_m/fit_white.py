# assets-src/village/villagers/builder_m/fit_white.py — adapt the builder to the white, untextured 3D reference.
#
# Opens builder_m_soft.blend (never modified) and writes builder_m_white.blend:
#  - the texture is removed (flat grey material; UVs and the old atlas stay in the file, unlinked);
#  - detail geometry the white reference has and the old texture only painted: belt, bib and back straps, raised back
#    plate, pocket, tool straps, brow ridges;
#  - a new cap (thick folded band tilted back, stepped dome) replacing the old one, and a new nose (still a separate
#    shell) with the reference's bridge and flared base;
#  - everything new is weighted like the body it sits on (nearest original vertex), has placeholder UVs (a texture pass
#    re-unwraps), and is excluded from the Smooth modifier ("soften_mask") so the edges stay crisp.
# Measurements are read from the three cut-outs of the white reference (images 21 to 23 of the session; centre line x = 0,
# spine axis y = 0, 603 px per metre) and are listed next to each feature.
#
#   blender --background --python fit_white.py
import math
import os

import bmesh
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'builder_m_soft.blend')
OUT = os.path.join(HERE, 'builder_m_white.blend')
MESH = 'Builder_MESH'
PART_NAMES = ['apron', 'arm.L', 'arm.R', 'boot.L', 'boot.R', 'cap', 'ear.L', 'ear.R', 'hand.L', 'hand.R', 'head',
              'leg.L', 'leg.R', 'neck', 'nose', 'pelvis', 'thumb.L', 'thumb.R', 'torso']
NEW_ID = {'belt': 101, 'strap': 102, 'plate': 103, 'pocket': 104, 'loop': 105, 'cap': 106, 'brow': 107, 'nose': 108}
GREY = (0.82, 0.82, 0.82, 1.0)


# ---------------------------------------------------------------- helpers


def whiten(me):
    for mat in me.materials:
        nt = mat.node_tree
        bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
        for link in list(nt.links):
            if link.to_node.name == bsdf.name and link.to_socket.name == 'Base Color':
                nt.links.remove(link)
        bsdf.inputs['Base Color'].default_value = GREY
        mat.diffuse_color = GREY
        for n in list(nt.nodes):  # Solid mode in Texture colour still shows an unlinked image node: remove it
            if n.type == 'TEX_IMAGE':
                if n.image:
                    n.image.use_fake_user = True  # the Codex atlas stays in the file
                nt.nodes.remove(n)


def make_bvh(bm, part_ids, layer):
    bm.verts.index_update()
    verts = [v.co.copy() for v in bm.verts]
    polys = [[v.index for v in f.verts] for f in bm.faces if f.verts[0][layer] in part_ids]
    return BVHTree.FromPolygons(verts, polys)


def cast(bvh, origin, direction, what=''):
    d = Vector(direction).normalized()
    loc, nor, _, _ = bvh.ray_cast(Vector(origin), d, 4.0)
    if loc is None:
        raise RuntimeError(f'no surface hit for {what} from {tuple(origin)} along {tuple(d)}')
    return loc, (-nor if nor.dot(d) > 0 else nor)


def ribbon(bm, pts, nors, width, thick, sink=0.004, closed=False):
    """Strap lying on a surface: `width` wide, `thick` proud of it (and `sink` into it). Returns the new vertices."""
    n = len(pts)
    rings = []
    for i in range(n):
        p, nor = Vector(pts[i]), Vector(nors[i]).normalized()
        a = Vector(pts[(i - 1) % n if closed else max(i - 1, 0)])
        b = Vector(pts[(i + 1) % n if closed else min(i + 1, n - 1)])
        side = (b - a).cross(nor).normalized() * (width / 2)
        base = p - nor * sink
        top = p + nor * thick
        rings.append([bm.verts.new(base - side), bm.verts.new(base + side), bm.verts.new(top + side),
                      bm.verts.new(top - side)])
    faces = []
    for i in range(n if closed else n - 1):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for k in range(4):
            faces.append(bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k])))
    if not closed:
        faces.append(bm.faces.new(rings[0]))
        faces.append(bm.faces.new(list(reversed(rings[-1]))))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return [v for r in rings for v in r]


def patch(bm, grid, thick, sink=0.004):
    """Raised plate over a grid of (point, normal) rows laid on a surface, closed all round."""
    rows, cols = len(grid), len(grid[0])
    top = [[bm.verts.new(p + n * thick) for p, n in row] for row in grid]
    low = [[bm.verts.new(p - n * sink) for p, n in row] for row in grid]
    faces = []
    for j in range(rows - 1):
        for i in range(cols - 1):
            faces.append(bm.faces.new((top[j][i], top[j + 1][i], top[j + 1][i + 1], top[j][i + 1])))
            faces.append(bm.faces.new((low[j][i], low[j][i + 1], low[j + 1][i + 1], low[j + 1][i])))
    for j in range(rows - 1):
        faces.append(bm.faces.new((top[j][0], low[j][0], low[j + 1][0], top[j + 1][0])))
        faces.append(bm.faces.new((top[j][-1], top[j + 1][-1], low[j + 1][-1], low[j][-1])))
    for i in range(cols - 1):
        faces.append(bm.faces.new((top[0][i], top[0][i + 1], low[0][i + 1], low[0][i])))
        faces.append(bm.faces.new((top[-1][i], low[-1][i], low[-1][i + 1], top[-1][i + 1])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return [v for r in top + low for v in r]


def poly_slab(bm, outline, thick, sink=0.004):
    """Flat raised plate with a polygon outline: outline = [(point, normal)] on a surface."""
    top = [bm.verts.new(p + n * thick) for p, n in outline]
    low = [bm.verts.new(p - n * sink) for p, n in outline]
    n = len(outline)
    faces = [bm.faces.new(top), bm.faces.new(list(reversed(low)))]
    for i in range(n):
        k = (i + 1) % n
        faces.append(bm.faces.new((low[i], low[k], top[k], top[i])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return top + low


def lofted(bm, sections):
    """Closed solid through rectangular sections; section = [front-left, front-right, back-right, back-left] points."""
    rings = [[bm.verts.new(p) for p in s] for s in sections]
    faces = []
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(4):
            faces.append(bm.faces.new((r0[k], r0[(k + 1) % 4], r1[(k + 1) % 4], r1[k])))
    faces.append(bm.faces.new(rings[0]))
    faces.append(bm.faces.new(list(reversed(rings[-1]))))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return [v for r in rings for v in r]


def flatten_apron(bm, layer, apron):
    """The apron's front is a flat panel in the reference (x = +-0.19 at the hem); the old shell has an 8-sided front with
    chamfers. Move the second front vertices of each ring forward onto the centre plane and out by 20 %."""
    ring = {}
    for v in bm.verts:
        if v[layer] == apron and abs(v.co.x) < 0.01 and v.co.y < -0.1:
            ring[round(v.co.z, 3)] = min(ring.get(round(v.co.z, 3), 9), v.co.y)
    for v in bm.verts:
        if v[layer] == apron and 0.12 < abs(v.co.x) < 0.15 and v.co.y < -0.12:
            front = ring[min(ring, key=lambda z: abs(z - v.co.z))]
            v.co.y = front + 0.004
            v.co.x *= 1.2


# Head rings (z of the existing ring -> half width, front y, back y) read off the reference: the forehead and the face front
# stay close to y = -0.205, the cheeks are widest at ear height (0.19) and a long diagonal chamfer runs down to a narrow chin
# (0.092 at z 1.285); the upper rings sit well inside the cap so nothing pokes through it.
HEAD_SHAPE = {1.62: (0.140, -0.172, 0.160), 1.585: (0.190, -0.206, 0.212), 1.53: (0.192, -0.206, 0.215),
              1.475: (0.192, -0.206, 0.222), 1.453: (0.192, -0.206, 0.215), 1.432: (0.190, -0.206, 0.210),
              1.41: (0.174, -0.206, 0.205), 1.345: (0.140, -0.200, 0.165), 1.285: (0.086, -0.185, 0.115)}
# (the rings from z 1.585 to 1.432 share width and front, so the forehead and cheeks are flat planes like the reference)
HEAD_Z = {1.62: 1.70}  # the top ring goes up under the cap (the band's lower edge is at z 1.65 at the front centre)
JAW_RISE = {1.285: 0.13, 1.345: 0.07}  # the jaw line rises toward the ear in the side view instead of running flat


def reshape_head(bm, layer, head):
    """Move each ring of the head onto HEAD_SHAPE. The ears (the two outermost vertices per side in the 16-vertex rows) keep
    their distance beyond the ring and their height, so they follow the head as they are."""
    rows = {}
    for v in bm.verts:
        if v[layer] == head:
            rows.setdefault(round(v.co.z, 3), []).append(v)
    assert set(rows) == set(HEAD_SHAPE), sorted(rows)
    for z, vs in rows.items():
        ears = set()
        if len(vs) == 16:
            for sign in (1, -1):
                ears.update(sorted((v for v in vs if sign * v.co.x > 0), key=lambda v: -abs(v.co.x))[:2])
        ring = [v for v in vs if v not in ears]
        a_old = max(abs(v.co.x) for v in ring)
        y0, y1 = min(v.co.y for v in ring), max(v.co.y for v in ring)
        yc_old, ry_old = (y0 + y1) / 2, (y1 - y0) / 2
        a_new, f, b = HEAD_SHAPE[z]
        for v in vs:
            v.co.z = HEAD_Z.get(z, z) + (v.co.z - z)
        yc_new, ry_new = (f + b) / 2, (b - f) / 2
        for v in vs:
            v.co.y = yc_new + (v.co.y - yc_old) * ry_new / ry_old
            if v in ears:
                v.co.x = math.copysign(a_new + (abs(v.co.x) - a_old), v.co.x)
            else:
                v.co.x *= a_new / a_old
        slope = JAW_RISE.get(z)
        if slope:
            for v in vs:
                v.co.z += slope * max(0.0, v.co.y + 0.19)


# ---------------------------------------------------------------- features


def add_belt(bm, bvh):
    """Belt: z 0.77 to 0.835 (front, side and back views), about 1.8 cm proud of the body all the way round."""
    pts, nors = [], []
    count = 32
    for i in range(count):
        a = 2 * math.pi * i / count
        o = Vector((math.sin(a) * 0.7, -math.cos(a) * 0.7, 0.8025))
        loc, _ = cast(bvh, o, (-math.sin(a), math.cos(a), 0), 'belt')
        pts.append(loc)
        nors.append(Vector((math.sin(a), -math.cos(a), 0)))  # radial, so the band's edges stay level
    return ribbon(bm, pts, nors, 0.065, 0.018, closed=True)


def add_straps(bm, bvh):
    """Shoulder straps: front z 1.07 to 1.27 (0.14 to 0.165 off the centre line), over the shoulder, down the back to the
    plate's top corners (z 1.115, 0.20 to 0.235). 5.2 cm wide, 1.2 cm proud."""
    verts = []
    for sign in (1, -1):
        pts, nors = [], []
        for z, x in ((1.07, 0.140), (1.14, 0.150), (1.21, 0.158), (1.265, 0.165)):
            loc, nor = cast(bvh, (sign * x, -1, z), (0, 1, 0), 'strap front')
            pts.append(loc), nors.append(nor)
        for y, x in ((-0.05, 0.172), (0.0, 0.182), (0.06, 0.192)):
            loc, nor = cast(bvh, (sign * x, y, 1.7), (0, 0, -1), 'strap top')
            pts.append(loc), nors.append(nor)
        for z, x in ((1.24, 0.200), (1.18, 0.215), (1.115, 0.235)):
            loc, nor = cast(bvh, (sign * x, 1, z), (0, -1, 0), 'strap back')
            pts.append(loc), nors.append(nor)
        verts += ribbon(bm, pts, nors, 0.052, 0.012)
    return verts


def add_plate(bm, bvh):
    """Raised leather plate on the back: z 0.845 to 1.115, 0.232 half wide at the belt, 0.252 at the top, 1.2 cm proud."""
    grid = []
    for z in (0.845, 0.91, 0.975, 1.04, 1.115):
        half = 0.232 + (z - 0.845) / (1.115 - 0.845) * 0.020
        grid.append([cast(bvh, (x, 1, z), (0, -1, 0), 'plate') for x in [(-1 + 2 * i / 6) * half for i in range(7)]])
    return patch(bm, grid, 0.012)


def add_pocket(bm, bvh):
    """Pocket on the apron: x -0.20 to -0.06, z 0.725 down to a point at (-0.13, 0.53), 1.2 cm proud."""
    outline = [(-0.20, 0.725), (-0.06, 0.725), (-0.06, 0.585), (-0.13, 0.53), (-0.20, 0.585)]
    pts = [(cast(bvh, (x, -1, z), (0, 1, 0), 'pocket')[0], Vector((0, -1, 0))) for x, z in outline]
    return poly_slab(bm, list(reversed(pts)), 0.012)


def add_loops(bm, bvh):
    """Tool straps hanging from the belt: left z 0.835 to 0.73 at x = -0.145, right (hammer) z 0.835 to 0.545 from
    x = 0.105 to 0.15 (a little further in than the reference, where the old apron's front is narrower); 4.2 cm wide, 1 cm proud."""
    verts = []
    for path in ([(-0.145, 0.835), (-0.145, 0.78), (-0.145, 0.73)],
                 [(0.105, 0.835), (0.118, 0.76), (0.132, 0.65), (0.15, 0.545)]):
        pts, nors = [], []
        for x, z in path:
            loc, _ = cast(bvh, (x, -1, z), (0, 1, 0), 'loop')
            pts.append(loc), nors.append(Vector((0, -1, 0)))  # the apron's facets tilt: keep the straps square to the front
        verts += ribbon(bm, pts, nors, 0.042, 0.010, sink=0.003)
    return verts


def add_brows(bm, bvh):
    """Brow ridges: from 0.04 to 0.135 off the centre line, z 1.534 to 1.548, 1.6 cm wide, 1.2 cm proud."""
    verts = []
    for sign in (1, -1):
        pts, nors = [], []
        for x, z in ((0.040, 1.538), (0.075, 1.551), (0.105, 1.552), (0.135, 1.543)):
            loc, _ = cast(bvh, (sign * x, -1, z), (0, 1, 0), 'brow')
            pts.append(loc), nors.append(Vector((0, -1, 0)))
        verts += ribbon(bm, pts, nors, 0.016, 0.012, sink=0.003)
    return verts


def add_face_lines(bm, bvh):
    """The reference's closed eyes (z 1.50, 4.8 to 12.2 cm off the centre line) and mouth (z 1.366, 9 cm wide) are thin
    plates, 0.9 cm tall and 0.5 cm proud."""
    verts = []
    for pts_xz in ([(-0.122, 1.50), (-0.048, 1.50)], [(0.048, 1.50), (0.122, 1.50)], [(-0.042, 1.366), (0.046, 1.366)]):
        pts, nors = [], []
        for x, z in pts_xz:
            loc, _ = cast(bvh, (x, -1, z), (0, 1, 0), 'face line')
            pts.append(loc), nors.append(Vector((0, -1, 0)))
        verts += ribbon(bm, pts, nors, 0.009, 0.005, sink=0.002)
    return verts


def add_nose(bm, bvh):
    """Nose (separate shell): bridge 3.4 to 4.2 cm wide from z 1.55, tip 6.6 cm out at z 1.458, flat underside flaring to
    9.6 cm wide at z 1.426 (front view, 1 px = 1 mm in the reference crop), tip y = -0.275 (side view)."""
    sections = []
    for z, half, prot in ((1.552, 0.017, 0.004), (1.500, 0.018, 0.034), (1.462, 0.021, 0.066), (1.444, 0.042, 0.056),
                          (1.426, 0.048, 0.052)):
        fy = cast(bvh, (0, -1, z), (0, 1, 0), 'nose')[0].y
        front, back = fy - prot, fy + 0.012
        sections.append([Vector((-half, front, z)), Vector((half, front, z)), Vector((half, back, z)),
                         Vector((-half, back, z))])
    return lofted(bm, sections)


# rings of the cap: (z above the band's bottom edge, half width, front y, back y); untilted, tilted afterwards.
# Band: a thin rolled lip (6 cm, z 1.54 up), lower edge sheared 12.6 degrees (front 1.595, back 1.49 in the side view); the dome runs straight up from it, no ledge, to a narrow crown.
# (dz at y = 0, half width, front y, back y, shear factor): the shear factor fades from 1 (band) to 0 (crown), so the front
# and back of each ring get their own height: front/back z are 1.705/1.565 (band top), 1.735/1.655, 1.765/1.72, 1.787/1.775, 1.80.
CAP_RINGS = [(0.000, 0.222, -0.215, 0.250, 1.00), (0.055, 0.222, -0.215, 0.250, 1.00), (0.118, 0.175, -0.160, 0.245, 0.66),
             (0.163, 0.145, -0.120, 0.200, 0.47), (0.197, 0.095, -0.080, 0.130, 0.19), (0.215, 0.040, -0.060, 0.100, 0.00)]
CAP_CHEVRON = 0.0  # 0.25 would drop the lower edge toward the sides like the front view, but it brings head and ear clipping back (even 0.06 does)
CAP_SEGMENTS = 12
CAP_Z0 = 1.585  # at y = 0, the sides of the head
CAP_SLOPE = 0.30  # shear: the band's lower edge rises 30 cm per metre toward the front: z 1.65 at the front centre, 1.585 at the temples, 1.51 at the back; its faces stay upright


def add_cap(bm):
    rings = []
    pivot = Vector((0, 0, CAP_Z0))
    for dz, a, f, b, tilt_k in CAP_RINGS:
        yc, ry = (f + b) / 2, (b - f) / 2
        ring = []
        for k in range(CAP_SEGMENTS):
            t = 2 * math.pi * k / CAP_SEGMENTS
            s, c = math.sin(t), -math.cos(t)  # t = 0 points to the front (-y)
            x = a * math.copysign(abs(s) ** 0.8, s)
            y = yc + ry * math.copysign(abs(c) ** 0.8, c)
            ring.append(bm.verts.new(pivot + Vector((x, y, dz - tilt_k * (CAP_SLOPE * y + CAP_CHEVRON * min(abs(x), 0.13))))))
        rings.append(ring)
    faces = []
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(CAP_SEGMENTS):
            faces.append(bm.faces.new((r0[k], r0[(k + 1) % CAP_SEGMENTS], r1[(k + 1) % CAP_SEGMENTS], r1[k])))
    faces.append(bm.faces.new(list(reversed(rings[-1]))))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return [v for r in rings for v in r]


# ---------------------------------------------------------------- main


def main():
    bpy.ops.wm.open_mainfile(filepath=SRC)
    ob = [o for o in bpy.data.objects if o.name.startswith(MESH)][0]
    me = ob.data
    whiten(me)
    mask = ob.vertex_groups.new(name='soften_mask')
    head_group = ob.vertex_groups['head'].index
    bm = bmesh.new()
    bm.from_mesh(me)
    layer = bm.verts.layers.int['part']
    deform = bm.verts.layers.deform.active
    pid = {n: i + 1 for i, n in enumerate(PART_NAMES)}

    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v[layer] in (pid['nose'], pid['cap'])], context='VERTS')
    bm.verts.ensure_lookup_table()
    for v in bm.verts:
        v[deform][mask.index] = 1.0

    reshape_head(bm, layer, pid['head'])
    flatten_apron(bm, layer, pid['apron'])
    body_ids = {pid['torso'], pid['apron'], pid['pelvis']}
    body_bvh = make_bvh(bm, body_ids, layer)
    head_bvh = make_bvh(bm, {pid['head']}, layer)
    kd = KDTree(sum(1 for v in bm.verts if v[layer] == pid['torso']))
    torso_verts = [v for v in bm.verts if v[layer] == pid['torso']]
    for i, v in enumerate(torso_verts):
        kd.insert(v.co, i)
    kd.balance()

    def weigh_like_body(verts):
        for v in verts:
            _, i, _ = kd.find(v.co)
            src = torso_verts[i][deform]
            for g, w in src.items():
                if g != mask.index:
                    v[deform][g] = w

    def weigh_head(verts):
        for v in verts:
            v[deform][head_group] = 1.0

    features = [
        ('belt', add_belt(bm, body_bvh), weigh_like_body),
        ('strap', add_straps(bm, body_bvh), weigh_like_body),
        ('plate', add_plate(bm, body_bvh), weigh_like_body),
        ('pocket', add_pocket(bm, body_bvh), weigh_like_body),
        ('loop', add_loops(bm, body_bvh), weigh_like_body),
        ('brow', add_brows(bm, head_bvh), weigh_head),
        ('brow', add_face_lines(bm, head_bvh), weigh_head),
        ('nose', add_nose(bm, head_bvh), weigh_head),
        ('cap', add_cap(bm), weigh_head),
    ]
    uv = bm.loops.layers.uv.active
    for name, verts, weigh in features:
        weigh(verts)
        for v in verts:
            v[layer] = NEW_ID[name]
            v.hide = False
        print('ADDED', name, len(verts), 'verts')
    for f in bm.faces:
        f.smooth = False
        if f.verts[0][layer] >= 100:
            for loop in f.loops:
                loop[uv].uv = (0.97, 0.03)  # placeholder: the texture pass re-unwraps
    unweighted = sum(1 for v in bm.verts if not any(g != mask.index for g in v[deform].keys()))
    print('UNWEIGHTED', unweighted, 'TRIS', sum(len(f.verts) - 2 for f in bm.faces))
    bm.to_mesh(me)
    bm.free()
    me.update()

    mod = ob.modifiers['Soften']
    mod.vertex_group = 'soften_mask'
    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    print('FITTED', OUT)


if __name__ == '__main__':
    main()
