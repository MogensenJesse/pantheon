"""Group 'roof_ruin': a broken gable roof. Ridge along Y (6 m), gable fronts at y = -3 / +3, 47 degree pitch, half span 2.75 m (ridge 2.95 m).
Round 3: chunky slabs (7 courses of ~0.8 m wide, 0.22 m thick, random half-offsets) on the LEFT slope (the one the reference view looks at, camera az -35)
with a 2.2 m stepped hole whose rim slabs are tipped into it; the right slope keeps dark sheathing planks plus slabs on its upper part; thick carved
bargeboards (carved face to the front, rolled 90 degrees), a heavy tie beam, king post and struts; two big dragon heads. No moss clumps (moss is painted: most slabs are the mossy roof_slab_m variants).
Round 4 (user): only a few rafters and three rows of sheathing under the slabs, ivy lying on the slopes (ivy.py)."""
import math
import random

import bpy
from mathutils import Vector

from groups import gcol, place, rx, ry, rz
from ivy import Ivy

G = "roof_ruin"
A = 47.0
CA, SA = math.cos(math.radians(A)), math.sin(math.radians(A))
HS = 2.75
H = HS * math.tan(math.radians(A))  # ridge height
SL = HS / CA  # slope length
YF = 3.0  # gable at y = -YF / +YF
RS = 0.58  # course spacing along the slope
S0 = 0.15
NK = 7
HOLE_Y = {6: (-1.8, 1.3), 5: (-1.8, 1.4), 4: (-1.5, 1.2), 3: (-1.1, 0.9), 2: (-0.7, 0.6)}  # y range of the missing slabs per course
KEEP_R = {6: 0.95, 5: 0.9, 4: 0.85, 3: 0.7, 2: 0.45}  # chance a slab is still on the right slope


def _pt(side, s, off=0.0):
    """Point on the rafter plane at slope distance s from the eave (side -1 left, +1 right), `off` along the outward normal; returns (x, z)."""
    x = side * (HS - s * CA)
    z = s * SA
    return x + side * SA * off, z + CA * off


def _base(side):
    return (ry(-A) if side < 0 else ry(A)) @ rz(90)  # slab long axis along Y, laid on the slope


def _near_hole(k, y):
    """The side of the hole the slab sits on (+1 below its centre, -1 above) when it is on the rim, else 0."""
    for kk, (lo, hi) in HOLE_Y.items():
        if abs(kk - k) <= 1 and (lo - 1.0 < y < lo or hi < y < hi + 1.0):
            return 1 if y < (lo + hi) / 2 else -1
    return 0


def _slabs(rnd, side):
    ks = range(NK) if side < 0 else range(2, NK)
    for k in ks:
        y = -3.0 - rnd.uniform(0.0, 0.7)
        while y < 3.0:
            sx = rnd.uniform(0.85, 1.15)
            w = 0.9 * sx
            c = y + w / 2
            y += w + 0.05
            if c < -3.05 or c > 3.0:
                continue
            lo, hi = HOLE_Y.get(k, (9.0, 9.0))
            if side < 0 and (lo < c < hi or (k == NK - 1 and c > 2.2 and rnd.random() < 0.5) or (rnd.random() < 0.06)):
                continue
            if side > 0 and rnd.random() > KEEP_R[k]:
                continue
            x, z = _pt(side, S0 + k * RS, 0.2)
            rim = _near_hole(k, c) if side < 0 else 0
            if rim and rnd.random() < 0.7:
                tilt_ry = rim * rnd.uniform(25, 40)  # the end next to the hole drops into it
                rot = _base(side) @ rz(rnd.uniform(-5, 5)) @ ry(tilt_ry)
            else:
                rot = _base(side) @ rz(rnd.uniform(-5, 5)) @ rx(rnd.uniform(-4, 4))
            sc = (sx, rnd.uniform(1.55, 1.85), 1.8)
            names = ("roof_slab_a", "roof_slab_b", "roof_slab_c") if rnd.random() < 0.3 else ("roof_slab_ma", "roof_slab_mb", "roof_slab_mc")
            place(G, names[int(c * 3 + k) % 3], (x + rnd.uniform(-0.03, 0.03), c, z), rot, sc)


