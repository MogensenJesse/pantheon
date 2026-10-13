# assets-src/village/temple_build.py — builds the village temple (Nordic rune temple) in Blender.
# Run inside Blender (see public/models/village-kit/README.md). Blender axes: +Z up, the door faces -Y
# (glTF +Z after export). Metres. Origin = footprint centre, z 0 = the floor the game's plinth carries.
# Detail levels: 0 full (individual planks, stone blocks, battens), 1 mid (slabs), 2 far (silhouette).
import math
import random

import bmesh
import bpy
from mathutils import Vector

# Surface types; each is one strip of the shared village atlas (colours here are only for previews).
REGIONS = {
    'wall': (0.55, 0.46, 0.38),
    'beam': (0.34, 0.27, 0.21),
    'shingle': (0.42, 0.46, 0.55),
    'stone': (0.56, 0.55, 0.52),
    'trim': (0.80, 0.82, 0.85),
    'carve': (0.80, 0.70, 0.52),
    'dark': (0.05, 0.06, 0.07),
    'rune': (0.40, 0.32, 0.26),
    'roofboard': (0.50, 0.53, 0.58),
    'inlay': (0.80, 0.70, 0.52),
}
REGION_INDEX = {name: i for i, name in enumerate(REGIONS)}

# Plan (m): the walls reach REACH along each arm; the stone terrace is the game footprint (2 * TERR).
ARM_HALF, REACH, CORE = 2.7, 6.0, 3.6
TERR, TERR_Z, PLAT_Z, BASE_Z = 7.0, 0.14, 0.62, 0.8
WALL_Z, ARM_PITCH, CORE_TOP, MAIN_PITCH = 3.4, 0.98, 8.4, 1.05
ROOF_T, BOARD_W, BOARD_T, GAP = 0.2, 0.34, 0.07, 0.03
DETAIL = 0
UP = Vector((0, 0, 1))
WARM = 10.0  # glow-face tone offset: door, window and lantern lights (warm), not runes and seams (cyan)
ARMS = ((0, -1), (0, 1), (-1, 0), (1, 0))  # front (the door side), back, left, right


class Builder:
    def __init__(self, seed=1):
        self.bm = bmesh.new()
        self.tone = self.bm.faces.layers.float.new('tone')
        self.rng = random.Random(seed)

    def jitter(self, amount=0.12):
        return 1 + (self.rng.random() - 0.5) * 2 * amount

    def face(self, pts, region, tone=None):
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = REGION_INDEX[region]
        f[self.tone] = tone if tone is not None else self.jitter(0.05)
        return f

    def hexa(self, c, region, top=None, bottom=True, tone=None):
        """Closed solid from 8 corners: bottom 0-3 then top 4-7 above them (`top` = region of face 4-7)."""
        tone = tone if tone is not None else self.jitter()
        faces = ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7))
        for k, idx in enumerate(faces):
            # Always closed: open shells get their normals flipped by the recalculation below.
            self.face([c[i] for i in idx], top if (k == 1 and top) else region, tone)

    def box(self, cx, cy, z0, sx, sy, sz, region, bottom=True, tone=None):
        x0, x1, y0, y1, z1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, z0 + sz
        self.hexa([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                   (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], region, bottom=bottom, tone=tone)

    def beam(self, a, b, w, h, region, up=UP, bottom=True, tone=None):
        """Box of section w (sideways) x h (along `up`) from point a to point b."""
        a, b = Vector(a), Vector(b)
        d = (b - a).normalized()
        side = d.cross(Vector(up))
        if side.length < 1e-6:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        upv = side.cross(d).normalized()
        s, u = side * (w / 2), upv * (h / 2)
        self.hexa([a - s - u, a + s - u, b + s - u, b - s - u, a - s + u, a + s + u, b + s + u, b - s + u],
                  region, bottom=bottom, tone=tone)

    def prism(self, outline, z0, z1, region, top=None):
        """Vertical extrusion of a counterclockwise XY outline (no bottom face)."""
        n = len(outline)
        for i in range(n):
            (ax, ay), (bx, by) = outline[i], outline[(i + 1) % n]
            self.face([(ax, ay, z0), (bx, by, z0), (bx, by, z1), (ax, ay, z1)], region)
        if top:
            self.face([(x, y, z1) for x, y in outline], top)

    def tri_prism(self, p0, p1, p2, depth, region):
        d = Vector(depth)
        a = [Vector(p) for p in (p0, p1, p2)]
        b = [p + d for p in a]
        self.face(a, region)
        self.face(list(reversed(b)), region)
        for i in range(3):
            j = (i + 1) % 3
            self.face([a[i], a[j], b[j], b[i]], region)

    def extrude_profile(self, pts, origin, along, across, thick, region):
        """Flat profile (u along `along`, v up) extruded `thick` along `across`, centred."""
        o, a, c = Vector(origin), Vector(along).normalized(), Vector(across).normalized()
        front = [o + a * u + UP * v - c * thick / 2 for u, v in pts]
        back = [o + a * u + UP * v + c * thick / 2 for u, v in pts]
        n = len(pts)
        self.face(front, region)
        self.face(list(reversed(back)), region)
        for i in range(n):
            j = (i + 1) % n
            self.face([front[i], back[i], back[j], front[j]], region)

    def paving(self, outline, z, cell, region='stone', hole=None):
        """Top surface of a polygon as cell-sized flagstones (each maps the whole stone strip)."""
        xs, ys = [p[0] for p in outline], [p[1] for p in outline]
        nx, ny = math.ceil((max(xs) - min(xs)) / cell), math.ceil((max(ys) - min(ys)) / cell)
        g = 0.012 if DETAIL == 0 else 0
        for i in range(nx):
            for j in range(ny):
                x0, y0 = min(xs) + i * cell, min(ys) + j * cell
                if not inside(outline, x0 + cell / 2, y0 + cell / 2):
                    continue
                if hole and all(inside(hole, x0 + sx * cell, y0 + sy * cell) for sx in (0.02, 0.98) for sy in (0.02, 0.98)):
                    continue
                dz = (self.rng.random() - 0.5) * 0.012 if DETAIL == 0 else 0
                self.face([(x0 + g, y0 + g, z + dz), (x0 + cell - g, y0 + g, z + dz),
                           (x0 + cell - g, y0 + cell - g, z + dz), (x0 + g, y0 + cell - g, z + dz)],
                          region, self.jitter(0.1))

    def block_ring(self, outline, z0, z1, depth, region='stone', lo=0.7, hi=1.35):
        """Edge of a counterclockwise polygon as separate stone blocks, each its own length."""
        n = len(outline)
        for i in range(n):
            p, q = Vector((*outline[i], 0)), Vector((*outline[(i + 1) % n], 0))
            d = q - p
            length = d.length
            d.normalize()
            out = Vector((d.y, -d.x, 0))
            t = 0.0
            while t < length - 0.05:
                blk = min(length - t, lo + (hi - lo) * self.rng.random())
                if length - t - blk < 0.4:
                    blk = length - t
                a = p + d * t + Vector((0, 0, z0))
                b = a + d * (blk - 0.03)
                h = Vector((0, 0, (z1 - z0) * self.jitter(0.06)))
                self.hexa([a, b, b - out * depth, a - out * depth, a + h, b + h,
                           b - out * depth + h, a - out * depth + h],
                          region, bottom=False, tone=self.jitter(0.1))
                t += blk


def inside(poly, x, y):
    """Point in polygon (even-odd)."""
    hit = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % len(poly)]
        if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
            hit = not hit
    return hit


