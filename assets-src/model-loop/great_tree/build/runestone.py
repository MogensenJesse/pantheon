"""Part 'runestone': tall pointed standing stone with a recessed panel on its front (-Y) that holds a glowing knotwork rune.
The body is the temple's chipped stone (tcommon.chipped_block, frozen look) cut to a leaning pointed silhouette with a hexagonal plan;
the panel is two exact boolean recesses (a shallow frame step, then the floor); the rune is relief ribbons (temple shapes.ribbon) with an
emissive material. One mesh, three material slots: stone, panel floor, glow."""
import math
import random

import bmesh
import bpy
import numpy as np
from mathutils import Vector

import tree_common as TC
import shapes
from tcommon import chipped_block, collection, drop, set_materials

# r02: r01 cut the tip off at 2.57 m (front and back leaned 4 and 6 deg and met), the body was a smooth box (no facets), glow far too strong
P = dict(front_lean=2.0, back_lean=3.5, chamfer=0.11, frame=0.055, frame_depth=0.016, depth=0.05, line=0.036, relief=0.012, glow=2.6, floor_glow=0.4,
         facets=22, facet_depth=(0.04, 0.15))

VARIANTS = {
    "runestone_a": dict(seed=11, dims=(1.15, 0.62, 3.2), lean=0.1, waves=7),
    "runestone_b": dict(seed=23, dims=(1.05, 0.64, 2.7), lean=-0.1, waves=6),
}


def _silhouette(w, h, tx):
    """Front outline (x, z), base-left round to base-right; the tip leans by tx."""
    # r03: fuller shoulders and a blunter tip (r02 read as a slim obelisk next to the reference)
    return [(-0.46 * w, 0.0), (-0.52 * w, 0.28 * h), (-0.48 * w, 0.60 * h), (-0.30 * w + tx, 0.87 * h), (-0.08 * w + tx, h), (0.10 * w + tx, 0.985 * h),
            (0.30 * w + tx, 0.88 * h), (0.48 * w, 0.63 * h), (0.52 * w, 0.30 * h), (0.47 * w, 0.0)]


def _planes(w, d, h, tx, rnd):
    """Cut planes (point, outward normal): the silhouette's edges, the leaning front and back, vertical chamfers (hexagonal plan), a thinner tip."""
    out = []
    sil = _silhouette(w, h, tx)
    for (x0, z0), (x1, z1) in zip(sil, sil[1:]):
        n = np.array([-(z1 - z0), rnd.uniform(-0.12, 0.12), x1 - x0])  # left-hand normal of an edge walked clockwise = outward
        out.append(((x0, 0.0, z0), n / np.linalg.norm(n)))
    fl, bl = math.radians(P["front_lean"]), math.radians(P["back_lean"])
    out.append(((0.0, -d / 2 + 0.02, 0.0), (0.0, -math.cos(fl), math.sin(fl))))
    out.append(((0.0, d / 2 - 0.02, 0.0), (0.0, math.cos(bl), math.sin(bl))))
    for sx in (-1, 1):  # vertical chamfers: front ones narrow, back ones broad
        out.append(((sx * (0.5 * w - P["chamfer"]), -d / 2, h / 3), (sx * 0.74, -0.67, 0.06)))
        out.append(((sx * (0.5 * w - 0.2), d / 2, h / 3), (sx * 0.6, 0.8, 0.1)))
    out.append(((0.0, -d / 2 + 0.02 + 0.86 * h * math.tan(fl), 0.86 * h), (0.0, -0.95, 0.31)))  # the tip thins from both faces
    out.append(((0.0, d / 2 - 0.02 - 0.84 * h * math.tan(bl), 0.84 * h), (0.0, 0.95, 0.31)))
    return out


def _facets(planes, dims, rnd):
    """More cut planes that shave big flat facets off the convex body: a random direction (sideways to upward), cut `facet_depth` inside
    the body's extreme point in that direction. The front (panel) face only loses shallow facets."""
    import stone
    w, d, h = dims
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, v.co.y * d, v.co.z * h + h / 2))
    for p, n in planes:
        stone._cut(bm, p, n)
    out = []
    for _ in range(P["facets"]):
        th = rnd.uniform(0, math.tau)
        up = rnd.uniform(-0.1, 0.75)
        n = Vector((math.cos(th), math.sin(th), up)).normalized()
        depth = rnd.uniform(*P["facet_depth"]) * (0.3 if n.y < -0.5 else 1.0)
        sup = max(v.co.dot(n) for v in bm.verts)
        p = n * (sup - depth)
        out.append((tuple(p), tuple(n)))
        stone._cut(bm, p, n)
    bm.free()
    return out


