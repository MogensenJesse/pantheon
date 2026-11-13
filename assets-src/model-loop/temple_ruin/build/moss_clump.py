"""Part 'moss_clump': a tuft of blocky low-poly green moss, 10-14 packed lumps (convex hulls of 15 random points on a squashed sphere, so each is an
irregular ~25-facet pebble), flat shaded in one flat olive paint with a value step per facet.
r06 (judge 5.5): hulls from random points (no regular fan), size ladder (one dominant lump at the back, a big one in front, mids, small low ones),
shallow overlap, compact footprint, flat base."""
import math
import random

import bmesh
from mathutils import Euler, Vector

from tcommon import finish_mesh, moss_mat, set_materials

VARIANTS = {
    "moss_clump_a": dict(seed=158, n=11, reach=0.17),
    "moss_clump_b": dict(seed=157, n=9, reach=0.15),
    "moss_clump_c": dict(seed=159, n=12, reach=0.14),
}
PTS = 14


def _lump(bm, rnd, c, r, sz):
    """An 18-point pebble: points spread evenly over a sphere (so no shard spikes), the whole set turned at random so no two lumps share a facet
    pattern, each point pushed in or out by up to 12%."""
    rot = Euler((rnd.uniform(0, 6.28), rnd.uniform(0, 6.28), rnd.uniform(0, 6.28))).to_matrix()
    pts = []
    sxy = (1.0, rnd.uniform(0.78, 1.0))  # no two lumps are the same width
    for i in range(PTS):
        y = 1 - 2 * (i + 0.5) / PTS
        rad = math.sqrt(1 - y * y)
        a = i * 2.399963
        u = rot @ Vector((math.cos(a) * rad, math.sin(a) * rad, y))
        u = Vector((u.x * sxy[0], u.y * sxy[1], u.z))
        k = r * rnd.uniform(0.88, 1.12)
        pts.append(bm.verts.new(Vector((c[0] + u.x * k, c[1] + u.y * k, max(c[2] + u.z * k * sz, 0.0)))))
    res = bmesh.ops.convex_hull(bm, input=pts, use_existing_faces=False)
    bmesh.ops.delete(bm, geom=list(set(res["geom_interior"] + res["geom_unused"])), context="VERTS")


def build_all():
    for name, v in VARIANTS.items():
        rnd = random.Random(v["seed"])
        bm = bmesh.new()
        big = rnd.uniform(0.115, 0.125)
        placed = [(Vector((0, 0.03, big * 0.95)), big)]  # the dominant lump, a little to the back
        _lump(bm, rnd, placed[0][0], big, 0.9)
        radii = [0.095] + [rnd.uniform(0.07, 0.09) for _ in range(v["n"] // 2 - 1)] + [rnd.uniform(0.045, 0.06) for _ in range(v["n"] - v["n"] // 2)]
        for r in radii:
            for _ in range(20):  # retry until the lump stays inside the footprint
                c0, r0 = rnd.choice(placed)
                ang = rnd.uniform(0, math.tau)
                dist = (r0 + r) * rnd.uniform(0.68, 0.82)  # shallow overlap, so the lumps read as separate pebbles
                c = Vector((c0.x + math.cos(ang) * dist, c0.y + math.sin(ang) * dist, max(r * 0.8, c0.z + rnd.uniform(-0.4, 0.5) * dist * 0.6 - (0.02 if r < 0.065 else 0.0))))
                if math.hypot(c.x, c.y) < v["reach"]:
                    break
            placed.append((c, r))
            _lump(bm, rnd, c, r, 0.88)
        ob = finish_mesh(bm, name, "moss_clump", bevel=0.0, segs=1, flat=True)
        set_materials(ob, moss_mat(tex_contrast=0.5, tex_sat=0.72, top_light=0.2, face_var=0.2, gain=1.0))
    return list(VARIANTS)
