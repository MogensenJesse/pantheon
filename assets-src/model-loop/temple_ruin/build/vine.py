"""Part 'vine': vine_a is a hanging ivy strand (r06, judge 4.1): two kinked 5-sided stems (a side stem forks off 15% down), ~30 chunky lobed ivy leaves in
clusters on short stalks with bare stretches between, a bare kinked twig at the bottom. vine_b is a lumpy twisted root: two strands wound round each other
(about 3 crossings), swelling and pinching, centre line wandering, splitting at the bottom into 5 tapering rootlets of different lengths with hooked tips.
Two material slots: 0 = stem / root, 1 = leaves (moss green)."""
import math
import random

import bmesh
import bpy
from mathutils import Vector

import loop_mat
import shapes
from tcommon import _rel, _spec, collection, drop, moss_mat, set_materials

H = 1.5
LEAF = [(0.0, 0.0), (0.02, -0.38), (0.2, -0.62), (0.42, -0.5), (0.5, -0.2), (0.78, -0.3), (0.82, -0.08), (1.0, 0.0), (0.82, 0.08), (0.78, 0.3), (0.5, 0.2), (0.42, 0.5), (0.2, 0.62), (0.02, 0.38)]


def _kinked(rnd, z0, z1, x0, step, kink):
    """A stem polyline from z0 down to z1: straight segments of ~`step` m, each bending sideways by up to `kink` m."""
    pts, x, y, z = [], x0, 0.0, z0
    while z > z1:
        pts.append(Vector((x, y, z)))
        z -= step * rnd.uniform(0.8, 1.2)
        x += rnd.uniform(-kink, kink)
        y += rnd.uniform(-kink, kink) * 0.5
    pts.append(Vector((x, y, max(z, z1))))
    return pts


def _leaf(bm, rnd, p, size, side, r_stem=0.01):
    """Lobed ivy leaf on a short stalk: 12-point outline fanned round its middle, folded along the midrib, standing out to `side` and tilted at random."""
    ang = rnd.uniform(-0.7, 0.7) + (0 if side > 0 else math.pi)
    tilt = rnd.uniform(-0.5, 0.2)
    out = Vector((math.cos(ang) * math.cos(tilt), math.sin(ang) * math.cos(tilt), math.sin(tilt) - 0.2)).normalized()
    up = Vector((0, 0, 1))
    side0 = out.cross(up).normalized()
    nrm0 = side0.cross(out).normalized()
    roll = rnd.uniform(0.5, 1.5)
    side_v = side0 * math.cos(roll) + nrm0 * math.sin(roll)
    nrm = side_v.cross(out).normalized()
    s = size * rnd.uniform(0.8, 1.2)
    stalk = p + out * (s * 0.3)
    base = bm.verts.new(p)  # the petiole is a flat sliver from the stem's centre line to the leaf's base
    pl, pr = bm.verts.new(stalk + side_v * 0.004), bm.verts.new(stalk - side_v * 0.004)
    bm.faces.new((base, pr, pl)).smooth = False
    verts = [bm.verts.new(stalk + out * (a * s) + side_v * (b * s * 0.75) + nrm * (0.1 * s * (1 - abs(b)) * 0.5)) for a, b in LEAF]
    cen = bm.verts.new(stalk + out * (0.4 * s) + nrm * (0.09 * s))
    bm.faces.new((pl, pr, verts[0])).smooth = False
    for i in range(len(verts)):
        f = bm.faces.new((cen, verts[i], verts[(i + 1) % len(verts)]))
        f.material_index = 1
        f.smooth = False


def _strand(bm, pts, r_fn, ph, turns, off_fn, sides):
    n = len(pts) - 1
    out = []
    for i, q in enumerate(pts):
        t = i / n
        a = turns * math.tau * t + ph
        k = off_fn(t)
        out.append(q + Vector((math.cos(a) * k, math.sin(a) * k, 0)))
    shapes.tube(bm, out, [r_fn(i / n) for i in range(n + 1)], sides=sides)
    return out


