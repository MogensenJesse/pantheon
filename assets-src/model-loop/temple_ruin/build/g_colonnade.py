"""Group 'colonnade': four chunky carved pillars (1.2x wide, 1.15x tall; one sunk and turned a little), an architrave band along the whole run, a lintel
of four long slabs of uneven length (ashlar copies stretched along the row), rubble at the pillar feet, and ivy that follows the pillar corners (ivy.py, no moss clumps:
moss is painted on the stones)."""
import random

import bpy
from mathutils import Vector

from groups import gcol, place, rx, rz
from ivy import Ivy, pillars_of

G = "colonnade"
XS = (-2.25, -0.75, 0.75, 2.25)  # pillar centres, 1.5 m apart
PW, PH = 1.2, 1.15  # pillar scale: width and depth, height
TOP = 2.463 * PH - 0.01  # the architrave starts on the capitals
BAND = 0.15
LINTEL_Z = TOP + BAND
# lintel slabs: (centre x, length scale) of ashlar_x (0.465 m long): lengths 1.3, 1.85, 1.2, 1.5 m, ends overhang the outer pillars
SLABS = ((-2.55, 2.8), (-1.0, 4.0), (0.55, 2.6), (2.1, 3.2))


def build():
    gcol(G)
    rnd = random.Random(11)
    sink = {2: 0.08}
    yaw = {0: 0.0, 1: 2.5, 2: -2.0, 3: 0.0}
    for i, x in enumerate(XS):
        rot = rz(90 * rnd.randrange(4) + yaw[i]) @ (rx(1.0) if i == 1 else rz(0))
        place(G, "pillar_a", (x, 0.0, -sink.get(i, 0.0)), rot, (PW, PW, PH), "pillar%d" % i)
    place(G, "ashlar_b", (-1.45, 0.0, TOP), rz(0), (6.0, 3.1, 0.62), "architrave_l")
    place(G, "ashlar_c", (1.45, 0.0, TOP), rz(0), (6.4, 3.1, 0.62), "architrave_r")
    for k, (x, ls) in enumerate(SLABS):
        place(G, ("ashlar_a", "ashlar_b", "ashlar_c", "ashlar_a")[k], (x, 0.0, LINTEL_Z + (0.04 if k == 2 else 0.0)), rz(0), (ls, 3.2, 1.45), "lintel%d" % k)
    # ivy follows the pillar corners (rays against the real shafts): front-face and side-face runs a hand's width from a front corner, plus a drape from the capital
    bpy.context.view_layer.update()
    pil = pillars_of(G)
    iv = Ivy(91)
    Z, one = Vector((0, 0, 1)), Vector((0, 1, 0))
    for i, x in enumerate(XS):
        c = -1 if i % 2 == 0 else 1  # which front corner
        iv.vine(pil, Vector((x, -1.0, 0)), Vector((1, 0, 0)), Z, one, c * 0.24, 0.05, up=True, length=rnd.uniform(1.4, 2.0), wander=0.12, hug=2.5, centre=0.0, leaf=0.2)
        iv.vine(pil, Vector((x + c * 1.0, 0, 0)), Vector((0, 1, 0)), Z, Vector((-c, 0, 0)), -0.24, 0.05, up=True, length=rnd.uniform(1.0, 1.6), wander=0.12, hug=2.5, centre=0.0, leaf=0.2)
        iv.vine(pil, Vector((x, -1.0, 0)), Vector((1, 0, 0)), Z, one, -c * 0.24, 2.4, up=False, length=rnd.uniform(1.1, 1.7), wander=0.12, hug=2.5, centre=0.0, leaf=0.2, branches=1)
        iv.vine(pil, Vector((x, -1.0, 0)), Vector((1, 0, 0)), Z, one, c * 0.1, 2.4, up=False, length=rnd.uniform(0.7, 1.1), wander=0.12, hug=2.5, centre=0.0, leaf=0.2, branches=1)  # t10: a drape from every capital (t09: pillars 1 and 2 only, 0.8-1.2 m)
    iv.finish(G)
    place(G, "rubble_b", (-0.0, -0.75, 0.0), rz(60), (1.5, 1.5, 1.5))
    place(G, "rubble_d", (2.7, -0.6, 0.0), rz(200), (1.5, 1.5, 1.5))