def cross_outline(a, r, c):
    """Counterclockwise cruciform: arms of half width a reaching r, core square of half width c."""
    return [(-a, -r), (a, -r), (a, -c), (c, -c), (c, -a), (r, -a), (r, a), (c, a), (c, c), (a, c),
            (a, r), (-a, r), (-a, c), (-c, c), (-c, a), (-r, a), (-r, -a), (-c, -a), (-c, -c), (-a, -c)]


def square(h):
    return [(-h, -h), (h, -h), (h, h), (-h, h)]


def arm_vec(arm):
    return Vector((arm[0], arm[1], 0))


def arm_point(arm, u, v, z):
    """World point u along the arm (outward), v to its right, at height z."""
    dx, dy = arm
    return Vector((dx * u - dy * v, dy * u + dx * v, z))


DRAGON = [(0, 0), (0.1, 0.35), (0.25, 0.7), (0.5, 0.95), (0.85, 1.08), (1.2, 1.05), (1.45, 0.9), (1.52, 0.76),
          (1.38, 0.8), (1.2, 0.88), (0.9, 0.9), (0.62, 0.74), (0.44, 0.5), (0.36, 0.25), (0.3, 0)]


def dragon(b, apex, outward, scale):
    """Carved dragon-head finial rising from a gable apex and curling outward."""
    pts = [(u * scale, v * scale) for u, v in DRAGON]
    o = Vector(outward).normalized()
    b.extrude_profile(pts, Vector(apex) - o * 0.12 * scale, o, o.cross(UP), 0.17 * scale, 'beam')


def ribbon(b, pts, n, width, region):
    """Flat inlaid band along a polyline lying on a surface with normal n."""
    for a, c in zip(pts, pts[1:]):
        a, c = Vector(a), Vector(c)
        side = (c - a).cross(n).normalized() * (width / 2)
        b.face([a - side, c - side, c + side, a + side], region, 1.0)


def glow_strip(g, pts, n, width, tone=1.0):
    """Flat glowing ribbon along a polyline lying on a surface with normal n."""
    for a, c in zip(pts, pts[1:]):
        a, c = Vector(a), Vector(c)
        side = (c - a).cross(n).normalized() * (width / 2)
        g.face([a - side, c - side, c + side, a + side], 'trim', tone)


