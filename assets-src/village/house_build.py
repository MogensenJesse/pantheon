# assets-src/village/house_build.py — builds village houses (Nordic timber halls) in Blender.
# Run inside Blender (see public/models/village-kit/README.md). Blender axes: +Z up, the door faces -Y
# (glTF +Z after export). Metres. Origin = footprint centre, z 0 = the floor the levelled pad gives.
# Needs `tb` in its namespace: the namespace of temple_build.py, exec'd first (it holds the Builder and the shared
# region table). Detail 0 full (individual boards, courses and tufts of turf and thatch), 1 mid (panels and slabs),
# 2 far (silhouette).
import math

import bmesh
import bpy
from mathutils import Vector

# Surface types are the ones of temple_build.py (`tb['REGIONS']`): one strip each in the shared village atlas.
REGIONS = tb['REGIONS']
UP = Vector((0, 0, 1))
WARM = 10.0  # glow-face tone offset (all house glow is warm)
WARM_COLOR = (1.0, 0.5, 0.12, 1.0)

# Per-type plans (m). The footprint is the hall plus its porch; hall walls stand on the footprint outline.
# windows: (centre along the wall in world x or y, width). door_x: world x of the door on the front (-y) side.
# roof: 'turf' | 'thatch'. tips: what the crossed rake boards end in ('x' plain curved, 'horn', 'dragon', 'flare').
# walls: 'h' horizontal boards, 'v' vertical boards (the gable triangles are always vertical).
SPECS = {
    # Hall: turf roof, carved dragon heads on the rake boards, vertical dark planks, a turf skirt on posts along the
    # front right of the hall, a closed porch with its own cross-gable.
    'house_c': dict(
        hx=3.5, y_front=-1.8, y_back=3.0, eave=2.7,
        porch=dict(kind='closed', x0=-2.9, x1=-0.1, y=-3.0, eave=2.35, s1=2.6),
        door_x=-1.5, door_open=70.0,
        windows=dict(front=[(2.3, 0.8)], right=[(0.6, 0.8)], back=[(1.5, 0.7), (-1.5, 0.7)]),
        bay=True, dormer=None, chimney=(2.4, 1.6, 3.6, 2.55, 0.7), roof='turf', tips='dragon', walls='v',
        skirt=dict(x0=0.15, x1=3.5, depth=1.15, z=2.05, drop=0.5),
        posts=dict(front=[0.0, 0.6, 3.4, 7.0], right=[0.0, 4.8], back=[0.0, 3.5, 7.0], left=[0.0, 4.8]),
        seeds=(21, 5)),
    # Small cottage: turf roof, plain crossed rake boards, closed plank door with two steps, one window beside it.
    'house_a': dict(
        hx=2.5, y_front=-2.0, y_back=2.0, eave=2.4, porch=None,
        door_x=-1.0, door_open=0.0,
        windows=dict(front=[(1.0, 0.8)], right=[(0.0, 0.8)], back=[(-0.8, 0.8), (1.0, 0.8)]),
        bay=False, dormer=None, chimney=(0.9, 0.7, 3.2, 2.1, 0.6), roof='turf', tips='x', walls='h', seeds=(31, 7)),
    # Medium house: thatch roof with bull horns on the rake boards, open porch on two thick pillars, big stone chimney.
    'house_b': dict(
        hx=3.0, y_front=-1.5, y_back=2.5, eave=2.55,
        porch=dict(kind='open', x0=-1.3, x1=1.3, y=-2.5, eave=2.3),
        door_x=0.0, door_open=0.0,
        windows=dict(front=[(-2.0, 0.9), (2.0, 0.9)], right=[(0.5, 0.9)], back=[(-1.3, 0.9), (1.3, 0.9)]),
        bay=False, dormer=None, chimney=(1.8, 1.4, 3.3, 2.3, 0.85), roof='thatch', tips='horn', walls='h', seeds=(41, 9)),
}
SPEC = SPECS['house_c']
HX = Y_FRONT = Y_BACK = YC = HALF = EAVE = PORCH = PX0 = PX1 = PXC = Y_PORCH = PORCH_EAVE = None


def configure(name):
    """Point the plan constants at one house type."""
    global SPEC, HX, Y_FRONT, Y_BACK, YC, HALF, EAVE, PORCH, PX0, PX1, PXC, Y_PORCH, PORCH_EAVE
    SPEC = SPECS[name]
    HX, Y_FRONT, Y_BACK, EAVE = SPEC['hx'], SPEC['y_front'], SPEC['y_back'], SPEC['eave']
    YC = (Y_FRONT + Y_BACK) / 2
    HALF = (Y_BACK - Y_FRONT) / 2
    PORCH = SPEC['porch']
    if PORCH:
        PX0, PX1, Y_PORCH, PORCH_EAVE = PORCH['x0'], PORCH['x1'], PORCH['y'], PORCH['eave']
        PXC = (PX0 + PX1) / 2
    else:
        PX0 = PX1 = PXC = Y_PORCH = PORCH_EAVE = None


LONG_WALL_CUT = 0.12  # the long walls end this far under the eave height: the roof surface falls away outside them
FLOOR = 0.36  # top of the stone plinth: walls and door sills start here
PITCH = 1.1
OV_SIDE, OV_END = 0.5, 0.45
ROW = 0.2  # board height
ROOF_T = 0.12
TILE_ROW, TILE_LEN = 0.22, 0.34

DETAIL = 0
BUILDERS = {}  # kind -> build(detail, stage) -> (body, glow, ridge); set by village_extra_build.py
KIND_META = {}  # kind -> function returning the glTF extras
KIND_STAGES = {'well': (2,)}
configure('house_c')


class HB(tb['Builder']):
    """Builder plus the roof surface functions of the house (see gable_roof)."""

    def __init__(self, seed=1):
        super().__init__(seed)
        self.organic = DETAIL == 0  # timbers bow, boards sit uneven, stones are rough, roofs sag: the full detail only
        self.roofs = []  # height of each sagging roof's top at a point (x, y), None off the roof: see gable_roof, chimney


