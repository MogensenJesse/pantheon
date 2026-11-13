"""Group-only ivy that follows the structure: every vine is traced across the real surface (rays against the wall blocks or pillar meshes), so stems and
leaves lie on the faces, wrap the pillar corners and drape down from wall crests. Materials are the frozen vine_a ones (stem, leaf). One mesh per group.
Frame of a face: O origin, U horizontal tangent, Z up, D direction into the surface (the vine grows on the side the rays start from)."""
import math
import random

import bmesh
import bpy
from mathutils import Vector

import shapes
from vine import LEAF


def snap(objs, p, d, reach=1.0):
    """Nearest hit of a ray from p - d*reach along d on objs: (world point, world normal) or None. Objects whose box centre is more than 1.6 m from the ray are skipped."""
    o = p - d * reach
    best = None
    for ob in objs:
        c = ob.matrix_world @ (sum((Vector(v) for v in ob.bound_box), Vector()) / 8)
        off = c - p
        if (off - d * off.dot(d)).length > 1.6:
            continue
        mi = ob.matrix_world.inverted()
        ok, loc, nrm, _ = ob.ray_cast(mi @ o, (mi.to_3x3() @ d).normalized(), distance=reach * 4)
        if ok:
            w = ob.matrix_world @ loc
            dist = (w - o).length
            if best is None or dist < best[0]:
                best = (dist, w, (mi.to_3x3().transposed() @ nrm).normalized())
    return None if best is None else (best[1], best[2])


class Ivy:
    def __init__(self, seed):
        self.rnd = random.Random(seed)
        self.bm = bmesh.new()

    def _trace(self, objs, O, U, Z, D, u, v, heading, length, step=0.08, wander=0.3, hug=0.0, centre=None):
        """Points (P, n) of a stem growing from (u, v) of the face, heading = angle from straight up (0 up, pi down). `hug` pulls it back to its start column
        (pillar corners); a ray that misses the surface is retried straight up/down from the last good spot, and the stem ends after three misses."""
        pts, u0, up = [], u, math.cos(heading) > 0
        last, misses = (u, v), 0
        for _ in range(int(length / step)):
            hit = snap(objs, O + U * u + Z * v, D)
            if hit is None:
                misses += 1
                if misses > 2:
                    break
                u, v = last
                if centre is not None:  # slid off a narrower shaft: nudge towards its middle
                    u += math.copysign(min(0.05, abs(u - centre)), centre - u)
                heading = 0.0 if up else math.pi
            else:
                pts.append(hit)
                last = (u, v)
            heading += self.rnd.gauss(0.0, wander) - 0.12 * math.sin(heading) - hug * (u - u0) * (1 if math.cos(heading) > 0 else -1)
            u += math.sin(heading) * step
            v += math.cos(heading) * step
        return pts

    def vine(self, objs, O, U, Z, D, u, v, up=True, length=1.5, wander=0.3, leaf=0.15, branches=2, hug=0.0, centre=None):
        main = self._trace(objs, O, U, Z, D, u, v, 0.0 if up else math.pi, length, wander=wander, hug=hug, centre=centre)
        paths = [main]
        for k in range(branches):
            if len(main) < 8:
                break
            i = int(len(main) * self.rnd.uniform(0.3, 0.7))
            side = self.rnd.choice((-1, 1))
            uu = (main[i][0] - O).dot(U)
            vv = (main[i][0] - O).dot(Z)
            paths.append([main[i]] + self._trace(objs, O, U, Z, D, uu, vv, (0.0 if up else math.pi) + side * self.rnd.uniform(0.7, 1.1), length * self.rnd.uniform(0.25, 0.4), wander=wander, hug=hug * 0.3, centre=centre)[1:])
        for pts in paths:
            if len(pts) > 2:
                self._build(pts, leaf)

    def _build(self, pts, leaf):
        bm, rnd = self.bm, self.rnd
        stem = [p + n * 0.01 for p, n in pts]
        shapes.tube(bm, stem, [0.011 - 0.005 * i / len(stem) for i in range(len(stem))], sides=4)
        for i in range(1, len(pts) - 1):
            p, n = pts[i]
            t = pts[i + 1][0] - pts[i - 1][0]
            t = (t - n * t.dot(n)).normalized()
            sgn = 1 if i % 2 else -1
            a = rnd.uniform(0.5, 1.1)
            out = (t * math.cos(a) + n.cross(t) * math.sin(a) * sgn).normalized()
            perp = n.cross(out)
            s = leaf * rnd.uniform(0.75, 1.25) * (0.7 + 0.5 * i / len(pts))
            lift = rnd.uniform(0.15, 0.5)
            base = p + n * 0.012
            verts = [bm.verts.new(base + out * (x * s + 0.02) + perp * (y * s * 0.75) + n * (0.012 + 0.1 * s * (1 - abs(y)) * 0.5 + x * s * lift * 0.35)) for x, y in LEAF]
            cen = bm.verts.new(base + out * (0.4 * s + 0.02) + n * (0.012 + 0.07 * s))
            for k in range(len(verts)):
                f = bm.faces.new((cen, verts[k], verts[(k + 1) % len(verts)]))
                f.material_index = 1
                f.smooth = False

    def finish(self, G, name="ivy"):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(name, me)
        for f in me.polygons:
            f.use_smooth = False
        src = bpy.data.objects["vine_a"].data.materials
        for m in src:
            me.materials.append(m)
        bpy.data.collections["G_" + G].objects.link(ob)
        return ob


def pillars_of(G):
    """The pillar_a copies placed in G_<G>."""
    me = bpy.data.objects["pillar_a"].data
    return [o for o in bpy.data.collections["G_" + G].objects if o.data is me]