def roof_slope(b, g, q, glow=(), inlay=()):
    """One roof plane q = (ridge start, ridge end, eave end, eave start): a base slab with individual
    boards in two overlapping courses (full), banded shingle slabs (mid) or a plain slab (far).
    `glow` lists polylines in (along the ridge 0..1, down the slope 0..1) laid as glowing ribbons."""
    r0, r1, e1, e0 = [Vector(p) for p in q]
    n = (r1 - r0).cross(e0 - r0).normalized()
    if n.z < 0:
        n = -n
    low = [p - n * ROOF_T for p in (r0, r1, e1, e0)]
    if DETAIL == 0:
        b.hexa(low + [r0, r1, e1, e0], 'beam', top='dark', tone=0.8)
        nb = max(1, round((r1 - r0).length / BOARD_W))
        w = (r1 - r0).length / nb - GAP
        for i in range(nb):
            t = (i + 0.5) / nb
            top, bot = r0.lerp(r1, t), e0.lerp(e1, t)
            d = (bot - top).normalized()
            mid = top.lerp(bot, 0.38 + 0.24 * b.rng.random())
            lift = n * (BOARD_T / 2)
            b.beam(top + lift + n * 0.02, mid + d * 0.05 + lift + n * 0.02, w, BOARD_T, 'roofboard', up=n, bottom=False)
            b.beam(mid + lift, bot + d * 0.07 + lift, w, BOARD_T, 'roofboard', up=n, bottom=False)
        fascia = (e0 + n * 0.06 + (e0 - r0).normalized() * 0.07, e1 + n * 0.06 + (e1 - r1).normalized() * 0.07)
        b.beam(fascia[0], fascia[1], 0.12, 0.22, 'trim', up=n)
        m = max(2, round((e1 - e0).length / 0.6))
        for i in range(m):
            p = e0.lerp(e1, (i + 0.5) / m) - n * 0.13
            d = (e0 - r0).normalized()
            b.beam(p, p + d * 0.28 - n * 0.03, 0.1, 0.1, 'beam', up=n)
    elif DETAIL == 1:
        bands = max(1, math.ceil((e0 - r0).length / 2.6))
        for k in range(bands):
            f0, f1 = k / bands, (k + 1) / bands
            top = [r0.lerp(e0, f0), r1.lerp(e1, f0), r1.lerp(e1, f1), r0.lerp(e0, f1)]
            b.hexa([p - n * ROOF_T for p in top] + top, 'beam', top='shingle')
        b.beam(e0 + n * 0.05, e1 + n * 0.05, 0.12, 0.22, 'trim', up=n)
    else:
        b.hexa(low + [r0, r1, e1, e0], 'beam', top='roofboard')
    lift = n * (BOARD_T * 2 + 0.014)
    for line in glow:
        pts = [(r0.lerp(r1, t)).lerp(e0.lerp(e1, t), s) + lift for t, s in line]
        glow_strip(g, pts, n, 0.07)
    if DETAIL < 2:
        for line in inlay:
            pts = [(r0.lerp(r1, t)).lerp(e0.lerp(e1, t), s) + n * (BOARD_T * 2 + 0.004) for t, s in line]
            ribbon(b, pts, n, 0.3, 'inlay')
    return n


def gable_roof(b, g, arm, u0, u1, half, eave, pitch, ov=0.5, ov0=0.5, ov1=0.5, ends=(False, True),
               finial=1.0, panel=True, glow=(), inlay=()):
    """Gable roof over a ridge running along `arm`'s direction from u0 to u1, `half` the half width.
    Both slopes, ridge cap, and at each gable end the wall triangle, its timber frame, a rune plate,
    rake boards and a dragon. Returns the ridge height."""
    def P(u, v, z):
        return arm_point(arm, u, v, z)

    ridge, low = eave + half * pitch, eave - ov * pitch
    s, e = u0 - ov0, u1 + ov1
    for side in (-1, 1):
        roof_slope(b, g, (P(s, 0, ridge), P(e, 0, ridge), P(e, side * (half + ov), low),
                          P(s, side * (half + ov), low)), glow, inlay)
    if DETAIL < 2:
        b.beam(P(s, 0, ridge + 0.06), P(e, 0, ridge + 0.06), 0.36, 0.16, 'trim')
    for at, wall, sign, keep in ((s, u0, -1, ends[0]), (e, u1, 1, ends[1])):
        if not keep:
            continue
        out = arm_vec(arm) * sign
        b.tri_prism(P(wall, -half, eave), P(wall, half, eave), P(wall, 0, ridge), -out * 0.22, 'wall')
        if DETAIL < 2:
            for side in (-1, 1):
                b.beam(P(at, 0, ridge + 0.1), P(at, side * (half + ov), low + 0.1), 0.2, 0.3, 'trim')
        if DETAIL == 0:
            f = sign * 0.1
            tie = eave + 0.55
            b.beam(P(wall + f, -half + 0.15, tie), P(wall + f, half - 0.15, tie), 0.13, 0.15, 'beam')
            b.beam(P(wall + f, 0, tie), P(wall + f, 0, ridge - 0.12), 0.13, 0.13, 'beam')
            for side in (-1, 1):
                b.beam(P(wall + f, side * (half - 0.2), tie), P(wall + f, 0, tie + (ridge - tie) * 0.62), 0.1, 0.11, 'beam')
                b.beam(P(wall + f, side * (half * 0.5), eave + 0.02), P(wall + f, side * (half * 0.5), tie), 0.1, 0.1, 'beam')
            if panel:
                pc = P(wall + sign * 0.15, 0, tie + 0.35)
                b.beam(pc - Vector((0, 0, 0.28)), pc + Vector((0, 0, 0.28)), 0.8, 0.07, 'rune', up=out)
                rune(g, pc + out * 0.05, out, 0.5, glyph=int(b.rng.random() * 8))
        if finial and (DETAIL == 0 or (DETAIL == 1 and finial >= 1.2)):
            dragon(b, P(at + sign * 0.1, 0, ridge + 0.06), out, finial)
    return ridge