def wall_run(b, a, c, z0, z1, openings=(), posts=(), depth=0.1, recess=0.05, frame=True, board_top=None, vertical=False):
    """Timber-framed plank wall on the line a -> c (outward normal = right-hand side of a -> c seen from above).
    `openings` are (u0, u1, zb, zt) along the run; `posts` are u positions of full-height posts.
    `vertical` lays upright boards of varying width instead of horizontal courses (full detail only)."""
    A, C = Vector((a[0], a[1], 0)), Vector((c[0], c[1], 0))
    d = C - A
    L = d.length
    d.normalize()
    n = Vector((d.y, -d.x, 0))
    base = A - n * (recess + depth / 2)

    def P(u, z):
        return base + d * u + Vector((0, 0, z))

    zb_top = z1 if board_top is None else board_top
    if DETAIL == 0 and vertical:
        u = 0.0
        while u < L - 1e-3:
            bw = min(L - u, 0.17 + b.rng.random() * 0.1)
            if L - u - bw < 0.12:
                bw = L - u
            ua, ub = u + 0.006, u + bw - 0.006
            spans, zc = [], z0
            for o in sorted((o for o in openings if o[0] < ub and o[1] > ua), key=lambda o: o[2]):
                if o[2] > zc:
                    spans.append((zc, o[2]))
                zc = max(zc, o[3])
            if zc < zb_top:
                spans.append((zc, zb_top))
            for za, zb in spans:
                if zb - za > 0.02:
                    ro = (b.rng.random() - 0.5) * 0.02 if b.organic else 0.0  # a board sits a little proud or deep, and leans
                    lean = d * ((b.rng.random() - 0.5) * 0.012 if b.organic else 0.0)
                    b.beam(P((ua + ub) / 2, za) - n * ro, P((ua + ub) / 2, zb) - n * ro + lean, ub - ua,
                           depth * (b.jitter(0.12) if b.organic else 1.0), 'plank', up=n)
            u += bw
    elif DETAIL == 0:
        z = z0
        while z < zb_top - 1e-3:
            h = min(ROW, zb_top - z)
            blocked = sorted((o[0], o[1]) for o in openings if o[2] < z + h and o[3] > z)
            free, u = [], 0.0
            for u0, u1 in blocked:
                if u0 > u:
                    free.append((u, u0))
                u = max(u, u1)
            if u < L:
                free.append((u, L))
            for fa, fb in free:
                s = fa
                while s < fb - 1e-3:
                    e = min(fb, s + 1.5 + b.rng.random() * 1.1)
                    if fb - e < 0.5:
                        e = fb
                    zc = z + (h - 0.012) / 2
                    ro = (b.rng.random() - 0.5) * 0.02 if b.organic else 0.0
                    dz = (b.rng.random() - 0.5) * 0.012 if b.organic else 0.0
                    b.beam(P(s + 0.012, zc) - n * ro, P(e - 0.012, zc + dz) - n * ro,
                           depth * (b.jitter(0.12) if b.organic else 1.0), h - 0.012, 'plank')
                    s = e
            z += ROW
    elif DETAIL == 1 and zb_top > z0:
        cuts = sorted({0.0, L, *(x for o in openings for x in (o[0], o[1]))})
        for ua, ub in zip(cuts, cuts[1:]):
            if ub - ua < 1e-3:
                continue
            hole = next((o for o in openings if o[0] <= ua + 1e-6 and o[1] >= ub - 1e-6), None)
            spans = [(z0, z1)] if not hole else [s for s in ((z0, hole[2]), (hole[3], z1)) if s[1] - s[0] > 0.01]
            for za, zb in spans:
                zb = min(zb, zb_top)
                if zb - za > 0.01:
                    b.beam(P(ua, (za + zb) / 2), P(ub, (za + zb) / 2), depth, zb - za, 'wall')
    elif DETAIL == 2:
        b.beam(P(0, (z0 + z1) / 2), P(L, (z0 + z1) / 2), depth + recess, z1 - z0, 'wall')
        return d, n, L
    if frame:
        pw = 0.2
        for u in posts:
            b.beam(P(u, z0) - n * (pw / 2 - recess - depth / 2), P(u, z1 - 0.08), pw, pw, 'beam')  # corner posts must not poke out of the roof
        o = base + n * (recess + depth / 2 - 0.11)
        b.beam(o + Vector((0, 0, z1 - 0.1)), o + d * L + Vector((0, 0, z1 - 0.1)), 0.22, 0.2, 'beam')
        b.beam(o + Vector((0, 0, z0 + 0.1)), o + d * L + Vector((0, 0, z0 + 0.1)), 0.22, 0.2, 'beam')
        for u0, u1, zb, zt in openings:
            for u in (u0, u1):
                b.beam(o + d * u + Vector((0, 0, zb)), o + d * u + Vector((0, 0, zt + 0.08)), 0.16, 0.16, 'beam')
            b.beam(o + d * (u0 - 0.08) + Vector((0, 0, zt + 0.08)), o + d * (u1 + 0.08) + Vector((0, 0, zt + 0.08)), 0.2, 0.16, 'beam')
            if zb > z0 + 0.05:
                b.beam(o + d * (u0 - 0.06) + Vector((0, 0, zb - 0.05)), o + d * (u1 + 0.06) + Vector((0, 0, zb - 0.05)), 0.24, 0.1, 'trim')
    return d, n, L


def opening_fill(b, g, a, c, u0, u1, zb, zt, depth, glow=True, recess=0.05):
    """Dark alcove behind a wall opening (the ground would otherwise show through) and its warm glow quad."""
    A, C = Vector((a[0], a[1], 0)), Vector((c[0], c[1], 0))
    d = (C - A).normalized()
    n = Vector((d.y, -d.x, 0))
    base = A - n * recess

    def P(u, z, k):
        return base + d * u + Vector((0, 0, z)) - n * k

    if DETAIL < 2:
        _alcove(b, P, u0, u1, zb, zt, depth, n, d)
    if glow:
        inset = 0.06
        g.quad([P(u0 + inset, zb + 0.02, -0.02), P(u1 - inset, zb + 0.02, -0.02), P(u1 - inset, zt - inset, -0.02), P(u0 + inset, zt - inset, -0.02)],
               'trim', n, WARM + 1.0)


def _alcove(b, P, u0, u1, zb, zt, depth, n, d):
    z = lambda v: Vector((0, 0, v))  # noqa: E731
    back = [P(u0, zb, depth), P(u1, zb, depth), P(u1, zt, depth), P(u0, zt, depth)]
    b.quad(back, 'beam', n, 0.7)
    for p0, p1, want in (
        ((u0, zb), (u0, zt), d), ((u1, zb), (u1, zt), -d),
    ):
        b.quad([P(p0[0], p0[1], 0), P(p0[0], p0[1], depth), P(p1[0], p1[1], depth), P(p1[0], p1[1], 0)], 'beam', want, 0.8)
    b.quad([P(u0, zt, 0), P(u1, zt, 0), P(u1, zt, depth), P(u0, zt, depth)], 'beam', -z(1), 0.8)
    b.quad([P(u0, zb, 0), P(u1, zb, 0), P(u1, zb, depth), P(u0, zb, depth)], 'wall', z(1), 0.9)


def window(b, g, a, c, u0, u1, zb, zt):
    opening_fill(b, g, a, c, u0, u1, zb, zt, 0.14)
    if DETAIL > 0:
        return
    A, C = Vector((a[0], a[1], 0)), Vector((c[0], c[1], 0))
    d = (C - A).normalized()
    n = Vector((d.y, -d.x, 0))
    o = A - n * 0.1
    um, zm = (u0 + u1) / 2, (zb + zt) / 2
    b.beam(o + d * um + Vector((0, 0, zb)), o + d * um + Vector((0, 0, zt)), 0.05, 0.05, 'beam')
    b.beam(o + d * u0 + Vector((0, 0, zm)), o + d * u1 + Vector((0, 0, zm)), 0.05, 0.05, 'beam')


