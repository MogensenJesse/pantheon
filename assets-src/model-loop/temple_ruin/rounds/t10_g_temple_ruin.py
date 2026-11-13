"""Root 'temple_ruin': the five finished groups placed on a low, broken stone podium (0.8 m), with big boulders and rubble round it. Front is -Y, the camera
of the reference looks from the front-left (az -38): the slab roof slope on the left, the gable and its dragon heads on the right, the colonnade across the
front with the arch in front of its middle and the (flattened) stairs leading up into the arch. Groups are collection instances of G_<group> (the group
builders must have run first, see grun.sh temple_ruin). Round 2: lower podium with ragged perimeter and collapsed gaps, irregular flagstones, arch pulled
into the colonnade line, stairs centred, big flanking boulders, rubble against the podium edge.
Round t10 (judge t09, assembly only): three big boulders (2.4-3.1 m tall) pushed 1-1.4 m into the podium edges and joined to it by heaps of big
blocks; spilled blocks are 0.5-1 m wall blocks and ashlar in tilted, half-sunk clusters; flagstones vary 0.6-1.4 m, turn +-6 deg, 17% missing,
some edges lifted; three more breaks in the podium edge; stairs at full height (three chunky steps)."""
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
GAPS = (("L", -2.5, -1.0, True), ("L", 0.5, 1.8, False), ("B", -1.0, 0.6, True), ("B", 3.0, 4.4, False), ("R", -0.5, 0.8, False), ("F", -3.4, -2.2, False),
        ("F", 2.4, 3.6, True), ("R", 1.6, 2.8, True), ("B", -3.6, -2.6, True))  # t10: last three added


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
    ts = ("roof_slab_a", "roof_slab_b", "roof_slab_c")  # 0.89 x 0.45 x 0.12; turned 90 deg: part x runs along world y
    x, ix = X0 + 0.3, 0
    while x < X1 - 0.6:  # t10: columns 0.6-1.4 m wide, slabs 0.6-1.4 m deep, turned +-6 deg, 17% missing, some edges lifted 3-6 cm
        w = rnd.uniform(0.6, 1.4)
        y, iy = Y0 + 0.3 + rnd.uniform(0.0, 0.4), 0
        while y < Y1 - 0.6:
            d = rnd.uniform(0.6, 1.4)
            if rnd.random() > 0.17:
                lift = rx(rnd.uniform(2.0, 3.5) * rnd.choice((-1, 1))) if rnd.random() < 0.3 else rz(0)
                rot = rz(90 + rnd.uniform(-6, 6)) @ lift
                place(G, ts[(ix + iy) % 3], (x + w / 2, y + d / 2, TOP - 0.18), rot, (0.96 * d / 0.89, 0.96 * w / 0.45, 1.5))
            y += d + 0.02
            iy += 1
        x += w + 0.02
        ix += 1
    # t09: an even grid of ~1.1 m slabs (scale 1.3 x 2.4, 4% missing)


def build():
    gcol(G)
    rnd = random.Random(51)
    _podium(rnd)
    z = TOP
    inst(G, "walls", (0.0, 0.0, z))
    inst(G, "roof_ruin", (0.0, 0.0, z + 2.7))
    inst(G, "colonnade", (0.0, -3.0, z))
    inst(G, "arch", (ARCH[0], ARCH[1], z), None, (1.15, 1.15, 1.15))
    inst(G, "stairs", (0.0, Y0 - 0.68, 0.0), None, (1.1, 0.9, 1.0))  # t10: three steps, riser 0.27, tread 0.4, top level with the podium (t09: y -0.78, scale z 0.7)
    # big boulders flank the building, rubble heaped against the podium and at the stair feet
    # t10: three big boulders pushed 1-1.4 m into the podium edges (boulder parts are ~1.3 m across, 1.0-1.1 m tall), two smaller ones
    # t09: (-6.2,-3.0) 2.2, (6.4,-0.8) 2.0, (-5.6,3.4) 1.5, (6.0,3.4) 1.2, (3.6,-7.0) 1.1, all 1-2 m clear of the podium
    for src, x, y, yaw, s in (("boulder_a", X0 - 0.6, -3.0, 40, 3.0), ("boulder_c", X1 + 0.3, -0.8, 200, 2.8), ("boulder_b", X0 - 0.5, 3.0, 130, 2.4),
                              ("boulder_a", X1 + 0.7, 3.2, 300, 1.5), ("boulder_b", 3.3, Y0 - 1.0, 20, 1.3)):
        place(G, src, (x, y, 0.0), rz(yaw), (s, s, s))
    blocks = (("wall_block_a", 1.0), ("wall_block_b", 1.2), ("wall_block_c", 1.0), ("ashlar_a", 1.8), ("ashlar_b", 2.0))

    def heap(cx, cy, n, spread, z0=0.0):
        """A cluster of n big fallen blocks (0.5-1 m), tilted 15-35 deg and sunk 10-20 cm."""
        for _ in range(n):
            src, k = rnd.choice(blocks)
            s = k * rnd.uniform(0.9, 1.3)
            rot = rz(rnd.uniform(0, 360)) @ rx(rnd.uniform(15, 35) * rnd.choice((-1, 1)))
            place(G, src, (cx + rnd.uniform(-spread, spread), cy + rnd.uniform(-spread, spread), z0 - rnd.uniform(0.1, 0.2)), rot, (s, s, s))

    heap(X0 - 0.4, -1.4, 7, 0.7)  # between the front-left boulder and the podium
    heap(X0 - 0.3, 1.6, 6, 0.6)  # under the back-left boulder
    heap(X1 + 0.4, 0.9, 7, 0.6)  # beside the right boulder
    heap(-2.6, Y0 - 0.6, 6, 0.6)  # front left, where the facing collapsed
    heap(2.9, Y0 - 0.5, 5, 0.5)  # front right gap
    heap(-2.9, -4.2, 5, 0.5, TOP)  # on the bare front-left podium area
    for k, x in enumerate((-2.0, 2.0)):  # stair sides
        heap(x, Y0 - 0.9, 4, 0.3)
    for k in range(10):  # a few small stones between the heaps
        t = rnd.random()
        side = k % 4
        d = rnd.uniform(0.3, 1.0)
        x, y = ((X0 - d, Y0 + t * (Y1 - Y0)), (X1 + d, Y0 + t * (Y1 - Y0)), (X0 + t * (X1 - X0), Y1 + d), (X0 + t * (X1 - X0), Y0 - d))[side]
        place(G, ("rubble_a", "rubble_b", "rubble_c", "rubble_d")[k % 4], (x, y, 0.0), rz(rnd.uniform(0, 360)), (2.6, 2.6, 2.6))