def build():
    gcol(G)
    rnd = random.Random(41)
    for side in (-1, 1):  # rafters: two per line end to end, four lines per slope
        rot = ry(-A) if side < 0 else ry(A)  # the rafter's x axis climbs towards the peak
        for yi, y in enumerate((-2.4, -0.8, 0.8, 2.4)):
            for si, s in enumerate((1.0, 2.9)):
                x, z = _pt(side, s, -0.12)  # the rafters sit under the slabs
                src = "rafter_a" if side > 0 else ("rafter_a", "rafter_c", "rafter_b")[(yi + si) % 3]
                place(G, src, (x, y + rnd.uniform(-0.01, 0.01), z), rot @ rz(rnd.uniform(-1, 1)), (1.0, 1.0, 1.0))
    for side in (-1, 1):  # sheathing planks across the rafters, end to end along Y
        for k in (1, 5, 9):  # three rows only
            x, z = _pt(side, 0.2 + k * 0.3, 0.04)
            for y in (-1.9, 0.0, 1.9):
                place(G, "rafter_a", (x, y, z), _base(side), (1.0, 1.25, 0.5))
    for k, y in enumerate((-2.0, 0.0, 2.0)):  # ridge beam
        place(G, ("rafter_c", "rafter_a", "rafter_b")[k], (0.0, y, H - 0.14), rz(90), (1.0, 1.3, 1.2))
    for side in (-1, 1):
        _slabs(rnd, side)
    for sx in (-1, 1):  # two half-fallen slabs inside the hole
        x, z = _pt(-1, 2.0 + sx * 0.4, 0.0)
        place(G, "roof_slab_mb", (x + 0.1, 0.4 * sx, z + 0.12), ry(-A + 25 * sx) @ rz(90 + 20 * sx), (1.1, 1.6, 1.8))
    # bargeboards: the part is 4.46 x 0.16 x 0.34 (width = z, origin on its bottom edge), so it hangs `hang` below the roof plane and rises to above the slabs; both ends cross above the peak
    ox, oz = -1.726 * CA, H - 1.726 * SA
    hang = 0.22
    bsc = (1.0, 1.4, 1.4)  # width 0.48 m, thickness 0.22 m
    for fy, flip in ((-YF, 1), (YF, -1)):
        l_src, r_src = ("bargeboard_a", "bargeboard_b") if flip > 0 else ("bargeboard_b", "bargeboard_a")
        face = rz(0) if flip > 0 else rz(180)
        place(G, l_src, (flip * (ox + hang * SA), fy, oz - hang * CA), face @ ry(-A), bsc)
        rx_, rz_ = 1.275 * CA, H - 1.275 * SA  # board b: its -x end passes the peak by 0.5 m, its other end is the broken one
        place(G, r_src, (flip * (rx_ - hang * SA), fy, rz_ - hang * CA), face @ ry(A), bsc)
    # front gable frame: heavy tie beam across, king post, two struts
    yb = -YF + 0.2
    place(G, "bargeboard_a", (0.0, yb, 0.5), rz(0), (1.2, 1.5, 1.5))
    tim = (1.0, 1.3, 1.2)
    place(G, "rafter_a", (0.0, yb, 1.45), ry(-90), tim)
    place(G, "rafter_b", (0.0, yb, 2.2), ry(-90), tim)
    place(G, "rafter_c", (0.7, yb, 1.25), ry(-37), tim)
    place(G, "rafter_c", (-0.7, yb, 1.25), ry(37), tim)
    # dragon heads at the front peak, big, splayed outward and facing outward
    for name, x, rot in (("head_l", -0.5, ry(-16) @ rz(180 + 25)), ("head_r", 0.5, ry(16) @ rz(-25))):
        place(G, "dragon_head", (x, -YF - 0.14, H + 0.02), rot, (2.6, 3.6, 2.6), name)
    # ivy lies on the slabs (rays against the slab meshes): climbs from the eave on the slab slope, drapes from the ridge on both
    bpy.context.view_layer.update()
    slabs = [o for o in bpy.data.collections["G_" + G].objects if o.name.startswith("roof_slab")]
    iv = Ivy(95)
    U = Vector((0, 1, 0))
    for side, ups, downs in ((-1, (-2.3, -1.1, 0.4, 1.5, 2.4), (-0.6, 1.9)), (1, (), (-1.9, 0.3, 2.0))):
        n_out = Vector((side * SA, 0, CA))
        t_up = Vector((-side * CA, 0, SA))
        ox_, oz_ = _pt(side, 0.0, 0.6)
        frame = (Vector((ox_, 0, oz_)), U, t_up, -n_out)
        for u in ups:
            iv.vine(slabs, *frame, u, 0.3, up=True, length=rnd.uniform(2.2, 3.2), wander=0.2, hug=0.8, leaf=0.2)
        for u in downs:
            iv.vine(slabs, *frame, u, 3.7, up=False, length=rnd.uniform(1.4, 2.2), wander=0.2, hug=0.8, leaf=0.2, branches=1)
    iv.finish(G)