def gable_fill(b, centre, along, n, hw, z_eave, rise, depth=0.1, recess=0.05, frame=True, boards=True, vertical=False, dz=None):
    """The wall triangle under a gable: boards narrowing to the apex, tie beam, king post and struts. `dz(x)` = how far the sagging
    roof lies under its flat plane at lateral offset x (see gable_edge), the boards stay under it."""
    cen = Vector((centre[0], centre[1], 0)) - n * (recess + depth / 2)
    al = Vector(along)

    def roof_z(x):  # height of the roof over the foot of the wall at lateral offset x
        return rise * (1 - abs(x) / hw) + (dz(x) if dz else 0.0)

    def reach(side, zt):  # how far out the roof still clears height zt
        lo, hi = 0.0, hw
        for _ in range(12):
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if roof_z(side * mid) >= zt else (lo, mid)
        return lo

    if not boards:
        pass
    elif DETAIL == 0 and vertical:
        x = -hw + 0.1
        while x < hw - 0.05:
            top = roof_z(math.copysign(abs(x) + 0.1, x)) - 0.05  # measured at the board's outer edge, so it stays under the roof
            if top > 0.1:
                ro = (b.rng.random() - 0.5) * 0.02 if b.organic else 0.0
                b.beam(cen + al * x + Vector((0, 0, z_eave)) - n * ro, cen + al * x + Vector((0, 0, z_eave + top)) - n * ro, 0.19,
                       depth * (b.jitter(0.12) if b.organic else 1.0), 'plank', up=n)
            x += 0.2
    elif DETAIL == 0:
        z = 0.0
        while z < rise - 0.05:
            h = min(ROW, rise - z)
            wl, wr = reach(-1, z + h + 0.03), reach(1, z + h + 0.03)
            if wl + wr > 0.16:
                zc = z_eave + z + (h - 0.012) / 2
                ro = (b.rng.random() - 0.5) * 0.02 if b.organic else 0.0
                b.beam(cen - al * wl + Vector((0, 0, zc)) - n * ro, cen + al * wr + Vector((0, 0, zc)) - n * ro,
                       depth * (b.jitter(0.12) if b.organic else 1.0), h - 0.012, 'plank')
            z += ROW
    else:  # slightly smaller than the gable, so its slanted top stays inside the thick roof slab
        t_hw, t_rise = hw * 0.97, rise * 0.94
        b.tri_prism(cen - al * t_hw + Vector((0, 0, z_eave)), cen + al * t_hw + Vector((0, 0, z_eave)),
                    cen + Vector((0, 0, z_eave + t_rise)), (-n) * (depth if DETAIL == 1 else depth + recess), 'wall')
    if DETAIL == 0 and frame:
        o = cen + n * (depth / 2 + 0.03)
        tie = z_eave + 0.7
        w_tie = min(reach(-1, 0.7 + 0.12 * PITCH + 0.08), reach(1, 0.7 + 0.12 * PITCH + 0.08))  # the roof planes close in as the tie rises
        b.beam(o - al * w_tie + Vector((0, 0, tie)), o + al * w_tie + Vector((0, 0, tie)), 0.14, 0.16, 'beam')
        b.beam(o + Vector((0, 0, tie)), o + Vector((0, 0, z_eave + rise - 0.2)), 0.14, 0.14, 'beam')
        for sd in (-1, 1):
            b.beam(o + al * sd * w_tie * 0.8 + Vector((0, 0, tie)), o + al * sd * 0.07 + Vector((0, 0, z_eave + rise * 0.7)), 0.1, 0.12, 'beam')


# ---------------------------------------------------------------- roofs: turf and thatch blankets
# kind: (top region, band length m (at most the strip's metres per height), slab thickness m, course step m, edge region)
ROOFS = {
    'turf': dict(top='turf', band=2.0, thick=0.28, step=0.0, edge='soil', vm=2.0, rows=0.35, cols=0.6, lump=0.035,
                 dents=1 / 8, dent=(0.05, 0.1), wave=0.025),
    'thatch': dict(top='thatch', band=0.6, thick=0.22, step=0.07, edge='thatch', vm=0.625, rows=0.6, cols=0.8, lump=0.022,
                   dents=1 / 12, dent=(0.04, 0.07), wave=0.02),
}
_AUTO = object()  # roof_plane: make the plane's own shape