GLYPHS = [
    [((0, -.5), (0, .5)), ((0, .5), (.32, .22)), ((0, .12), (.32, -.16))],
    [((-.2, -.5), (-.2, .5)), ((-.2, .5), (.2, .28)), ((.2, .28), (.2, -.5))],
    [((0, -.5), (0, .5)), ((0, .25), (.3, 0)), ((.3, 0), (0, -.25))],
    [((-.15, -.5), (-.15, .5)), ((-.15, .3), (.25, .5)), ((-.15, .05), (.25, .25))],
    [((-.2, -.5), (-.2, .5)), ((-.2, .5), (.2, .25)), ((.2, .25), (-.2, 0)), ((-.2, 0), (.22, -.5))],
    [((.2, .4), (-.2, 0)), ((-.2, 0), (.2, -.4))],
    [((-.25, .4), (.25, -.4)), ((-.25, -.4), (.25, .4))],
    [((0, -.5), (0, .5)), ((-.2, .2), (0, .4)), ((.2, .2), (0, .4))],
]


def rune(g, centre, facing, size=0.5, glyph=0):
    """A rune glyph as glowing strokes on a wall whose outward direction is `facing`."""
    f = Vector(facing).normalized()
    side = f.cross(UP).normalized()
    c = Vector(centre) + f * 0.03
    w = 0.05 + 0.08 * size
    for (x0, y0), (x1, y1) in GLYPHS[glyph % len(GLYPHS)]:
        p0, p1 = c + side * x0 * size + UP * y0 * size, c + side * x1 * size + UP * y1 * size
        n = (p1 - p0).cross(f).normalized() * (w / 2)
        g.face([p0 - n, p1 - n, p1 + n, p0 + n], 'trim', 1.0)


def arm_box(b, arm, u0, u1, v0, v1, z0, z1, region, bottom=True):
    b.box(*arm_point(arm, (u0 + u1) / 2, (v0 + v1) / 2, z0).xy, z0, abs(u1 - u0) if arm[0] else abs(v1 - v0),
          abs(v1 - v0) if arm[0] else abs(u1 - u0), z1 - z0, region, bottom=bottom)