def build_all():
    drop("M_root")
    root_mat = _spec(loop_mat.material("M_root", _rel("textures/timber_paint.png"), tile_m=0.5, rough=1.0, mask="edge", ridge=0.0, obj_var=0.06, top_light=0.1,
                                       ao=0.3, tex_contrast=0.35, tex_sat=0.6, tint=(1.0, 0.95, 0.85), gain=0.9))
    stem_mat = moss_mat(tex_contrast=0.5, tex_sat=0.6, top_light=0.15, face_var=0.12, gain=0.75)
    leaf_mat = moss_mat(tex_contrast=0.5, tex_sat=0.6, top_light=0.15, face_var=0.2, gain=1.2)
    for name in ("vine_a", "vine_b"):
        drop(name)
        rnd = random.Random(161 if name == "vine_a" else 164)
        bm = bmesh.new()
        if name == "vine_a":
            main = _kinked(rnd, H, 0.02, 0.0, 0.1, 0.035)
            n = len(main)
            shapes.tube(bm, main, [0.014 - 0.007 * i / n for i in range(n)], sides=5)
            side = _kinked(rnd, main[int(n * 0.15)].z, 0.45, main[int(n * 0.15)].x + 0.05, 0.09, 0.05)  # a second stem forking off 15% down
            side = [main[int(n * 0.15)]] + side[1:]
            shapes.tube(bm, side, [0.011 - 0.006 * i / len(side) for i in range(len(side))], sides=5)
            for stem, lo, hi in ((main, int(n * 0.1), n - 4), (side, 2, len(side) - 1)):
                i = lo
                while i < hi:  # clusters of one or two leaves, then a bare stretch
                    for k in range(rnd.choice((2, 2, 3))):
                        _leaf(bm, rnd, stem[min(i + k, len(stem) - 1)], rnd.uniform(0.12, 0.18) * (1.15 if i > n * 0.55 else 1.0), 1 if (i + k) % 2 else -1, r_stem=0.014 - 0.007 * min(i + k, n) / n)
                    i += rnd.choice((1, 2, 2))
        else:
            n = 44
            pts = [Vector((0.11 * math.sin(2.6 * t + 0.4) + 0.015 * math.sin(11 * t), 0.04 * math.sin(4.2 * t + 2.0), H * (1 - t))) for t in [i / n for i in range(n + 1)]]
            top_cut = 0.04
            wob = [rnd.uniform(0.7, 1.35) for _ in range(n + 1)]
            top = int(n * 0.78)
            core = pts[:top + 1]
            r_fn = lambda t: 0.02 * (1.0 + 1.2 * t) * wob[min(int(t * n), n)] + 0.007 * math.sin(math.tau * 3 * t)  # noqa: E731
            off = lambda t: 0.004 + 0.03 * math.sin(math.pi * t) ** 0.7  # noqa: E731
            ends = []
            for k in range(2):
                ends.append(_strand(bm, core, lambda t, k=k: r_fn(t * top / n), k * math.pi, 1.5, off, 5)[-1])
            base = pts[top]
            for k in range(4):  # rootlets: lopsided, different lengths, each leaves the foot of the twist, drops, bends and hooks at the tip
                th = 0.3 + k * 0.55 + rnd.uniform(-0.15, 0.15)
                reach = (0.22, 0.12, 0.3, 0.16)[k]
                zend = rnd.uniform(0.0, 0.1)
                p0 = ends[k % 2] if k < 2 else base
                path = [p0, p0 + Vector((math.cos(th) * reach * 0.5, math.sin(th) * reach * 0.5, -(p0.z - zend) * 0.45)),
                        Vector((p0.x + math.cos(th) * reach, p0.y + math.sin(th) * reach, zend + 0.03)),
                        Vector((p0.x + math.cos(th) * (reach + 0.035), p0.y + math.sin(th) * (reach + 0.035), zend))]
                shapes.tube(bm, path, [0.034, 0.025, 0.014, 0.004], sides=4)
                if k == 2:  # one rootlet forks
                    mid = path[1]
                    shapes.tube(bm, [mid, mid + Vector((math.cos(th + 0.9) * 0.07, math.sin(th + 0.9) * 0.07, -0.08)), Vector((mid.x + math.cos(th + 0.9) * 0.1, mid.y + math.sin(th + 0.9) * 0.1, zend))],
                                [0.012, 0.008, 0.003], sides=4)
        zmin = min(v.co.z for v in bm.verts)
        bmesh.ops.translate(bm, vec=(0, 0, -zmin), verts=bm.verts[:])
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        collection("vine").objects.link(ob)
        for f in me.polygons:
            f.use_smooth = False
        set_materials(ob, stem_mat if name == "vine_a" else root_mat, leaf_mat)
    return ["vine_a", "vine_b"]
