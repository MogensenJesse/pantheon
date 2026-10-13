# assets-src/village/house_build.py — builds village houses (Nordic timber halls) in Blender.
# Run inside Blender (see public/models/village-kit/README.md). Blender axes: +Z up, the door faces -Y
# (glTF +Z after export). Metres. Origin = footprint centre, z 0 = the floor the levelled pad gives.
# Needs `tb` in its namespace: the namespace of temple_build.py, exec'd on its own for houses (the region
# table is replaced below, so never share it with the temple build). Detail 0 full (individual boards and
# shingles), 1 mid (panels and slabs), 2 far (silhouette).
import math
import random

import bmesh
import bpy
import numpy as np
from mathutils import Vector

# Surface types; each is one strip of the house atlas (colours here are only for previews).
REGIONS = {
    'wall': (0.80, 0.52, 0.28),
    'plank': (0.82, 0.54, 0.30),
    'tile': (0.95, 0.56, 0.28),
    'shingle': (0.92, 0.54, 0.27),
    'stone': (0.42, 0.41, 0.42),
    'trim': (0.74, 0.52, 0.32),
    'beam': (0.34, 0.20, 0.11),
    'dark': (0.05, 0.04, 0.04),
    'carve': (0.80, 0.70, 0.52),
    'turf': (0.42, 0.52, 0.20),
    'rope': (0.62, 0.48, 0.30),
}
tb['REGIONS'] = REGIONS
tb['REGION_INDEX'] = {name: i for i, name in enumerate(REGIONS)}
LONG = ('trim', 'beam', 'plank', 'rope')
UP = Vector((0, 0, 1))
WARM = 10.0  # glow-face tone offset (all house glow is warm)
WARM_COLOR = (1.0, 0.5, 0.12, 1.0)