def build_base(b, g):
    plat = cross_outline(ARM_HALF + 0.55, REACH + 0.5, CORE + 0.55)
    course = cross_outline(ARM_HALF + 0.1, REACH + 0.1, CORE + 0.1)
    if DETAIL == 0:
        # Dark underlay: the joints between flagstones show it instead of the ground.
        b.prism(square(TERR), 0, TERR_Z - 0.012, 'stone', top='dark')
        b.prism(plat, 0, PLAT_Z - 0.012, 'stone', top='dark')
        b.paving(square(TERR - 0.5), TERR_Z, 1.0, hole=plat)
        b.block_ring(square(TERR), 0, TERR_Z + 0.1, 0.5)
        b.block_ring(plat, TERR_Z, PLAT_Z, 0.45)
        b.paving(plat, PLAT_Z, 1.0, hole=course)
        b.block_ring(course, PLAT_Z, BASE_Z, 0.3)
    elif DETAIL == 1:
        b.prism(square(TERR), 0, TERR_Z - 0.012, 'stone', top='dark')
        b.paving(square(TERR), TERR_Z, 2.0, hole=plat)
        b.prism(plat, 0, PLAT_Z - 0.012, 'stone', top='dark')
        b.paving(plat, PLAT_Z, 2.0, hole=course)
        b.prism(course, PLAT_Z, BASE_Z, 'stone')
    else:
        b.prism(square(TERR), 0, TERR_Z, 'stone', top='stone')
        b.prism(plat, 0, PLAT_Z, 'stone', top='stone')
        b.prism(course, PLAT_Z, BASE_Z, 'stone')
    if DETAIL == 2:
        return
    for arm in ARMS:
        for u0, u1, top in ((REACH + 0.5, REACH + 0.75, 0.46), (REACH + 0.75, TERR, 0.30)):
            arm_box(b, arm, u0, u1, -1.6, 1.6, TERR_Z, top, 'stone', bottom=False)
        for s in (-1, 1):
            o = arm_point(arm, 0, s * 1.8, 0)
            b.extrude_profile([(REACH + 0.5, TERR_Z), (TERR, TERR_Z), (TERR, 0.46), (REACH + 0.5, 1.0),
                               (REACH - 0.1, 1.0), (REACH - 0.1, TERR_Z)],
                              o, arm_vec(arm), arm_vec(arm).cross(UP), 0.36, 'stone')
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        x, y = sx * (TERR - 0.5), sy * (TERR - 0.5)
        b.box(x, y, 0, 0.5, 0.5, 0.75, 'stone')
        b.box(x, y, 0.75, 0.62, 0.62, 0.1, 'trim')
        b.box(x, y, 0.85, 0.3, 0.3, 0.3, 'beam')
        g.face([(x - 0.16, y - 0.16, 1.0), (x + 0.16, y - 0.16, 1.0), (x + 0.16, y + 0.16, 1.0), (x - 0.16, y + 0.16, 1.0)],
               'trim', WARM + 1.0)
        for k in range(4):
            a = k * math.pi / 2
            f = Vector((math.cos(a), math.sin(a), 0))
            s = f.cross(UP)
            c = Vector((x, y, 0.98)) + f * 0.151
            g.face([c - s * 0.15 + UP * -0.14, c + s * 0.15 + UP * -0.14, c + s * 0.15 + UP * 0.1,
                    c - s * 0.15 + UP * 0.1], 'trim', WARM + 0.8)


def portal(b, g, arm, kind):
    """Door in the end wall of an arm: framed leaf, posts, lintel, a pointed arch of trim, and glow."""
    z0, d = BASE_Z, REACH
    leaf = (z0, z0 + 2.3)
    arm_box(b, arm, d - 0.02, d + 0.1, -0.75, 0.75, *leaf, 'dark' if kind != 'blind' else 'wall')
    if DETAIL > 0:
        return
    out = arm_vec(arm)
    for k in range(-2, 3):
        b.beam(arm_point(arm, d + 0.1, k * 0.3, z0 + 0.05), arm_point(arm, d + 0.1, k * 0.3, z0 + 2.25), 0.08, 0.05,
               'beam', up=out)
    for zz in (0.55, 1.7):
        b.beam(arm_point(arm, d + 0.12, -0.75, z0 + zz), arm_point(arm, d + 0.12, 0.75, z0 + zz), 0.1, 0.11, 'trim', up=out)
    for s in (-1, 1):
        b.beam(arm_point(arm, d + 0.14, s * 0.95, z0), arm_point(arm, d + 0.14, s * 0.95, z0 + 2.75), 0.26, 0.26, 'beam', up=out)
        b.beam(arm_point(arm, d + 0.14, s * 0.98, z0 + 2.45), arm_point(arm, d + 0.14, s * 0.15, z0 + 3.25), 0.14, 0.16, 'trim', up=out)
        g.face([arm_point(arm, d + 0.27, s * 0.80, z0 + 0.05), arm_point(arm, d + 0.27, s * 0.86, z0 + 0.05),
                arm_point(arm, d + 0.27, s * 0.86, z0 + 2.4), arm_point(arm, d + 0.27, s * 0.80, z0 + 2.4)], 'trim', WARM + 1.0)
    b.beam(arm_point(arm, d + 0.14, -1.25, z0 + 2.62), arm_point(arm, d + 0.14, 1.25, z0 + 2.62), 0.28, 0.3, 'beam', up=out)
    if kind == 'glow':
        g.face([arm_point(arm, d + 0.16, -0.7, z0 + 0.05), arm_point(arm, d + 0.16, 0.7, z0 + 0.05),
                arm_point(arm, d + 0.16, 0.7, z0 + 2.25), arm_point(arm, d + 0.16, -0.7, z0 + 2.25)], 'trim', WARM + 0.7)
    else:
        rune(g, arm_point(arm, d + 0.15, 0, z0 + 3.0), out, 0.35, glyph=int(b.rng.random() * 8))


def wall_post(b, x, y, z0, z1, size=0.3):
    b.box(x, y, z0, size, size, z1 - z0, 'beam')
    if DETAIL == 0:
        for zz in (z0 + 0.5, z1 - 0.55):
            b.box(x, y, zz, size + 0.06, size + 0.06, 0.1, 'trim')
        b.box(x, y, z1, size + 0.1, size + 0.1, 0.12, 'beam')