def _panel_outline(w, h, tx):
    """Panel outline in the front plane: (x, height along the plane), a pointed arch that leans with the stone."""
    b0 = 0.2 * h  # r03: narrower panel (r02: 0.31 w half width, the reference's is about a quarter of the stone's width each side)
    pts = [(-0.19 * w, b0), (-0.25 * w, b0 + 0.06 * h), (-0.245 * w, 0.42 * h), (-0.17 * w, 0.64 * h), (0.0, 0.80 * h), (0.17 * w, 0.64 * h),
           (0.245 * w, 0.42 * h), (0.25 * w, b0 + 0.06 * h), (0.19 * w, b0)]
    return [(x + tx * 0.6 * max(0.0, (b / h - 0.3) / 0.53), b) for x, b in pts]


def _inset(pts, k):
    """Offset a convex outline inward by k (metres): each edge moves in, corners are re-intersected."""
    n = len(pts)
    cx, cy = sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n
    lines = []
    for i in range(n):
        (x0, y0), (x1, y1) = pts[i], pts[(i + 1) % n]
        nx, ny = -(y1 - y0), x1 - x0
        ln = math.hypot(nx, ny)
        nx, ny = nx / ln, ny / ln
        if nx * (cx - x0) + ny * (cy - y0) < 0:
            nx, ny = -nx, -ny
        lines.append((nx, ny, nx * (x0 + nx * k) + ny * (y0 + ny * k)))
    out = []
    for i in range(n):
        a1, b1, c1 = lines[i - 1]
        a2, b2, c2 = lines[i]
        det = a1 * b2 - a2 * b1
        out.append(((c1 * b2 - c2 * b1) / det, (a1 * c2 - a2 * c1) / det))
    return out


def _cut_prism(ob, outline, origin, u, v, n, depth):
    """Subtract the prism of a 2D outline (in the plane through origin with axes u, v and outward normal n), `depth` deep, exact boolean."""
    cut = bmesh.new()
    at = lambda a, b, k: Vector(origin) + Vector(u) * a + Vector(v) * b + Vector(n) * k  # noqa: E731
    lo = [cut.verts.new(at(a, b, -depth)) for a, b in outline]
    hi = [cut.verts.new(at(a, b, 0.3)) for a, b in outline]
    cut.faces.new(lo)
    cut.faces.new(hi[::-1])
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        cut.faces.new((lo[i], hi[i], hi[j], lo[j]))
    bmesh.ops.recalc_face_normals(cut, faces=cut.faces[:])
    me = bpy.data.meshes.new("cut")
    cut.to_mesh(me)
    cut.free()
    cob = bpy.data.objects.new("cut", me)
    bpy.context.scene.collection.objects.link(cob)
    mod = ob.modifiers.new("cut", "BOOLEAN")
    mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cob
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cob)
    bpy.data.meshes.remove(me)