def blade(b, centre, direction, width, length, region, tone=None):
    """Open four-sided pyramid (a moss tuft or a straw end); its base hides inside what it grows from."""
    if region == 'turf':  # low, compact moss tufts at the eave and ridge
        width *= 1.25
        length *= 0.25
    d = Vector(direction).normalized()
    a = d.cross(UP if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized() * (width / 2)
    c = d.cross(a).normalized() * (width / 2)
    ctr = Vector(centre)
    base = [ctr - a - c, ctr + a - c, ctr + a + c, ctr - a + c]
    tip = ctr + d * length
    tone = b.jitter(0.12) if tone is None else tone
    for i in range(4):
        f = b.face([base[i], base[(i + 1) % 4], tip], region, tone)
        f[b.fixed] = 1


def roof_plane(b, r0, r1, e1, e0, kind, shape=_AUTO):
    """One roof plane (ridge start, ridge end, eave end, eave start) as a thick blanket of turf or thatch (see
    banded_slab in temple_build.py). Thatch steps up a little at the foot of every course; the full detail adds straw
    ends or compact moss growing over the eave. In the full detail the surface follows a RoofShape (sagging slope, lumps,
    dents, uneven eave): `shape` None = flat, default = a shape of its own."""
    cfg = ROOFS[kind]
    top, thick, edge = cfg['top'], cfg['thick'], cfg['edge']
    step = cfg['step'] if DETAIL == 0 else 0.0
    r0, r1, e1, e0 = (Vector(p) for p in (r0, r1, e1, e0))
    if shape is _AUTO:
        shape = None
        if b.organic:
            slope, width = ((e0 - r0).length + (e1 - r1).length) / 2, max((r1 - r0).length, (e1 - e0).length)
            shape = tb['roof_shape'](b.rng, slope, width, 0.0, cfg['lump'], round(slope * width * cfg['dents']), cfg['dent'], cfg['wave'])
    if shape is not None:
        n = tb['banded_slab'](b, r0, r1, e1, e0, top, edge, cfg['band'], thick, step, shape=shape, vm=cfg['vm'],
                              row_len=cfg['rows'], col_len=cfg['cols'])
    else:
        cols = max(1, round((r1 - r0).length / 0.9)) if kind == 'turf' and DETAIL == 0 else 1
        n = tb['banded_slab'](b, r0, r1, e1, e0, top, edge, cfg['band'], thick, step, cols, 0.08 if kind == 'turf' else 0.0)
    if DETAIL > 0:
        return n
    sl = (e0 - r0).normalized()
    eave_len = (e1 - e0).length

    def lip(t):  # the eave edge height at t along it
        return shape.h(min(1.0, max(0.0, t)), 1.0) if shape else 0.0

    if kind == 'thatch':  # straw ends hanging off the eave, two rows
        m = max(2, round(eave_len / 0.15))
        for off in (step * 0.55, -thick * 0.5):
            for i in range(m):
                t = (i + 0.5 + (b.rng.random() - 0.5) * 0.4) / m
                p = e0.lerp(e1, t) + n * (off + lip(t))
                blade(b, p, sl - n * 0.25, 0.15, 0.08 + b.rng.random() * 0.14, 'thatch')
    else:  # compact moss fringe over the soil edge
        m = max(2, round(eave_len / 0.1))
        for i in range(m):
            t = (i + 0.5 + (b.rng.random() - 0.5) * 0.6) / m
            p = e0.lerp(e1, t) + n * (0.02 + lip(t))
            blade(b, p, sl + n * 0.35 + (e1 - e0).normalized() * (b.rng.random() - 0.5) * 0.4, 0.07, 0.12 + b.rng.random() * 0.12, 'turf')
    return n


def ridge_roll(b, p0, p1, kind, dip=0.0, sink=0.0):
    """Rounded cap over the ridge crease: a prism from p0 to p1 (on the ridge line, dipping by `dip` at mid-length) that sinks
    into both slopes (`sink` m deeper at its lower edges, for slopes that start steeper than flat)."""
    cfg = ROOFS[kind]
    hw, h = (0.28, 0.12) if kind == 'turf' else (0.3, 0.24)
    p0, p1 = Vector(p0), Vector(p1)
    side = (p1 - p0).cross(UP).normalized()
    half = [(hw, -hw * PITCH - 0.03 - sink), (hw * 0.8, h * 0.5 - hw * 0.8 * PITCH * 0.5 - sink * 0.5), (hw * 0.4, h * 0.88)]
    prof = [(-x, z) for x, z in half] + [(0.0, h)] + list(reversed(half))
    seg = max(1, round((p1 - p0).length / 0.7)) if dip else 1
    rings = [[p0.lerp(p1, i / seg) + UP * (-dip * math.sin(math.pi * i / seg)) + side * x + UP * z for x, z in prof] for i in range(seg + 1)]
    for i in range(seg):
        for k in range(len(prof) - 1):
            b.face([rings[i][k], rings[i + 1][k], rings[i + 1][k + 1], rings[i][k + 1]], cfg['top'])
        b.face([rings[i][-1], rings[i + 1][-1], rings[i + 1][0], rings[i][0]], cfg['edge'])
    b.face(list(reversed(rings[0])), cfg['edge'])
    b.face(rings[-1], cfg['edge'])


def tufts(b, p0, p1, z, every=0.2, dip=0.0):
    """Compact moss tufts along a ridge line from p0 to p1 (top of the roll at height z, dipping by `dip` at mid-length)."""
    p0, p1 = Vector(p0), Vector(p1)
    n = max(1, round((p1 - p0).length / every))
    for i in range(n):
        t = (i + 0.5) / n
        c = p0.lerp(p1, t)
        c.z = z - 0.03 - dip * math.sin(math.pi * t)
        for _ in range(3):
            lean = Vector(((b.rng.random() - 0.5) * 0.7, (b.rng.random() - 0.5) * 0.7, 1.0))
            blade(b, c + Vector(((b.rng.random() - 0.5) * 0.1, (b.rng.random() - 0.5) * 0.1, 0)), lean, 0.05, 0.14 + b.rng.random() * 0.2, 'turf')


# ---------------------------------------------------------------- rake boards and what they end in
# Heads in board units (half a board width = 0.15 m): (t along the board, m across it, positive = up side).
HEAD_DRAGON = [(0.22, 0.19), (0.4, 0.28), (0.52, 0.55), (0.66, 0.30), (0.95, 0.24), (1.15, 0.27), (1.38, 0.18), (1.5, 0.06),
               (1.44, -0.02), (1.05, -0.03), (1.4, -0.2), (1.36, -0.3), (1.0, -0.28), (0.7, -0.2), (0.45, -0.26), (0.2, -0.2)]
HEAD_FLARE = [(0.18, 0.15), (0.26, 0.34), (0.46, 0.42), (0.64, 0.3), (0.52, 0.12), (0.42, 0.0), (0.52, -0.12), (0.64, -0.3),
              (0.46, -0.42), (0.26, -0.34), (0.18, -0.15)]


def _up_normal(d):
    """Unit normal of a 2D direction (s, z) that points up."""
    nx, nz = -d[1], d[0]
    return (nx, nz) if nz >= 0 else (-nx, -nz)


def _ribbon(pts, widths):
    """Outline of a board along a 2D polyline: the points on its upper side and on its lower side."""
    up, dn = [], []
    for i, (p, w) in enumerate(zip(pts, widths)):
        a, c = pts[max(i - 1, 0)], pts[min(i + 1, len(pts) - 1)]
        l = math.hypot(c[0] - a[0], c[1] - a[1])
        nx, nz = _up_normal(((c[0] - a[0]) / l, (c[1] - a[1]) / l))
        up.append((p[0] + nx * w / 2, p[1] + nz * w / 2))
        dn.append((p[0] - nx * w / 2, p[1] - nz * w / 2))
    return up, dn


def tube(b, pts, radii, region, sides=6):
    """Tapered tube through the 3D points (one radius per point), capped at both ends."""
    pts = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = d.cross(UP if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
        c = d.cross(a)
        rings.append([p + (a * math.cos(math.tau * k / sides) + c * math.sin(math.tau * k / sides)) * radii[i] for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            j = (k + 1) % sides
            b.face([rings[i][k], rings[i + 1][k], rings[i + 1][j], rings[i][j]], region)
    b.face(list(reversed(rings[0])), region)
    b.face(rings[-1], region)


def rake_pair(b, origin, pp, out, half, ov, low, ridge, kind, w0=0.3, thick0=0.11, ext=0.6, shapes=None):
    """The two rake boards of one gable, crossing at the apex and ending in `kind`: 'x' (plain, tips curling up), 'horn',
    'dragon' (the board whose tip is on the front side a carved head, the other plain), 'flare' (plain timber bargeboards with flared ends) or None.
    Each board is one outline in the gable plane (s along `pp`, z up) extruded `thick` along `out`.
    `origin` is the ridge point of the gable plane at z = 0. `shapes` = {side: RoofShape}: the boards follow the swoop of
    their roof edge (steepest near the apex, flicking up over the overhang)."""
    origin, pp, out = Vector(origin), Vector(pp), Vector(out)
    org = b.organic
    for sd in (-1, 1):
        k = 'x' if kind == 'dragon' and sd < 0 else kind
        w, thick = (w0 * b.jitter(0.06), thick0 * b.jitter(0.1)) if org else (w0, thick0)  # each board a little different
        E, A = (sd * (half + ov), low), (0.0, ridge)
        d = (A[0] - E[0], A[1] - E[1])
        ln = math.hypot(*d)
        d = (d[0] / ln, d[1] / ln)
        nx, nz = _up_normal(d)
        E, A = (E[0] - nx * 0.06, E[1] - nz * 0.06), (A[0] - nx * 0.06, A[1] - nz * 0.06)  # sunk to cover the slab edge
        main = [E, A]
        shp = (shapes or {}).get(sd)
        if shp:  # follow the roof edge: u 0 at the eave, 1 at the apex
            seg = max(3, min(8, round(ln / 0.6)))
            main = [(E[0] + (A[0] - E[0]) * u + nx * shp.swoop(1 - u), E[1] + (A[1] - E[1]) * u + nz * shp.swoop(1 - u))
                    for u in [i / seg for i in range(seg + 1)]]
            dx, dz = main[-1][0] - main[-2][0], main[-1][1] - main[-2][1]
            ln = math.hypot(dx, dz)
            d = (dx / ln, dz / ln)
        reach = ext if k in ('x', 'horn', 'dragon', 'flare') else 0.3
        pts, widths = main + [(A[0] + d[0] * reach, A[1] + d[1] * reach)], [w] * (len(main) + 1)
        dend = d
        if k == 'x':
            ang = math.atan2(d[1], d[0])
            for i in range(1, 6):
                ang += (math.pi / 2 - ang) * 0.3
                p = pts[-1]
                pts.append((p[0] + math.cos(ang) * w / 3, p[1] + math.sin(ang) * w / 3))
                widths.append(w * (1 - 0.08 * i))
            dend = (math.cos(ang), math.sin(ang))
        head_sc = w / 0.3
        if k == 'dragon':  # the neck swings out toward the horizontal, tapering into the head
            ang = math.atan2(d[1], d[0])
            goal = ang + ((math.pi if d[0] < 0 else 0.0) - ang) * 0.75
            head_sc = 0.95 * w / 0.3
            for i in range(1, 5):
                a_i = ang + (goal - ang) * i / 4
                p = pts[-1]
                pts.append((p[0] + math.cos(a_i) * 0.12, p[1] + math.sin(a_i) * 0.12))
                widths.append(w * (1 - (1 - 0.95) * i / 4))
            dend = (math.cos(goal), math.sin(goal))
        up, dn = _ribbon(pts, widths)
        end, nrm = pts[-1], _up_normal(dend)
        k_head = {'dragon': HEAD_DRAGON, 'flare': HEAD_FLARE}.get(k)
        if k_head:
            sc = head_sc
            mid = [(end[0] + dend[0] * t * sc + nrm[0] * m * sc, end[1] + dend[1] * t * sc + nrm[1] * m * sc) for t, m in k_head]
        else:
            we = widths[-1]
            mid = [(end[0] + dend[0] * we * 0.5 + nrm[0] * we * 0.2, end[1] + dend[1] * we * 0.5 + nrm[1] * we * 0.2),
                   (end[0] + dend[0] * we * 0.5 - nrm[0] * we * 0.2, end[1] + dend[1] * we * 0.5 - nrm[1] * we * 0.2)]
        outline = up + mid + dn[::-1]
        b.extrude_profile(outline, origin + out * (0.03 * sd), pp, out, thick, 'beam')
        if k == 'horn':
            ang = math.atan2(d[1], d[0]) + (math.pi / 2 - math.atan2(d[1], d[0])) * 0.25
            turn = -1 if d[0] < 0 else 1
            path, radii, p = [], [], (end[0] - d[0] * 0.06, end[1] - d[1] * 0.06)  # starts just inside the board end
            for i in range(9):
                path.append(origin + pp * p[0] + UP * p[1] + out * (0.03 * sd))
                radii.append(0.15 * (1 - i / 8) + 0.015)
                ang += turn * math.radians(4 + 1.6 * i)
                p = (p[0] + math.cos(ang) * 0.12, p[1] + math.sin(ang) * 0.12)
            tube(b, path, radii, 'horn')


def gable_roof(b, centre, along, half, eave, s0, s1, ridge_beam=True, rakes=(True, True), ov_end=(OV_END, OV_END),
               ov=OV_SIDE, fill=(None, None), z_fill=None, rake_w=0.3, rake_ext=0.6, fill_boards=True, tips='x',
               roof='turf', vertical_fill=True):
    """Gable roof over a ridge line from s0 to s1 (m along `along` from `centre`): a blanket of `roof` ('turf' or 'thatch')
    on each side, a ridge roll, and at each kept end crossed rake boards ending in `tips` (see rake_pair).
    `fill` = (s position, sign) per end gets a gable wall. Returns the ridge height."""
    al = Vector((along[0], along[1], 0)).normalized()
    pp = Vector((-al.y, al.x, 0))
    c = Vector((centre[0], centre[1], 0))

    def P(s, v, z):
        return c + al * s + pp * v + Vector((0, 0, z))

    ridge, low = eave + half * PITCH, eave - ov * PITCH
    a, e = s0 - ov_end[0] if rakes[0] else s0, s1 + ov_end[1] if rakes[1] else s1
    shapes, dip, cfg = {}, 0.0, ROOFS[roof]
    if b.organic:  # the two slopes sag on their own, the ridge dips for both
        slope, width = math.hypot(half + ov, ridge - low), e - a
        dip = tb['ridge_dip'](width)
        f_wall = 1 - ov * math.hypot(1, PITCH) / slope
        shapes = {side: tb['roof_shape'](b.rng, slope, width, dip, cfg['lump'], round(slope * width * cfg['dents']), cfg['dent'],
                                         cfg['wave'], f_wall) for side in (-1, 1)}
    for side in (-1, 1):
        roof_plane(b, P(a, 0, ridge), P(e, 0, ridge), P(e, side * (half + ov), low), P(a, side * (half + ov), low), roof,
                   shapes.get(side))
    if shapes:
        def top_z(x, y):
            v = Vector((x, y, 0)) - c
            s_, lat = (v.dot(al) - a) / (e - a), v.dot(pp)
            f = abs(lat) / (half + ov)
            if not (0 <= s_ <= 1 and f <= 1):
                return None
            sh = shapes[1 if lat >= 0 else -1]
            return ridge - PITCH * abs(lat) + sh.h(s_, f) * math.hypot(1, PITCH) + sh.sink(s_, f)
        b.roofs.append(top_z)
    sink = max((sh.steepening() for sh in shapes.values()), default=0.0) * 0.45 + 0.02  # the slopes start steeper than flat
    ridge_roll(b, P(a, 0, ridge), P(e, 0, ridge), roof, dip, sink)
    if DETAIL == 0 and roof == 'turf':
        tufts(b, P(a, 0, ridge), P(e, 0, ridge), ridge + 0.12, dip=dip)
    for k, (at, keep) in enumerate(((a, rakes[0]), (e, rakes[1]))):
        sign = -1 if k == 0 else 1
        if keep:
            out = al * sign
            rake_pair(b, c + al * at, pp, out, half, ov, low, ridge, tips if DETAIL < 2 else None, w0=rake_w, ext=rake_ext, shapes=shapes)
        if fill[k] is not None:
            wall_s = fill[k]
            dz = (lambda x, ws=wall_s: tb['gable_edge'](shapes, half, ov, PITCH, (ws - a) / (e - a), x, 0.12)) if shapes else None
            gable_fill(b, c + al * wall_s, pp, out if keep else al * sign, half, z_fill if z_fill is not None else eave, half * PITCH,
                       boards=fill_boards, vertical=vertical_fill, dz=dz)
    return ridge


def build_base(b, outline_m=0.09):
    """Stone plinth under the walls (blocks in detail 0) and the floor deck."""
    def outline(m):
        if not PORCH:
            return [(HX + m, Y_FRONT - m), (HX + m, Y_BACK + m), (-HX - m, Y_BACK + m), (-HX - m, Y_FRONT - m)]
        return [(HX + m, Y_FRONT - m), (HX + m, Y_BACK + m), (-HX - m, Y_BACK + m), (-HX - m, Y_FRONT - m),
                (PX0 - m, Y_FRONT - m), (PX0 - m, Y_PORCH - m), (PX1 + m, Y_PORCH - m), (PX1 + m, Y_FRONT - m)]
    o = outline(outline_m)
    if DETAIL == 0:
        b.block_ring(o, 0.0, FLOOR, 0.3, 'stone')
    else:
        b.prism(o, 0.0, FLOOR, 'stone')
    b.prism(outline(-0.02), 0.0, FLOOR - 0.02, 'wall', top='plank')


def floor_boards(b):
    """Deck boards along y over the whole footprint (visible in stages 0 and 1 only)."""
    x = -HX + 0.1
    while x < HX - 0.05:
        y0 = Y_PORCH + 0.03 if PORCH and PX0 - 0.05 <= x <= PX1 + 0.05 else Y_FRONT + 0.03
        b.box(x, (y0 + Y_BACK - 0.03) / 2, FLOOR - 0.03, 0.19, Y_BACK - 0.03 - y0, 0.05, 'plank')
        x += 0.2


def sill_beams(b):
    """Stage 0: sill timbers laid on the deck along the wall lines, plus a small stack of planks."""
    h = 0.14
    for (x0, y0), (x1, y1) in (((-HX + 0.15, Y_FRONT + 0.15), (HX - 0.15, Y_FRONT + 0.15)),
                               ((HX - 0.15, Y_FRONT + 0.15), (HX - 0.15, Y_BACK - 0.15)),
                               ((HX - 0.15, Y_BACK - 0.15), (-HX + 0.15, Y_BACK - 0.15)),
                               ((-HX + 0.15, Y_BACK - 0.15), (-HX + 0.15, Y_FRONT + 0.15))):
        b.beam((x0, y0, FLOOR + h / 2), (x1, y1, FLOOR + h / 2), 0.24, h, 'beam')
    for k in range(3):
        b.box(HX * 0.4 + 0.05 * k, YC + 0.6, FLOOR + k * 0.1, 1.8, 0.35, 0.1, 'plank')


def rafters(b):
    """Stage 1: open roof frame, a pair every 0.7 m on the hall and the porch, ridge beams and two battens."""
    hall_r, hall_low = EAVE + HALF * PITCH, EAVE - OV_SIDE * PITCH
    n = round(2 * HX / 0.7)
    step = 2 * HX / n
    for k in range(n + 1):
        x = -HX + k * step
        b.beam((x, Y_FRONT - OV_SIDE, hall_low), (x, YC, hall_r), 0.12, 0.17, 'beam')
        b.beam((x, Y_BACK + OV_SIDE, hall_low), (x, YC, hall_r), 0.12, 0.17, 'beam')
    b.beam((-HX - OV_END, YC, hall_r + 0.05), (HX + OV_END, YC, hall_r + 0.05), 0.3, 0.14, 'beam')
    for f in (0.35, 0.7):
        for sg, ye in ((-1, Y_FRONT - OV_SIDE), (1, Y_BACK + OV_SIDE)):
            y, z = ye + (YC - ye) * f, hall_low + (hall_r - hall_low) * f
            b.beam((-HX - 0.3, y, z + 0.1), (HX + 0.3, y, z + 0.1), 0.07, 0.07, 'beam')
    if not PORCH:
        return
    half = (PX1 - PX0) / 2
    p_r, p_low = PORCH_EAVE + half * PITCH, PORCH_EAVE - 0.3 * PITCH
    for k in range(4):
        y = Y_PORCH + k * 0.55
        b.beam((PXC - half - 0.3, y, p_low), (PXC, y, p_r), 0.12, 0.17, 'beam')
        b.beam((PXC + half + 0.3, y, p_low), (PXC, y, p_r), 0.12, 0.17, 'beam')
    b.beam((PXC, Y_PORCH - OV_END, p_r + 0.05), (PXC, Y_FRONT + 0.5, p_r + 0.05), 0.26, 0.13, 'beam')
    if SPEC['porch']['kind'] == 'open':
        porch_posts(b)


def porch_posts(b):
    """Two thick pillars at the front corners of an open porch, carrying a tie beam and two wall beams."""
    for px in (PX0 + 0.16, PX1 - 0.16):
        b.beam((px, Y_PORCH + 0.16, 0.0), (px, Y_PORCH + 0.16, PORCH_EAVE + 0.05), 0.3, 0.3, 'beam')
        if DETAIL < 2:
            b.beam((px, Y_PORCH + 0.16, PORCH_EAVE - 0.1), (px, Y_FRONT, PORCH_EAVE - 0.1), 0.2, 0.22, 'beam')
    b.beam((PX0 + 0.16, Y_PORCH + 0.16, PORCH_EAVE - 0.12), (PX1 - 0.16, Y_PORCH + 0.16, PORCH_EAVE - 0.12), 0.2, 0.24, 'beam')


def auto_posts(length, openings, fixed=()):
    """Full-height posts: both ends, the given spots, and one about every 1.8 m clear of the openings."""
    pts = sorted({0.0, length, *fixed})
    for k in range(1, max(1, round(length / 1.8))):
        pts.append(k * length / max(1, round(length / 1.8)))
    keep = []
    for u in sorted(set(pts)):
        if any(o[0] - 0.12 <= u <= o[1] + 0.12 for o in openings):
            continue
        if keep and u - keep[-1] < 0.5:
            continue
        keep.append(u)
    return keep


def build_house(detail=0, stage=2):
    global DETAIL
    DETAIL = detail
    S = SPEC
    b, g = HB(S['seeds'][0]), HB(S['seeds'][1])
    build_base(b)
    if DETAIL == 0 and stage < 2:
        floor_boards(b)
    if stage == 0:
        sill_beams(b)
        return b, g, FLOOR
    low = FLOOR + 0.9
    bt = (lambda z: None) if stage == 2 else (lambda z: z)
    closed = bool(PORCH) and S['porch']['kind'] == 'closed'
    win = S['windows']
    posts = S.get('posts', {})
    door_u = S['door_x'] + HX
    front_ops = [(w[0] + HX - w[1] / 2, w[0] + HX + w[1] / 2, 1.15, 1.85) for w in win.get('front', [])]
    if not closed:
        front_ops.append((door_u - 0.5, door_u + 0.5, FLOOR, 2.15))
    right_ops = [(w[0] - Y_FRONT - w[1] / 2, w[0] - Y_FRONT + w[1] / 2, 1.15, 1.85) for w in win.get('right', [])]
    back_ops = [(HX - w[0] - w[1] / 2, HX - w[0] + w[1] / 2, 1.15, 1.85) for w in win.get('back', [])]
    left_ops = [(Y_BACK - w[0] - w[1] / 2, Y_BACK - w[0] + w[1] / 2, 1.15, 1.85) for w in win.get('left', [])]
    if S.get('bay'):
        left_ops.append((1.7, 3.1, FLOOR, 2.3))
    lh, rh = 2 * HX, Y_BACK - Y_FRONT
    fixed_front = [PX0 + HX, PX1 + HX] if closed else []
    runs = (
        ((-HX, Y_FRONT), (HX, Y_FRONT), front_ops, posts.get('front') or auto_posts(lh, front_ops, fixed_front), None if stage == 2 else FLOOR),
        ((HX, Y_FRONT), (HX, Y_BACK), right_ops, posts.get('right') or auto_posts(rh, right_ops), None if stage == 2 else low),
        ((HX, Y_BACK), (-HX, Y_BACK), back_ops, posts.get('back') or auto_posts(lh, back_ops), None if stage == 2 else low),
        ((-HX, Y_BACK), (-HX, Y_FRONT), left_ops, posts.get('left') or auto_posts(rh, left_ops), None if stage == 2 else FLOOR),
    )
    vert = S.get('walls') == 'v'
    for a, c, ops, ps, top in runs:  # the long walls stop just under the eave line, so nothing pokes out of the roof
        wall_run(b, a, c, FLOOR, EAVE - LONG_WALL_CUT if a[1] == c[1] else EAVE, openings=ops, posts=ps, board_top=top, vertical=vert)
    if closed:
        wall_run(b, (PX0, Y_FRONT), (PX0, Y_PORCH), FLOOR, PORCH_EAVE - LONG_WALL_CUT, posts=[0.0, 1.2], board_top=bt(FLOOR), vertical=vert)
        wall_run(b, (PX0, Y_PORCH), (PX1, Y_PORCH), FLOOR, PORCH_EAVE, openings=[(0.9, 1.9, FLOOR, 2.2)], posts=[0.0, 2.8],
                 board_top=bt(FLOOR), vertical=vert)
        wall_run(b, (PX1, Y_PORCH), (PX1, Y_FRONT), FLOOR, PORCH_EAVE - LONG_WALL_CUT, posts=[0.0, 1.2], board_top=bt(FLOOR), vertical=vert)
    if stage == 1:
        rafters(b)
        return b, g, EAVE + HALF * PITCH
    for w in win.get('front', []):
        window(b, g, (-HX, Y_FRONT), (HX, Y_FRONT), w[0] + HX - w[1] / 2, w[0] + HX + w[1] / 2, 1.15, 1.85)
    for w in win.get('right', []):
        window(b, g, (HX, Y_FRONT), (HX, Y_BACK), w[0] - Y_FRONT - w[1] / 2, w[0] - Y_FRONT + w[1] / 2, 1.15, 1.85)
    for w in win.get('back', []):
        window(b, g, (HX, Y_BACK), (-HX, Y_BACK), HX - w[0] - w[1] / 2, HX - w[0] + w[1] / 2, 1.15, 1.85)
    for w in win.get('left', []):
        window(b, g, (-HX, Y_BACK), (-HX, Y_FRONT), Y_BACK - w[0] - w[1] / 2, Y_BACK - w[0] + w[1] / 2, 1.15, 1.85)
    if S.get('bay'):
        opening_fill(b, g, (-HX, Y_BACK), (-HX, Y_FRONT), 1.7, 3.1, FLOOR, 2.3, 0.7)
    if closed:
        opening_fill(b, g, (PX0, Y_PORCH), (PX1, Y_PORCH), 0.9, 1.9, FLOOR, 2.2, 1.35)
    roof, gable_v = S['roof'], S.get('gable', 'v') == 'v'
    ridge = gable_roof(b, (0, YC), (1, 0), HALF, EAVE, -HX, HX, fill=(-HX, HX), z_fill=EAVE, tips=S['tips'], roof=roof,
                       vertical_fill=gable_v)
    if PORCH:
        ph = (PX1 - PX0) / 2
        p_ridge = PORCH_EAVE + ph * PITCH
        s1 = S['porch'].get('s1') or (YC - (ridge - p_ridge) / PITCH + 0.3 - Y_PORCH)
        gable_roof(b, (PXC, Y_PORCH), (0, 1), ph, PORCH_EAVE, 0.0, s1, rakes=(True, False),
                   ov_end=(OV_END, 0), ov=0.3 if closed else 0.35, fill=(0.0, None), z_fill=PORCH_EAVE,
                   rake_w=0.24, rake_ext=0.45, fill_boards=closed, tips='x', roof=roof, vertical_fill=gable_v)
        if not closed:
            porch_posts(b)
    if S.get('skirt'):
        skirt_roof(b, S['skirt'], roof)
    details(b)
    return b, g, ridge


def door_leaf(b, hinge, open_deg=70.0, height=1.85):
    """Plank door about a vertical hinge (open_deg 0 = closed in the wall plane, else swung outward toward -y),
    with two iron bands and a ring."""
    th = math.radians(open_deg)
    ldir = Vector((-math.cos(th), -math.sin(th), 0))
    nrm = Vector((-ldir.y, ldir.x, 0))
    h = Vector((hinge[0], hinge[1], 0))
    z0, z1 = FLOOR + 0.02, FLOOR + height
    for i in range(5):
        t = 0.095 + 0.19 * i
        b.beam(h + ldir * t + Vector((0, 0, z0)), h + ldir * t + Vector((0, 0, z1)), 0.18, 0.07, 'plank', up=nrm)
    for zc in (FLOOR + 0.4, FLOOR + height - 0.4):
        b.beam(h + ldir * 0.03 + Vector((0, 0, zc)), h + ldir * 0.95 + Vector((0, 0, zc)), 0.12, 0.1, 'dark', up=nrm)
    b.box(h.x + ldir.x * 0.8 + nrm.x * 0.06, h.y + ldir.y * 0.8 + nrm.y * 0.06, FLOOR + 0.9, 0.07, 0.07, 0.14, 'dark')


def details(b):
    """Steps, door and chimney."""
    S = SPEC
    cx, cy, cbase, ch, cw = S['chimney']
    if DETAIL == 2:
        chimney(b, cx, cy, cbase, ch, cw)
        return
    front_y = Y_PORCH if PORCH else Y_FRONT
    door_x = S['door_x']
    closed = bool(PORCH) and S['porch']['kind'] == 'closed'
    # Plank steps in front of the door and the gable-end bay.
    b.box(door_x, front_y - 0.22, 0.0, 1.9, 0.44, 0.18, 'plank')
    b.box(door_x, front_y - 0.12, 0.0, 1.6, 0.24, 0.3, 'plank')
    if S.get('bay'):
        b.box(-HX - 0.22, YC, 0.0, 0.44, 1.8, 0.2, 'plank')
    door_y = Y_PORCH if closed else Y_FRONT
    door_leaf(b, (door_x + 0.5, door_y - 0.03), S['door_open'])
    chimney(b, cx, cy, cbase, ch, cw)


def chimney(b, cx, cy, cbase, ch, cw):
    """Tapered stone stack that widens toward the roof, laid in courses 0.5 m high (one height of the stone strip, full
    detail shifts each course a little), with a slab cap and a dark flue."""
    lo, hi = cw * 1.2 / 2, cw * 0.84 / 2
    if b.roofs:  # the roof sags below where the plan put the foot: the stack reaches down into it, its top stays
        zs = [z for z in (b.roofs[0](cx + sx * lo, cy + sy * lo) for sx in (-1, 1) for sy in (-1, 1)) if z is not None]
        if zs and min(zs) - 0.15 < cbase:
            ch, cbase = ch + cbase - (min(zs) - 0.15), min(zs) - 0.15
    n = max(1, math.ceil(ch / 0.5)) if DETAIL < 2 else 1
    lean = ((b.rng.random() - 0.5) * 0.12, (b.rng.random() - 0.5) * 0.12) if b.organic else (0.0, 0.0)
    for k in range(n):
        h0, h1 = lo + (hi - lo) * k / n, lo + (hi - lo) * (k + 1) / n
        z0, z1 = cbase + ch * k / n, cbase + ch * (k + 1) / n
        jx, jy = ((b.rng.random() - 0.5) * 0.05, (b.rng.random() - 0.5) * 0.05) if b.organic and k else (0.0, 0.0)
        x, y = cx + jx + lean[0] * k / n, cy + jy + lean[1] * k / n
        b.hexa([(x - h0, y - h0, z0), (x + h0, y - h0, z0), (x + h0, y + h0, z0), (x - h0, y + h0, z0),
                (x - h1, y - h1, z1), (x + h1, y - h1, z1), (x + h1, y + h1, z1), (x - h1, y + h1, z1)], 'stone', tone=b.jitter(0.08))
    z1 = cbase + ch
    cap = hi + 0.12
    cx, cy = cx + lean[0], cy + lean[1]  # the cap sits on the leaning stack
    b.box(cx, cy, z1, 2 * cap, 2 * cap, 0.14, 'stone_fit', tone=1.05)
    if DETAIL < 2:
        f = hi * 0.55
        b.quad([(cx - f, cy - f, z1 + 0.145), (cx + f, cy - f, z1 + 0.145), (cx + f, cy + f, z1 + 0.145), (cx - f, cy + f, z1 + 0.145)],
               'dark', (0, 0, 1), 0.6)


def skirt_roof(b, sk, kind):
    """A lean-to blanket along the front wall on posts (the hall's skirt): `sk` = x0, x1 along the wall, depth out from
    it, z the height at the wall and drop how far the outer edge falls."""
    x0, x1, depth, z, drop = sk['x0'], sk['x1'], sk['depth'], sk['z'], sk['drop']
    xe = x1 + OV_END
    roof_plane(b, (x0, Y_FRONT, z), (xe, Y_FRONT, z), (xe, Y_FRONT - depth, z - drop), (x0, Y_FRONT - depth, z - drop), kind)
    y = Y_FRONT - depth + 0.12
    n = max(2, round((x1 - x0) / 1.7) + 1)
    for i in range(n):
        x = x0 + 0.12 + (x1 - x0 - 0.2) * i / (n - 1)
        b.beam((x, y, 0.0), (x, y, z - drop - 0.1), 0.2, 0.2, 'beam')
    if DETAIL < 2:
        b.beam((x0, y, z - drop - 0.2), (xe - 0.1, y, z - drop - 0.2), 0.16, 0.2, 'beam')


def region_materials():
    return tb['region_materials']()


def to_object(builder, name, collection, mats):
    bm = builder.bm
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=[f for f in bm.faces if not f[builder.fixed]])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if mesh.attributes.get('fixed'):
        mesh.attributes.remove(mesh.attributes['fixed'])
    for m in mats:
        mesh.materials.append(m)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def rebuild(name='house_c_s2', detail=0, stage=2):
    """Build one house type's stage as object `name` ('<type>_s<stage>'); the type is taken from the name."""
    kind = name.rsplit('_s', 1)[0]
    if kind in SPECS:
        configure(kind)
    coll = bpy.data.collections.get(name)
    if coll:
        for obj in list(coll.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    for stale in (name, name + '_glow'):  # same-named objects elsewhere would push ours to '<name>.001'
        if stale in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[stale], do_unlink=True)
    body, glow, ridge = BUILDERS.get(kind, build_house)(detail, stage)
    mats = region_materials()
    house = to_object(body, name, coll, mats)
    glow_mat = bpy.data.materials.get('house_glow') or bpy.data.materials.new('house_glow')
    glow_mat.diffuse_color = WARM_COLOR
    glow_mat.use_nodes = True
    nodes, links = glow_mat.node_tree.nodes, glow_mat.node_tree.links
    vc = nodes.get('vcol') or nodes.new('ShaderNodeVertexColor')
    vc.name = 'vcol'
    vc.layer_name = 'Col'
    bsdf = nodes['Principled BSDF']
    links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(vc.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 4.0
    glow_obj = to_object(glow, name + '_glow', coll, [glow_mat])
    col = glow_obj.data.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    tone = glow_obj.data.attributes.get('tone')
    for poly in glow_obj.data.polygons:
        t = tone.data[poly.index].value if tone else 1.0
        if t >= WARM / 2:
            t -= WARM
        for li in poly.loop_indices:
            col.data[li].color = (WARM_COLOR[0] * t, WARM_COLOR[1] * t, WARM_COLOR[2] * t, 1.0)
    if tone:
        glow_obj.data.attributes.remove(tone)
    for name in ('uoff', 'preuv'):
        if glow_obj.data.attributes.get(name):
            glow_obj.data.attributes.remove(glow_obj.data.attributes[name])
    # glTF extras (axes x, z = Blender x, -y): footprint, door centre on its edge, builder spots, chimney top.
    if kind in KIND_META:
        for key, value in KIND_META[kind]().items():
            house[key] = value
    else:
        fy = Y_PORCH if PORCH else Y_FRONT
        cx, cy, cbase, ch, _cw = SPEC['chimney']
        house['footprint'] = [2 * HX, Y_BACK - fy]
        house['door'] = [SPEC['door_x'], -fy]
        house['chimney'] = [cx, cbase + ch + 0.25, -cy]
        house['workSlots'] = [[-HX + 0.1, -fy + 1.1], [HX * 0.34, -fy + 0.7], [0.0, -Y_BACK - 1.2], [HX + 1.2, 0.0]]
    tris = sum(len(p.vertices) - 2 for p in house.data.polygons)
    glow_tris = sum(len(p.vertices) - 2 for p in glow_obj.data.polygons)
    if not glow_tris:
        bpy.data.objects.remove(glow_obj, do_unlink=True)
    return {'tris': tris, 'glow_tris': glow_tris, 'dims': list(house.dimensions), 'ridge': ridge}


def preview(path, azimuth=-35.0, elevation=24.0, size=1000, color='MATERIAL', target=(0, 0, 2.6), scale=13, only=None):
    """Workbench render; `only` hides every other collection so stages and LODs do not overlap."""
    for coll in bpy.data.collections:
        hidden = only is not None and coll.name != only
        coll.hide_render = hidden
        coll.hide_viewport = hidden
    return tb['preview'](path, azimuth, elevation, size, color, target, scale)


def make(out_dir, atlas_ns, atlas_png, kinds=('house_c',)):
    """Build and export <kind>_s{0,1,2}[_lod1|_lod2].gltf and <kind>_glow.gltf into out_dir, then bake each
    with bake-play-props --no-lod. Returns the triangle counts."""
    image, strips = atlas_ns['paint_atlas'](atlas_png)
    counts = {}
    for kind in kinds:
        for stage in KIND_STAGES.get(kind, (0, 1, 2)):
            for detail, suffix in ((2, '_lod2'), (1, '_lod1'), (0, '')):
                name = f'{kind}_s{stage}'
                info = rebuild(name, detail, stage)
                atlas_ns['apply_atlas'](bpy.data.objects[name], image, strips)
                tb['export_one'](name + suffix, [bpy.data.objects[name]], out_dir)
                counts[name + suffix] = info['tris']
                if stage == 2 and detail == 0 and bpy.data.objects.get(name + '_glow'):
                    tb['export_one'](f'{kind}_glow', [bpy.data.objects[name + '_glow']], out_dir)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    return counts
