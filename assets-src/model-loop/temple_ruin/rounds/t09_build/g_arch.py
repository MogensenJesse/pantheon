"""Group 'arch': a freestanding arch on two carved pillars (1.3 m clear opening). Seven voussoirs per row (a keystone and three each side) on a semi-ellipse
(half span 0.65 m, rise 1.1 m), two rows deep, each stone scaled 1.3x and turned along the normal of the curve. One stone has slipped. Moss at the pillar
feet, ivy running capital to base on both pillars; one rubble block touches a plinth."""
import math
import random

import bpy
from mathutils import Vector

from groups import gcol, jit, place, put, rx, ry, rz
from ivy import Ivy, pillars_of

G = "arch"
A_IN, B_IN = 0.65, 1.1  # inner half span and rise of the ring
PX = 0.98  # pillar centres at x = +-PX (clear gap 1.29 m)
N = 7
SC = 1.38
DS = 0.85  # depth scale of the ring stones (ring about 70% of the capital depth)
ROW = 0.13  # the two rows sit at y = +-ROW so their seam is overlapped


def _ellipse_angles(n):
    """n parameter angles (from +x to -x) spaced evenly along the ellipse's arc length."""
    pts = [(math.cos(math.pi * i / 400), math.sin(math.pi * i / 400)) for i in range(401)]
    acc = [0.0]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        acc.append(acc[-1] + math.hypot((x1 - x0) * A_IN, (y1 - y0) * B_IN))
    out = []
    for k in range(n):
        target = acc[-1] * (k + 0.5) / n
        i = next(j for j, v in enumerate(acc) if v >= target)
        out.append(math.pi * i / 400)
    return out


def build():
    gcol(G)
    rnd = random.Random(7)
    top = 2.463  # pillar_a height
    for sx, k in ((-1, 90), (1, 180)):
        put(G, rnd, "pillar_a", (sx * PX, 0.0, 0.0), rz(k), pos=0.005, ang=0.8, hgt=0.0)
    for row, y in enumerate((-ROW, ROW)):
        for i, t in enumerate(_ellipse_angles(N)):
            nx, nz = math.cos(t) / A_IN, math.sin(t) / B_IN  # outward normal of the ellipse
            phi = math.degrees(math.atan2(nx, nz))
            loc = ((A_IN + 0.03) * math.cos(t), y, top + (B_IN + 0.03) * math.sin(t))
            rot = ry(phi)
            if row == 0 and i == 4:  # one stone has slipped out of its place
                loc = (loc[0] + 0.015, loc[1], loc[2] - 0.025)
            src = "voussoir_a" if (i + row) % 2 == 0 else "voussoir_b"
            l, r, _ = jit(rnd, loc, 0.002, 0.25, rot, 0.0)
            place(G, src, l, r, (SC, SC * DS, SC), "v%d_%d" % (row, i))
    # ivy follows the right pillar's corner and the springer (rays against the real shaft); no moss clumps (moss is painted on the stones)
    bpy.context.view_layer.update()
    pil = pillars_of(G)
    iv = Ivy(92)
    Z = Vector((0, 0, 1))
    iv.vine(pil, Vector((PX, -1.0, 0)), Vector((1, 0, 0)), Z, Vector((0, 1, 0)), 0.24, 0.05, up=True, length=2.1, wander=0.12, hug=2.5, centre=0.0, leaf=0.2)
    iv.vine(pil, Vector((PX + 1.0, 0, 0)), Vector((0, 1, 0)), Z, Vector((-1, 0, 0)), -0.24, 0.05, up=True, length=1.5, wander=0.12, hug=2.5, centre=0.0, leaf=0.2)
    iv.vine(pil, Vector((-PX, -1.0, 0)), Vector((1, 0, 0)), Z, Vector((0, 1, 0)), 0.24, 1.9, up=False, length=0.9, wander=0.12, hug=2.5, centre=0.0, leaf=0.2, branches=1)
    iv.finish(G)
    place(G, "rubble_a", (PX + 0.42, -0.1, 0.0), rz(40))