def build_walls(b, g):
    outline = cross_outline(ARM_HALF, REACH, CORE)
    b.prism(outline, BASE_Z, WALL_Z, 'wall')
    if DETAIL > 0:
        return
    n = len(outline)
    for i in range(n):
        p, q = Vector((*outline[i], 0)), Vector((*outline[(i + 1) % n], 0))
        d = q - p
        length = d.length
        d.normalize()
        out = Vector((d.y, -d.x, 0))
        t = 0.45
        while t < length - 0.3:
            base = p + d * t + out * 0.01
            b.beam(base + Vector((0, 0, BASE_Z + 0.02)), base + Vector((0, 0, WALL_Z - 0.3)), 0.07, 0.05, 'beam',
                   up=out, bottom=False)
            t += 0.62
        for zz in (BASE_Z + 1.0, WALL_Z - 0.38):
            b.beam(p + out * 0.04 + Vector((0, 0, zz)), q + out * 0.04 + Vector((0, 0, zz)), 0.08, 0.13, 'beam')
        wall_post(b, p.x, p.y, BASE_Z, WALL_Z)


def build_core(b, g, arm_ridge):
    c = CORE
    b.box(0, 0, BASE_Z, 2 * c, 2 * c, CORE_TOP - BASE_Z, 'wall', bottom=False)
    z0, z1 = arm_ridge + 0.3, CORE_TOP - 0.5
    for arm in ARMS:
        out = arm_vec(arm)
        for k, (v0, v1) in enumerate(((-c + 0.45, -0.25), (0.25, c - 0.45))):
            pts = [arm_point(arm, c + 0.04, v0, z0), arm_point(arm, c + 0.04, v1, z0),
                   arm_point(arm, c + 0.04, v1, z1), arm_point(arm, c + 0.04, v0, z1)]
            b.face(pts, 'carve', 1.0)
            if DETAIL == 0:
                for v in (v0, v1):
                    b.beam(arm_point(arm, c + 0.07, v, z0 - 0.07), arm_point(arm, c + 0.07, v, z1 + 0.07), 0.12, 0.1, 'trim', up=out)
                for zz in (z0 - 0.07, z1 + 0.07):
                    b.beam(arm_point(arm, c + 0.07, v0 - 0.06, zz), arm_point(arm, c + 0.07, v1 + 0.06, zz), 0.12, 0.1, 'trim', up=out)
            glow = ((z0 + z1) / 2,)
            rune(g, arm_point(arm, c + 0.1, (v0 + v1) / 2, (z0 + z1) / 2), out, 0.42, glyph=k * 3 + ARMS.index(arm))
            v = v0 + 0.2 if k == 0 else v1 - 0.2
            glow_strip(g, [arm_point(arm, c + 0.12, v, z0 + 0.15), arm_point(arm, c + 0.12, v, z1 - 0.15)], out, 0.16, WARM + 1.0)
    if DETAIL == 0:
        for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            wall_post(b, sx * c, sy * c, arm_ridge - 0.2, CORE_TOP, 0.4)
        b.box(0, 0, CORE_TOP - 0.32, 2 * c + 0.3, 2 * c + 0.3, 0.32, 'beam')


def build_tower(b, g):
    tx, ty, tr, n = CORE + 0.45, CORE + 0.45, 1.1, 8 if DETAIL < 2 else 6
    ring = lambda k: (tx + math.cos(2 * math.pi * k / n) * tr, ty + math.sin(2 * math.pi * k / n) * tr)
    pts = [ring(k) for k in range(n)]
    big = [(tx + (x - tx) * 1.14, ty + (y - ty) * 1.14) for x, y in pts]
    b.prism(big, 0, 0.9, 'stone', top='stone')
    b.prism(pts, 0.9, 7.4, 'wall')
    if DETAIL == 0:
        b.prism([(tx + (x - tx) * 1.1, ty + (y - ty) * 1.1) for x, y in pts], 6.3, 7.0, 'rune')
        for k, (x, y) in enumerate(pts):
            b.box(x, y, 0.9, 0.16, 0.16, 6.5, 'beam')
            for zz in (2.2, 4.6):
                b.box(x, y, zz, 0.22, 0.22, 0.1, 'trim')
        for k in range(0, n, 2):
            a = 2 * math.pi * (k + 0.5) / n
            rune(g, (tx + math.cos(a) * tr * 1.11, ty + math.sin(a) * tr * 1.11, 6.65), (math.cos(a), math.sin(a), 0), 0.36, glyph=k)
    apex = Vector((tx, ty, 10.2))
    eave = [Vector((tx + (x - tx) * 1.35, ty + (y - ty) * 1.35, 7.1)) for x, y in pts]
    for k in range(n):
        a, c = eave[k], eave[(k + 1) % n]
        nrm = (c - a).cross(apex - a).normalized()
        if nrm.z < 0:
            nrm = -nrm
        b.tri_prism(a, c, apex, -nrm * 0.12, 'roofboard' if DETAIL else 'shingle')
        if DETAIL == 0:
            b.beam(a + nrm * 0.03, apex + nrm * 0.03, 0.12, 0.1, 'trim', up=nrm)
            for f in (0.3, 0.6):
                p0, p1 = a.lerp(apex, f), c.lerp(apex, f)
                b.beam(p0 + nrm * 0.03, p1 + nrm * 0.03, 0.1, 0.07, 'beam', up=nrm)
    if DETAIL < 2:
        b.beam(apex - Vector((0, 0, 0.1)), apex + Vector((0, 0, 1.0)), 0.14, 0.14, 'trim')
        g.face([(apex.x - .12, apex.y - .12, 10.5), (apex.x + .12, apex.y - .12, 10.5), (apex.x + .12, apex.y + .12, 10.5),
                (apex.x - .12, apex.y + .12, 10.5)], 'trim', 1.0)