# Per-type plans (m). The footprint is the hall plus its porch; hall walls stand on the footprint outline.
# windows: (centre along the wall in world x or y, width). door_x: world x of the door on the front (-y) side.
SPECS = {
    'house_c': dict(
        hx=3.5, y_front=-1.8, y_back=3.0, eave=2.7,
        porch=dict(kind='closed', x0=-2.9, x1=-0.1, y=-3.0, eave=2.35, s1=2.6),
        door_x=-1.5, door_open=70.0,
        windows=dict(front=[(2.3, 0.8)], right=[(0.6, 0.8)], back=[(1.5, 0.7), (-1.5, 0.7)]),
        bay=True, dormer=(1.6, -1.4, 0.65, 3.7), chimney=(2.4, 1.6, 3.6, 2.55, 0.7), heads=False,
        posts=dict(front=[0.0, 0.6, 3.4, 7.0], right=[0.0, 4.8], back=[0.0, 3.5, 7.0], left=[0.0, 4.8]),
        seeds=(21, 5)),
    # Small cottage: closed plank door with two steps, one window beside it, a ridge chimney, no porch.
    'house_a': dict(
        hx=2.5, y_front=-2.0, y_back=2.0, eave=2.4, porch=None,
        door_x=-1.0, door_open=0.0,
        windows=dict(front=[(1.0, 0.8)], right=[(0.0, 0.8)], back=[(-0.8, 0.8), (1.0, 0.8)]),
        bay=False, dormer=None, chimney=(0.9, 0.7, 3.2, 2.1, 0.6), heads=True, seeds=(31, 7)),
    # Medium house: open porch on two thick pillars, door under it, a window on each side, big stone chimney.
    'house_b': dict(
        hx=3.0, y_front=-1.5, y_back=2.5, eave=2.55,
        porch=dict(kind='open', x0=-1.3, x1=1.3, y=-2.5, eave=2.3),
        door_x=0.0, door_open=0.0,
        windows=dict(front=[(-2.0, 0.9), (2.0, 0.9)], right=[(0.5, 0.9)], back=[(-1.3, 0.9), (1.3, 0.9)]),
        bay=False, dormer=None, chimney=(1.8, 1.4, 3.3, 2.3, 0.85), heads=True, seeds=(41, 9)),
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
    """Builder plus single-sided faces that keep the winding they were given."""

    def __init__(self, seed=1):
        super().__init__(seed)
        self.fixed = self.bm.faces.layers.int.new('fixed')

    def quad(self, pts, region, want, tone=None):
        p = [Vector(q) for q in pts]
        if (p[1] - p[0]).cross(p[2] - p[1]).dot(Vector(want)) < 0:
            p.reverse()
        f = self.face(p, region, tone)
        f[self.fixed] = 1
        return f


def wall_run(b, a, c, z0, z1, openings=(), posts=(), depth=0.1, recess=0.05, frame=True, board_top=None):
    """Timber-framed plank wall on the line a -> c (outward normal = right-hand side of a -> c seen from above).
    `openings` are (u0, u1, zb, zt) along the run; `posts` are u positions of full-height posts."""
    A, C = Vector((a[0], a[1], 0)), Vector((c[0], c[1], 0))
    d = C - A
    L = d.length
    d.normalize()
    n = Vector((d.y, -d.x, 0))
    base = A - n * (recess + depth / 2)

    def P(u, z):
        return base + d * u + Vector((0, 0, z))

    zb_top = z1 if board_top is None else board_top
    if DETAIL == 0:
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
                    b.beam(P(s + 0.012, z + (h - 0.012) / 2), P(e - 0.012, z + (h - 0.012) / 2), depth, h - 0.012, 'plank')
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
            b.beam(P(u, z0) - n * (pw / 2 - recess - depth / 2), P(u, z1), pw, pw, 'beam')
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


def gable_fill(b, centre, along, n, hw, z_eave, rise, depth=0.1, recess=0.05, frame=True, boards=True, vertical=False):
    """The wall triangle under a gable: boards narrowing to the apex, tie beam, king post and struts."""
    cen = Vector((centre[0], centre[1], 0)) - n * (recess + depth / 2)
    al = Vector(along)
    if not boards:
        pass
    elif DETAIL == 0 and vertical:
        x = -hw + 0.1
        while x < hw - 0.05:
            top = rise * (1 - abs(x) / hw) - 0.04
            if top > 0.1:
                b.beam(cen + al * x + Vector((0, 0, z_eave)), cen + al * x + Vector((0, 0, z_eave + top)), 0.19, depth, 'plank', up=n)
            x += 0.2
    elif DETAIL == 0:
        z = 0.0
        while z < rise - 0.05:
            h = min(ROW, rise - z)
            w = hw * (1 - (z + h) / rise) - 0.03
            if w > 0.08:
                zc = z_eave + z + (h - 0.012) / 2
                b.beam(cen - al * w + Vector((0, 0, zc)), cen + al * w + Vector((0, 0, zc)), depth, h - 0.012, 'plank')
            z += ROW
    elif DETAIL == 1:
        b.tri_prism(cen - al * hw + Vector((0, 0, z_eave)), cen + al * hw + Vector((0, 0, z_eave)),
                    cen + Vector((0, 0, z_eave + rise)), (-n) * depth, 'wall')
    else:
        b.tri_prism(cen - al * hw + Vector((0, 0, z_eave)), cen + al * hw + Vector((0, 0, z_eave)),
                    cen + Vector((0, 0, z_eave + rise)), (-n) * (depth + recess), 'wall')
    if DETAIL == 0 and frame:
        o = cen + n * (depth / 2 + 0.03)
        tie = z_eave + 0.7
        w_tie = hw * (1 - 0.7 / rise) - 0.12  # the roof planes close in as the tie rises
        b.beam(o - al * w_tie + Vector((0, 0, tie)), o + al * w_tie + Vector((0, 0, tie)), 0.14, 0.16, 'beam')
        b.beam(o + Vector((0, 0, tie)), o + Vector((0, 0, z_eave + rise - 0.2)), 0.14, 0.14, 'beam')
        for sd in (-1, 1):
            b.beam(o + al * sd * w_tie * 0.8 + Vector((0, 0, tie)), o + al * sd * 0.07 + Vector((0, 0, z_eave + rise * 0.7)), 0.1, 0.12, 'beam')


def tile_plane(b, r0, r1, e1, e0, turf=None):
    """One roof plane (ridge start, ridge end, eave end, eave start): slab plus rows of individual tiles."""
    r0, r1, e1, e0 = (Vector(p) for p in (r0, r1, e1, e0))
    n = (r1 - r0).cross(e0 - r0).normalized()
    if n.z < 0:
        n = -n
    low = [p - n * ROOF_T for p in (r0, r1, e1, e0)]
    if turf is not None and DETAIL > 0:
        b.hexa(low + [r0, r1, e1, e0], 'beam', top='turf', tone=0.9)
        if DETAIL == 1:
            u0, u1, q0, q1 = turf
            pa, pb = e0.lerp(r0, q0), e1.lerp(r1, q0)
            pc, pd = e0.lerp(r0, q1), e1.lerp(r1, q1)
            quad = [pa.lerp(pb, u0), pa.lerp(pb, u1), pc.lerp(pd, u1), pc.lerp(pd, u0)]
            b.hexa([p + n * 0.005 for p in quad] + [p + n * 0.05 for p in quad], 'beam', top='shingle')
        return n
    if DETAIL == 1:
        bands = max(1, math.ceil((e0 - r0).length / 1.1))
        for k in range(bands):
            f0, f1 = k / bands, (k + 1) / bands
            top = [r0.lerp(e0, f0), r1.lerp(e1, f0), r1.lerp(e1, f1), r0.lerp(e0, f1)]
            b.hexa([p - n * ROOF_T for p in top] + top, 'beam', top='shingle')
        return n
    b.hexa(low + [r0, r1, e1, e0], 'beam', top='turf' if turf is not None else ('dark' if DETAIL == 0 else 'shingle'), tone=0.8)
    if DETAIL > 0:
        return n
    rd = (r1 - r0).normalized()
    wd = (r1 - r0).length
    sl = (r0 - e0).normalized()
    ls = (r0 - e0).length
    tu0, tu1, tq0, tq1 = turf if turf is not None else (0.0, 1.0, 0.0, 1.0)
    q = tq0 * ls
    k = 0
    while q < min(ls, tq1 * ls) - 0.04:
        u = tu0 * wd - b.rng.random() * 0.2 * (turf is None)
        q1 = min(ls, tq1 * ls, q + TILE_LEN)
        while u < min(wd, tu1 * wd) - 0.02:
            tw = 0.26 + b.rng.random() * 0.1
            ua, ub = max(tu0 * wd, u), min(tu1 * wd, wd, u + tw - 0.012)
            u += tw
            if ub - ua < 0.04:
                continue
            tone = 0.88 + b.rng.random() * 0.24
            lo, hi = 0.05 + 0.002 * k, 0.018 + 0.002 * k
            p00, p10 = e0 + rd * ua + sl * q + n * lo, e0 + rd * ub + sl * q + n * lo
            p11, p01 = e0 + rd * ub + sl * q1 + n * hi, e0 + rd * ua + sl * q1 + n * hi
            b.quad([p00, p10, p11, p01], 'tile', n, tone)
            b.quad([p00, p10, p10 - n * (lo - 0.004), p00 - n * (lo - 0.004)], 'tile', -sl, tone * 0.6)
        q += TILE_ROW
        k += 1
    return n


def gable_roof(b, centre, along, half, eave, s0, s1, ridge_beam=True, rakes=(True, True), ov_end=(OV_END, OV_END),
               ov=OV_SIDE, fill=(None, None), z_fill=None, rake_w=0.26, rake_ext=0.7, fill_boards=True, heads=False, turf=None, vertical_fill=False):
    """Gable roof over a ridge line from s0 to s1 (m along `along` from `centre`), both planes tiled.
    `fill` = (s position, sign) per end gets a gable wall, rake boards crossing at the apex.
    Returns the ridge height."""
    al = Vector((along[0], along[1], 0)).normalized()
    pp = Vector((-al.y, al.x, 0))
    c = Vector((centre[0], centre[1], 0))

    def P(s, v, z):
        return c + al * s + pp * v + Vector((0, 0, z))

    ridge, low = eave + half * PITCH, eave - ov * PITCH
    a, e = s0 - ov_end[0] if rakes[0] else s0, s1 + ov_end[1] if rakes[1] else s1
    for side in (-1, 1):
        tile_plane(b, P(a, 0, ridge), P(e, 0, ridge), P(e, side * (half + ov), low), P(a, side * (half + ov), low), turf=turf)
    if ridge_beam and DETAIL < 2:
        b.beam(P(a, 0, ridge + 0.05), P(e, 0, ridge + 0.05), 0.32, 0.14, 'beam')
    for k, (at, keep) in enumerate(((a, rakes[0]), (e, rakes[1]))):
        sign = -1 if k == 0 else 1
        if keep:
            out = al * sign
            for side in (-1, 1):
                p_eave = P(at, side * (half + ov), low + 0.05)
                p_apex = P(at, 0, ridge + 0.05)
                dirv = (p_apex - p_eave).normalized()
                b.beam(p_eave, p_apex + dirv * rake_ext, rake_w, 0.1, 'beam', up=out)
                if heads and DETAIL < 2:
                    finial_head(b, p_apex + dirv * rake_ext, dirv, out)
        if fill[k] is not None:
            wall_s = fill[k]
            gable_fill(b, c + al * wall_s, pp, out if keep else al * sign, half, z_fill if z_fill is not None else eave, half * PITCH, boards=fill_boards, vertical=vertical_fill)
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
    for a, c, ops, ps, top in runs:
        wall_run(b, a, c, FLOOR, EAVE, openings=ops, posts=ps, board_top=top)
    if closed:
        wall_run(b, (PX0, Y_FRONT), (PX0, Y_PORCH), FLOOR, PORCH_EAVE, posts=[0.0, 1.2], board_top=bt(FLOOR))
        wall_run(b, (PX0, Y_PORCH), (PX1, Y_PORCH), FLOOR, PORCH_EAVE, openings=[(0.9, 1.9, FLOOR, 2.2)], posts=[0.0, 2.8],
                 board_top=bt(FLOOR))
        wall_run(b, (PX1, Y_PORCH), (PX1, Y_FRONT), FLOOR, PORCH_EAVE, posts=[0.0, 1.2], board_top=bt(FLOOR))
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
    heads = S.get('heads', False)
    ridge = gable_roof(b, (0, YC), (1, 0), HALF, EAVE, -HX, HX, fill=(-HX, HX), z_fill=EAVE, heads=heads)
    if PORCH:
        ph = (PX1 - PX0) / 2
        p_ridge = PORCH_EAVE + ph * PITCH
        s1 = S['porch'].get('s1') or (YC - (ridge - p_ridge) / PITCH + 0.3 - Y_PORCH)
        gable_roof(b, (PXC, Y_PORCH), (0, 1), ph, PORCH_EAVE, 0.0, s1, rakes=(True, False),
                   ov_end=(OV_END, 0), ov=0.3 if closed else 0.35, fill=(0.0, None), z_fill=PORCH_EAVE,
                   rake_w=0.22, rake_ext=0.55, fill_boards=closed, heads=heads)
        if not closed:
            porch_posts(b)
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
    """Steps, door, rafter tails, dormer and chimney."""
    S = SPEC
    cx, cy, cbase, ch, cw = S['chimney']
    if DETAIL == 2:
        b.box(cx, cy, cbase, cw, cw, ch + 0.15, 'stone')
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
    if DETAIL == 0:
        # Rafter tails under both long eaves.
        n = round(2 * HX / 0.7)
        for k in range(n):
            x = -HX + 0.35 + k * (2 * HX - 0.7) / max(1, n - 1)
            for yw, sg in ((Y_FRONT, -1), (Y_BACK, 1)):
                b.beam((x, yw + sg * 0.05, EAVE - 0.2), (x, yw + sg * 0.5, EAVE - OV_SIDE * PITCH - 0.02), 0.11, 0.11, 'beam')
    if S.get('dormer'):
        dx, dy, dh, deave = S['dormer']
        wall_run(b, (dx - dh, dy), (dx + dh, dy), 3.02, deave, posts=[0.0, 2 * dh], frame=DETAIL == 0)
        wall_run(b, (dx - dh, dy + 0.7), (dx - dh, dy), 3.02, deave, frame=False)
        wall_run(b, (dx + dh, dy), (dx + dh, dy + 0.7), 3.02, deave, frame=False)
        gable_roof(b, (dx, dy), (0, 1), dh, deave, 0.0, 1.3, rakes=(True, False), ov_end=(0.25, 0), ov=0.25,
                   fill=(0.0, None), z_fill=deave, rake_w=0.15, rake_ext=0.3)
    # Stone chimney through the back slope.
    b.box(cx, cy, cbase, cw, cw, ch, 'stone')
    b.box(cx, cy, cbase + ch, cw + 0.2, cw + 0.2, 0.16, 'stone')
    if DETAIL == 0:
        b.box(cx, cy, cbase + ch + 0.16, 0.34, 0.34, 0.26, 'beam')


def finial_head(b, tip, dv, out):
    """Carved horse head on the end of a rake beam: a head block, a snout angled down and two ears."""
    tip, dv, out = Vector(tip), Vector(dv).normalized(), Vector(out)
    pv = out.cross(dv).normalized()
    if pv.z < 0:
        pv = -pv
    snout = (dv - Vector((0, 0, 0.7))).normalized()
    b.beam(tip - dv * 0.08, tip + dv * 0.42, 0.42, 0.16, 'beam', up=out)
    b.beam(tip + dv * 0.38, tip + dv * 0.38 + snout * 0.38, 0.26, 0.15, 'beam', up=out)
    for sd in (0.0, 0.14):
        b.beam(tip + dv * (0.02 + sd) + pv * 0.16, tip + dv * (-0.04 + sd) + pv * 0.5, 0.11, 0.12, 'beam', up=out)


def house_atlas(root):
    """Namespace of village_atlas.py re-targeted at the warm house strips (its own image, never the temple's)."""
    src = open(root + '/village_atlas.py').read().replace("'village_atlas'", "'village_house_atlas'")
    ns = {}
    exec(src, ns)
    board, planks, shingles = ns['board'], ns['planks'], ns['shingles']
    ns['LONG'] = LONG
    ns['STRIP_SPECS'] = [
        ('wall', 224, 4.0, None), ('plank', 64, 2.4, None), ('tile', 96, 3.2, None), ('shingle', 128, 3.2, None),
        ('stone', 112, 4.0, 0.5), ('trim', 56, 2.0, None), ('beam', 56, 2.0, None), ('dark', 32, 1.5, None),
        ('carve', 32, 6.0, None), ('turf', 96, 3.0, None), ('rope', 32, 1.2, None),
    ]
    ns['MAKERS'] = {
        'wall': lambda h, rng: planks(h, rng, base=REGIONS['wall'], boards=16),
        'plank': lambda h, rng: board(h, rng, REGIONS['plank'], streak=True, bevel=0.14),
        'tile': lambda h, rng: board(h, rng, REGIONS['tile'], streak=False, bevel=0.16),
        'shingle': lambda h, rng: shingles(h, rng, base=REGIONS['shingle'], rows=5, sw=32),
        'stone': lambda h, rng: ns['stones'](h, rng, base=REGIONS['stone']),
        'trim': lambda h, rng: board(h, rng, REGIONS['trim'], streak=True, bevel=0.2),
        'beam': lambda h, rng: board(h, rng, REGIONS['beam']),
        'dark': ns['dark'],
        'carve': lambda h, rng: board(h, rng, REGIONS['carve'], streak=False, bevel=0.05),
        'turf': lambda h, rng: board(h, rng, REGIONS['turf'], streak=False, bevel=0.0),
        'rope': lambda h, rng: board(h, rng, REGIONS['rope'], streak=True, bevel=0.3),
    }
    return ns


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
