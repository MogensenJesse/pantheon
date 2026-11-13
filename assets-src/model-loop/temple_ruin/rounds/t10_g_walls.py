"""Group 'walls' (round 3, user: the stones were too pronounced and loose, the wall must read as a wall): an L of broken walls, a back wall (along X, face at
y = 2.4) and a left wall (along Y, face at x = -2.4), one course-true running bond of the tight wall_block part (0.4 m deep, 0.3 m courses, 6 mm joints,
no jitter), crest stepping down from 3.0 m at the inner corner to about 1.5 m at the free ends. A blind window niche (thin blocks pushed to the back) in
the back wall; a lower ruined right wall (t10); two steles stand outside the left wall; ivy follows the faces (ivy.py); no moss clumps (moss is painted on the blocks)."""
import random

import bpy

from groups import gcol, place, rx, rz
from ivy import Ivy
from mathutils import Vector

G = "walls"
BH = 0.30
LEN = {"wall_block_a": 0.60, "wall_block_b": 0.52, "wall_block_c": 0.68}
NAMES = list(LEN)


def _height(t, h_tall, h_low, rnd):
    return h_tall + (h_low - h_tall) * (t * t * (3 - 2 * t)) + rnd.uniform(-0.3, 0.3)


def _wall(rnd, axis, fixed, a0, a1, h_tall, h_low, tall_at_start, niche=None):
    """Courses of blocks along `axis` from a0 to a1. Returns (a, top z) of the crest blocks."""
    tops = []
    for c in range(int(h_tall / BH) + 2):
        a = a0 + (0.0 if c % 2 == 0 else 0.3)
        k = 0
        while a < a1:
            name = NAMES[(k + c) % 3] if rnd.random() < 0.7 else rnd.choice(NAMES)
            ln = LEN[name]
            mid = a + ln / 2
            a += ln + 0.006
            k += 1
            t = (mid - a0) / (a1 - a0)
            h = _height(t if tall_at_start else 1.0 - t, h_tall, h_low, rnd)
            if (c + 0.5) * BH > h:
                continue
            thin = niche is not None and abs(mid - niche) < 0.35 and 3 <= c <= 4
            loc = (mid, fixed + (0.11 if thin else 0.0), c * BH) if axis == "x" else (fixed + (0.11 if thin else 0.0), mid, c * BH)
            rot = rz(0 if axis == "x" else 90) @ rz(180 if rnd.random() < 0.5 else 0)
            place(G, name, loc, rot, (1.0, 0.45 if thin else 1.0, 1.0))
            if (c + 1.5) * BH > h:
                tops.append((mid, (c + 1) * BH))
    return tops


def build():
    gcol(G)
    rnd = random.Random(31)
    back = _wall(rnd, "x", 2.6, -2.9, 2.2, 3.0, 1.5, True, niche=-1.3)
    left = _wall(rnd, "y", -2.6, -2.3, 2.4, 3.0, 1.5, False)
    right = _wall(rnd, "y", 2.6, -2.3, 2.85, 2.7, 1.2, False)  # t10: ruined right wall under the right eave, tall at the back corner
    place(G, "stele_a", (-3.7, -0.9, 0.0), rz(40), (1.4, 1.4, 1.4))  # outside the left wall
    place(G, "stele_b", (-3.65, 1.0, 0.0), rz(25), (1.4, 1.4, 1.4))
    for name, x, y, rot in (("wall_block_b", -1.9, 2.0, 25), ("wall_block_c", 0.4, 1.95, -10), ("wall_block_a", -2.0, -1.4, 80), ("wall_block_a", 1.5, 2.0, 170)):
        place(G, name, (x, y, 0.0), rz(rot), (1.0, 1.0, 1.0))  # fallen blocks lying flat at the wall feet
    bpy.context.view_layer.update()
    blocks = [o for o in bpy.data.collections["G_" + G].objects if o.name.startswith("wall_block")]
    iv = Ivy(81)

    def spaced(tops, gap, lo):  # crest blocks about `gap` apart along the wall
        out, last = [], -9.0
        for a, z in sorted(tops):
            if a > lo and a - last > gap:
                out.append((a, z))
                last = a
        return out

    bf = (Vector((0, 2.0, 0)), Vector((1, 0, 0)), Vector((0, 0, 1)), Vector((0, 1, 0)))  # back wall face frame
    lf = (Vector((-2.0, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0)))  # left wall face frame
    for a, z in spaced(back, 0.8, -2.6):  # drapes from the crest
        iv.vine(blocks, *bf, a, z - 0.05, up=False, length=rnd.uniform(1.2, 2.2), leaf=0.21)
    for a, z in spaced(left, 0.9, -2.1):
        iv.vine(blocks, *lf, a, z - 0.05, up=False, length=rnd.uniform(1.2, 2.0), leaf=0.21)
    for u in (-0.9, 0.2, 1.3, 2.0):  # climbers from the foot of the back wall
        iv.vine(blocks, *bf, u, 0.05, up=True, length=rnd.uniform(1.2, 2.0), leaf=0.21)
    for u in (-1.8, -0.2, 1.4):
        iv.vine(blocks, *lf, u, 0.05, up=True, length=rnd.uniform(1.2, 1.8), leaf=0.21)
    rf = (Vector((3.6, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1)), Vector((-1, 0, 0)))  # right wall, outer face
    for a, z in spaced(right, 0.9, -2.1):
        iv.vine(blocks, *rf, a, z - 0.05, up=False, length=rnd.uniform(1.0, 1.8), leaf=0.21)
    for u in (-1.2, 1.0):
        iv.vine(blocks, *rf, u, 0.05, up=True, length=rnd.uniform(1.0, 1.6), leaf=0.21)
    iv.finish(G)