def build_temple(detail=0):
    global DETAIL
    DETAIL = detail
    b, g = Builder(11), Builder(5)
    build_base(b, g)
    build_walls(b, g)

    arm_glow = [[(0.05, 0.88), (0.95, 0.88)]]
    arm_ridge = 0.0
    for k, arm in enumerate(ARMS):
        arm_ridge = gable_roof(b, g, arm, CORE - 0.2, REACH, ARM_HALF, WALL_Z, ARM_PITCH, ov0=0, ends=(False, True),
                               finial=1.0, glow=arm_glow, inlay=[[(0.1, 0.7), (0.9, 0.7)]])
        portal(b, g, arm, ('glow', 'blind', 'open', 'blind')[k])

    build_core(b, g, arm_ridge)
    main_glow = [[(0.04, 0.9), (0.96, 0.9)], [(0.18, 0.42), (0.4, 0.42), (0.4, 0.66), (0.62, 0.66), (0.62, 0.42), (0.84, 0.42)]]
    ridge = 0.0
    for arm in ((0, 1), (1, 0)):
        ridge = gable_roof(b, g, arm, -CORE, CORE, CORE, CORE_TOP, MAIN_PITCH, ends=(True, True), finial=1.3, glow=main_glow,
                           inlay=[[(0.04, 0.62), (0.96, 0.62)], [(0.12, 0.28), (0.34, 0.28), (0.34, 0.52), (0.5, 0.52), (0.5, 0.28), (0.66, 0.28), (0.66, 0.52), (0.88, 0.52)]])

    # Open lantern on the ridge crossing, under the orb the game floats above it.
    top = ridge + 1.4
    for x in (-0.8, 0.8):
        for y in (-0.8, 0.8):
            if detail < 2:
                wall_post(b, x, y, ridge - 0.6, top, 0.22)
    if detail == 2:
        b.box(0, 0, ridge - 0.6, 1.8, 1.8, 2.0, 'wall')
    elif detail == 0:
        for (x0, y0), (x1, y1) in (((-0.9, -0.8), (0.9, -0.8)), ((-0.9, 0.8), (0.9, 0.8)),
                                   ((-0.8, -0.9), (-0.8, 0.9)), ((0.8, -0.9), (0.8, 0.9))):
            for zz in (top, ridge + 0.1):
                b.beam((x0, y0, zz), (x1, y1, zz), 0.14, 0.14, 'beam')
        for k, (fx, fy) in enumerate(((0, -1), (0, 1), (-1, 0), (1, 0))):
            rune(g, (fx * 0.86, fy * 0.86, ridge + 0.7), (fx, fy, 0), 0.5, glyph=k)
    gable_roof(b, g, (0, 1), -0.9, 0.9, 0.95, top + 0.1, 1.2, ov=0.15, ov0=0.15, ov1=0.15, ends=(True, True),
               finial=0.6)
    build_tower(b, g)
    global CROWN
    CROWN = top + 0.1 + 0.95 * 1.2 + 2.2  # centre of the orb the game hovers above the lantern roof
    return b, g


GLOW_COLOR = (0.35, 0.95, 0.9, 1.0)
WARM_COLOR = (1.0, 0.5, 0.12, 1.0)
CROWN = 0.0


def region_materials():
    mats = []
    for name, col in REGIONS.items():
        mat = bpy.data.materials.get('tpl_' + name) or bpy.data.materials.new('tpl_' + name)
        mat.diffuse_color = (*col, 1.0)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            bsdf.inputs['Base Color'].default_value = (*col, 1.0)
            bsdf.inputs['Roughness'].default_value = 0.9
        mats.append(mat)
    return mats