def _rune(bm, outline, waves, rnd):
    """Knotwork inside `outline` (panel coords): a border line, two zigzag strands that cross into lozenges, a diamond in every lozenge and
    a hook at the foot. Returns [(polyline, width, relief)]; reliefs differ a little so crossing ribbons never share a plane."""
    ln = P["line"]
    out = []
    b0, b1 = min(b for _, b in outline), max(b for _, b in outline)
    border = _inset(outline, 0.045)
    k = len(border) // 2  # split the loop at the apex and the foot: two open ribbons (a ribbon may not close on itself)
    out.append((border[k:] + border[:1], ln * 0.8, P["relief"] * 0.75))  # reliefs differ by 1.5 mm or more (the QA calls closer planes z-fighting)
    out.append((border[:k + 1], ln * 0.8, P["relief"] * 0.6))  # not the other half's height: their ends overlap

    def half_width(b):  # the inset outline's half width and centre at height b
        xs = []
        ins = _inset(outline, 0.1)
        for (x0, y0), (x1, y1) in zip(ins, ins[1:] + ins[:1]):
            if (y0 - b) * (y1 - b) <= 0 and y0 != y1:
                xs.append(x0 + (x1 - x0) * (b - y0) / (y1 - y0))
        return ((max(xs) - min(xs)) / 2, (max(xs) + min(xs)) / 2) if len(xs) >= 2 else (0.0, 0.0)

    lo, hi = b0 + 0.17, b1 - 0.24
    step = (hi - lo) / waves
    for side, relief in ((1, P["relief"]), (-1, P["relief"] * 1.13)):
        pts = []
        for i in range(waves + 1):
            b = lo + i * step
            hw, cx = half_width(b)
            pts.append((cx + side * (1 if i % 2 == 0 else -1) * hw, b))
        out.append((pts, ln, relief))
    for i in range(waves):  # a diamond in every lozenge: a short ribbon as wide as it is long, turned 45 degrees
        b = lo + (i + 0.5) * step
        hw, cx = half_width(b)
        s = min(0.06, hw * 0.45)
        if s > 0.025:
            out.append(([(cx - s / 2, b - s / 2), (cx + s / 2, b + s / 2)], s * 1.41, P["relief"] * 1.27))
    hw, cx = half_width(b0 + 0.14)
    if hw > 0.03:
        out.append(([(cx - hw * 0.8, b0 + 0.14), (cx + hw * 0.8, b0 + 0.14)], ln * 0.8, P["relief"] * 0.45))  # foot bar
    return out


def build(name, seed, dims, lean=0.1, waves=7):
    rnd = random.Random(seed)
    w, d, h = dims
    tx = lean * w
    planes = _planes(w, d, h, tx, rnd)
    planes += _facets(planes, dims, rnd)
    ob = chipped_block(name, "runestone", dims, seed, tilt=1.0, corners=0.0, edges=0, bevel=0.012, extra=planes, moss=0.1, flat_bottom=True, moss_kw=dict(face_var=0.3))
    fl = math.radians(P["front_lean"])
    n = (0.0, -math.cos(fl), math.sin(fl))
    u, v = (1.0, 0.0, 0.0), (0.0, math.sin(fl), math.cos(fl))
    origin = (0.0, -d / 2 + 0.02, 0.0)
    outline = _panel_outline(w, h, tx)
    _cut_prism(ob, _inset(outline, -P["frame"]), origin, u, v, n, P["frame_depth"])  # the frame step
    _cut_prism(ob, outline, origin, u, v, n, P["depth"])  # the panel floor
    floor_mat = TC.flat_mat("M_rune_floor", (0.07, 0.1, 0.12), emit=TC.GLOW, strength=P["floor_glow"])
    glow_mat = TC.flat_mat("M_rune_glow", (0.1, 0.3, 0.32), emit=TC.GLOW, strength=P["glow"])
    stone_m = ob.data.materials[0]
    for f in ob.data.polygons:  # the booleans leave an empty slot behind: back to one known slot order
        f.material_index = 0
    set_materials(ob, stone_m, floor_mat, glow_mat)
    nv, ov = Vector(n), Vector(origin)
    for f in ob.data.polygons:  # the floor: faces parallel to the front plane at the full depth
        if f.normal.dot(nv) > 0.97 and abs((f.center - ov).dot(nv) + P["depth"]) < 0.004:
            f.material_index = 1
    bm = bmesh.new()
    floor_origin = ov - nv * P["depth"]
    for i, (pts, width, relief) in enumerate(_rune(bm, outline, waves, rnd)):
        shapes.ribbon(bm, pts, width, floor_origin, u, v, n, depth=relief, sink=0.003 + 0.0015 * i)  # own sink each: no coplanar undersides
    for f in bm.faces:
        f.material_index = 2
    me = bpy.data.meshes.new(name + "_rune")
    bm.to_mesh(me)
    bm.free()
    for m in ob.data.materials:
        me.materials.append(m)
    rune = bpy.data.objects.new(name + "_rune", me)
    collection("runestone").objects.link(rune)
    with bpy.context.temp_override(active_object=ob, selected_editable_objects=[ob, rune], selected_objects=[ob, rune]):
        bpy.ops.object.join()
    return ob


def build_all():
    for name, v in VARIANTS.items():
        drop(name)
        build(name, v["seed"], v["dims"], lean=v["lean"], waves=v["waves"])
    return list(VARIANTS)
