"""Root 'temple_ruin': the five finished groups placed on a low, broken stone podium (0.8 m), with big boulders and rubble round it. Front is -Y, the camera
of the reference looks from the front-left (az -38): the slab roof slope on the left, the gable and its dragon heads on the right, the colonnade across the
front with the arch in front of its middle and the (flattened) stairs leading up into the arch. Groups are collection instances of G_<group> (the group
builders must have run first, see grun.sh temple_ruin). Round 2: lower podium with ragged perimeter and collapsed gaps, irregular flagstones, arch pulled
into the colonnade line, stairs centred, big flanking boulders, rubble against the podium edge."""
import bmesh
import bpy
import random

from groups import gcol, inst, jit, place, rx, rz

G = "temple_ruin"
TOP = 0.8  # podium top
X0, X1, Y0, Y1 = -4.5, 4.4, -5.4, 3.4
STAIR_X = (-1.45, 1.45)  # the stairs' opening in the front facing blocks
SC = (1.0, 1.0, 1.25)  # podium facing: wall_block (0.6 x 0.4 x 0.3) stretched to 0.375 m courses
BH = 0.375
ARCH = (0.0, -4.3)  # on the podium in front of the colonnade, centred on it, the stairs lead up into it
# (side, a0, a1, both courses): stretches of the facing that have collapsed (the upper course only, or both)
GAPS = (("L", -2.5, -1.0, True), ("L", 0.5, 1.8, False), ("B", -1.0, 0.6, True), ("B", 3.0, 4.4, False), ("R", -0.5, 0.8, False), ("F", -3.4, -2.2, False))


def _core(name, x0, y0, x1, y1, z1):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 + (v.co.x + 0.5) * (x1 - x0)
        v.co.y = y0 + (v.co.y + 0.5) * (y1 - y0)
        v.co.z = (v.co.z + 0.5) * z1
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    m = bpy.data.materials.get("M_wall_core")
    if m is not None:
        me.materials.append(m)
    bpy.data.collections["G_" + G].objects.link(ob)


def _gone(side, a, c):
    return any(s == side and a0 < a < a1 and (both or c == 1) for s, a0, a1, both in GAPS)


def _podium(rnd):
    """Two courses of big ashlar facing round a dark core (ragged: sunk, tilted and missing blocks), irregular flagstones on top."""
    names = ["wall_block_a", "wall_block_b", "wall_block_c"]
    nom = {"wall_block_a": 0.6, "wall_block_b": 0.52, "wall_block_c": 0.68}
    _core("podium_core", X0 + 0.45, Y0 + 0.45, X1 - 0.45, Y1 - 0.45, TOP - 0.1)
    for c in range(2):
        z = c * BH
        for side, fixed, yaw, lo, hi in (("F", Y0 + 0.2, 0, X0 + 0.35, X1), ("B", Y1 - 0.2, 180, X0 + 0.35, X1), ("L", X0 + 0.2, 90, Y0 + 0.35, Y1), ("R", X1 - 0.2, 270, Y0 + 0.35, Y1)):
            a = lo + (0.35 if c else 0.0)
            while a < hi:
                name = rnd.choice(names)
                ln = nom[name]
                mid = a + ln / 2
                a += ln + 0.006
                if _gone(side, mid, c) or (side == "F" and STAIR_X[0] < mid < STAIR_X[1]) or mid > hi:
                    continue
                loc = (mid, fixed, z) if side in "FB" else (fixed, mid, z)
                place(G, name, loc, rz(yaw), SC)  # tight: no jitter, true courses
    for side, a0, a1, both in GAPS:  # spilled blocks at every gap
        for k in range(3):
            a = rnd.uniform(a0, a1)
            d = rnd.uniform(0.5, 1.1)
            x, y = {"L": (X0 - d, a), "R": (X1 + d, a), "B": (a, Y1 + d), "F": (a, Y0 - d)}[side]
            l, r, _ = jit(rnd, (x, y, 0.0), 0.0, 0.0, rz(rnd.uniform(0, 360)) @ rx(rnd.uniform(-9, 9)), 0.0)
            place(G, rnd.choice(names), l, r, (1.0, 1.0, 1.0))
    ts = ("roof_slab_a", "roof_slab_b", "roof_slab_c")
    x, ix = X0 + 0.7, 0
    while x < X1 - 0.5:  # slabs about 1.1 m across, columns offset against each other, hairline joints
        y, iy = Y0 + 0.7 + rnd.uniform(0.0, 0.5), 0
        while y < Y1 - 0.5:
            if rnd.random() > 0.04:
                s = rnd.uniform(0.9, 1.0)
                l, r, _ = jit(rnd, (x + rnd.uniform(-0.03, 0.03), y, TOP - 0.18), 0.0, 1.0, rz(90), 0.0)
                place(G, ts[(ix + iy) % 3], l, r, (1.3 * s, 2.4 * s, 1.5))
            y += rnd.uniform(1.1, 1.25)
            iy += 1
        x += 1.17
        ix += 1


def build():
    gcol(G)
    rnd = random.Random(51)
    _podium(rnd)
    z = TOP
    inst(G, "walls", (0.0, 0.0, z))
    inst(G, "roof_ruin", (0.0, 0.0, z + 2.7))
    inst(G, "colonnade", (0.0, -3.0, z))
    inst(G, "arch", (ARCH[0], ARCH[1], z), None, (1.15, 1.15, 1.15))
    inst(G, "stairs", (0.0, Y0 - 0.78, 0.0), None, (1.1, 0.8, 0.7))  # as wide as the arch (2.9 m incl. cheeks), tread 0.36, riser 0.18, ends level with the podium
    # big boulders flank the building, rubble heaped against the podium and at the stair feet
    for src, x, y, yaw, s in (("boulder_a", -6.2, -3.0, 40, 2.2), ("boulder_c", 6.4, -0.8, 200, 2.0), ("boulder_b", -5.6, 3.4, 130, 1.5), ("boulder_a", 6.0, 3.4, 300, 1.2),
                              ("boulder_b", 3.6, -7.0, 20, 1.1)):
        place(G, src, (x, y, 0.0), rz(yaw), (s, s, s))
    for k in range(22):
        t = rnd.random()
        side = k % 4
        d = rnd.uniform(0.15, 0.8)
        x, y = ((X0 - d, Y0 + t * (Y1 - Y0)), (X1 + d, Y0 + t * (Y1 - Y0)), (X0 + t * (X1 - X0), Y1 + d), (X0 + t * (X1 - X0), Y0 - d))[side]
        place(G, ("rubble_a", "rubble_b", "rubble_c", "rubble_d")[k % 4], (x, y, 0.0), rz(rnd.uniform(0, 360)), (1.8, 1.8, 1.8))
    for k, x in enumerate((-1.9, -1.4, 1.4, 1.9)):  # stair feet
        place(G, ("rubble_a", "rubble_c")[k % 2], (x, Y0 - 1.0 - rnd.uniform(0, 0.3), 0.0), rz(rnd.uniform(0, 360)), (1.7, 1.7, 1.7))