def to_object(builder, name, collection, mats):
    bm = builder.bm
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for m in mats:
        mesh.materials.append(m)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def rebuild(detail=0):
    coll = bpy.data.collections.get('temple')
    if coll:
        for obj in list(coll.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        coll = bpy.data.collections.new('temple')
        bpy.context.scene.collection.children.link(coll)
    body, glow = build_temple(detail)
    mats = region_materials()
    temple = to_object(body, 'temple', coll, mats)
    # Exported as glTF extras on the temple node (glTF axes: x, z = Blender x, -y), read by the game:
    # footprint (inside of the walls, m) for planning and the plinth, door centre, builder standing spots.
    temple['footprint'] = [2 * TERR, 2 * TERR]
    temple['door'] = [0.0, TERR]
    temple['crownY'] = CROWN  # glTF y (up) of the player orb the game hovers over the roof
    temple['workSlots'] = [[-3.2, TERR + 1.2], [3.2, TERR + 1.2], [-TERR - 1.2, -3.2], [TERR + 1.2, 3.2]]
    glow_mat = bpy.data.materials.get('tpl_glow') or bpy.data.materials.new('tpl_glow')
    glow_mat.diffuse_color = GLOW_COLOR
    glow_mat.use_nodes = True
    nodes, links = glow_mat.node_tree.nodes, glow_mat.node_tree.links
    vc = nodes.get('vcol') or nodes.new('ShaderNodeVertexColor')
    vc.name = 'vcol'
    vc.layer_name = 'Col'
    bsdf = nodes['Principled BSDF']
    links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    links.new(vc.outputs['Color'], bsdf.inputs['Emission Color'])
    bsdf.inputs['Emission Strength'].default_value = 4.0
    # Warm lights get their own material (slot 1): the game lights them at dusk only, runes keep a day glow.
    warm_mat = bpy.data.materials.get('tpl_glow_warm') or bpy.data.materials.new('tpl_glow_warm')
    warm_mat.diffuse_color = WARM_COLOR
    warm_mat.use_nodes = True
    wn, wl = warm_mat.node_tree.nodes, warm_mat.node_tree.links
    wvc = wn.get('vcol') or wn.new('ShaderNodeVertexColor')
    wvc.name = 'vcol'
    wvc.layer_name = 'Col'
    wbsdf = wn['Principled BSDF']
    wl.new(wvc.outputs['Color'], wbsdf.inputs['Base Color'])
    wl.new(wvc.outputs['Color'], wbsdf.inputs['Emission Color'])
    wbsdf.inputs['Emission Strength'].default_value = 4.0
    glow_obj = to_object(glow, 'temple_glow', coll, [glow_mat, warm_mat])
    col = glow_obj.data.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    tone = glow_obj.data.attributes.get('tone')
    for poly in glow_obj.data.polygons:
        t = tone.data[poly.index].value if tone else 1.0
        warm = t >= WARM / 2
        if warm:
            t -= WARM
        poly.material_index = 1 if warm else 0
        base = WARM_COLOR if warm else GLOW_COLOR
        for li in poly.loop_indices:
            col.data[li].color = (base[0] * t, base[1] * t, base[2] * t, 1.0)
    if tone:
        glow_obj.data.attributes.remove(tone)
    tris = sum(len(p.vertices) - 2 for p in temple.data.polygons)
    glow_tris = sum(len(p.vertices) - 2 for p in glow_obj.data.polygons)
    return {'tris': tris, 'glow_tris': glow_tris, 'dims': list(temple.dimensions)}


def preview(path, azimuth=-40.0, elevation=28.0, size=900, color='MATERIAL', target=(0, 0, 8.0), scale=29):
    """Workbench render in surface-type colours from the reference's three-quarter view."""
    scene = bpy.context.scene
    cam = bpy.data.objects.get('preview_cam')
    if not cam:
        cam = bpy.data.objects.new('preview_cam', bpy.data.cameras.new('preview_cam'))
        scene.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = scale
    az, el = math.radians(azimuth), math.radians(elevation)
    target = Vector(target)
    dist = 60
    cam.location = target + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.engine = 'BLENDER_WORKBENCH'
    shading = scene.display.shading
    shading.light = 'STUDIO'
    shading.color_type = color
    shading.show_cavity = True
    shading.show_shadows = True
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.film_transparent = True
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def export_one(name, objs, out_dir):
    import os

    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(out_dir, name + '.gltf'),
        export_format='GLTF_SEPARATE',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_extras=True,
        export_normals=True,
        export_texcoords=True,
        export_vertex_color='MATERIAL',
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )


def make(out_dir, atlas, atlas_png):
    """Build and export temple.gltf, temple_lod1.gltf, temple_lod2.gltf and temple_glow.gltf into out_dir.
    `atlas` is the namespace of village_atlas.py. Then bake each with bake-play-props --no-lod."""
    image, strips = atlas['paint_atlas'](atlas_png)
    counts = {}
    for detail, name in ((2, 'temple_lod2'), (1, 'temple_lod1'), (0, 'temple')):
        info = rebuild(detail)
        temple = bpy.data.objects['temple']
        atlas['apply_atlas'](temple, image, strips)
        export_one(name, [temple], out_dir)
        counts[name] = info['tris']
    export_one('temple_glow', [bpy.data.objects['temple_glow']], out_dir)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)
    return counts
