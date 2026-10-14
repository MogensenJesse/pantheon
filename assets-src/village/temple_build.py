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
    'wall': (0.30, 0.20, 0.13),  # dark vertical planks
    'plank': (0.36, 0.24, 0.15),  # single boards, doors, steps
    'beam': (0.22, 0.14, 0.09),  # posts, frames, rake boards
    'trim': (0.42, 0.30, 0.19),  # lighter weathered wood
    'stone': (0.52, 0.52, 0.50),
    'stone_fit': (0.52, 0.52, 0.50),  # the stone strip stretched over a face (flagstones)
    'turf': (0.36, 0.45, 0.14),  # grass roof top
    'soil': (0.20, 0.14, 0.09),  # turf slab edges and underside
    'thatch': (0.74, 0.58, 0.28),  # straw roof courses
    'shingle': (0.21, 0.20, 0.22),  # dark fish-scale roof, laid in bands
    'shingle_far': (0.21, 0.20, 0.22),  # the same strip stretched over a face (far LODs)
    'carve': (0.50, 0.20, 0.13),  # carved interlace
    'rune': (0.27, 0.18, 0.12),
    'dark': (0.05, 0.04, 0.04),
    'horn': (0.75, 0.73, 0.66),
    'rope': (0.62, 0.48, 0.30),
}
REGION_INDEX = {name: i for i, name in enumerate(REGIONS)}

# Plan (m): the walls reach REACH along each arm; the stone terrace is the game footprint (2 * TERR).
ARM_HALF, REACH, CORE = 2.7, 6.0, 3.6
TERR, TERR_Z, PLAT_Z, BASE_Z = 7.0, 0.14, 0.62, 0.8
WALL_Z, ARM_PITCH, CORE_TOP, MAIN_PITCH = 3.4, 0.98, 8.4, 1.05
ROOF_T = 0.2
# Organic variance (full detail only): long timbers bow sideways and up by up to BOW of their length (at most BOW_MAX m)
# and taper a little; the roofs sag, see RoofShape.
BOW, BOW_MAX = 0.012, 0.035
ROOF_SAG, ROOF_SAG_MAX = 0.05, 0.26  # slope sag between ridge and wall line: share of the slope length, and the most (m)
RIDGE_DIP, RIDGE_DIP_MAX = 0.012, 0.12  # ridge dip at mid-length: share of the ridge length, and the most (m)
# Strips whose texture runs along the piece (boards, beams, trim); keep in sync with LONG in village_atlas.py.
LONG_REGIONS = ('plank', 'beam', 'trim', 'carve', 'horn', 'rope')
DETAIL = 0
UP = Vector((0, 0, 1))
WARM = 10.0  # glow-face tone offset: door, window and lantern lights (warm), not runes and seams (cyan)
ARMS = ((0, -1), (0, 1), (-1, 0), (1, 0))  # front (the door side), back, left, right


class Builder:
    def __init__(self, seed=1):
        self.bm = bmesh.new()
        self.tone = self.bm.faces.layers.float.new('tone')
        self.uoff = self.bm.faces.layers.float.new('uoff')  # texture U shift per face (in texture widths)
        self.fixed = self.bm.faces.layers.int.new('fixed')  # 1 = lone face that keeps its winding (see quad)
        self.rng = random.Random(seed)
        self.organic = True  # full detail only: timbers bow, stones are rough, roofs sag (the build functions switch it off)
        self._uv = self._preuv = None  # made on the first face_uv

    def jitter(self, amount=0.12):
        return 1 + (self.rng.random() - 0.5) * 2 * amount

    def face(self, pts, region, tone=None):
        f = self.bm.faces.new([self.bm.verts.new(Vector(p)) for p in pts])
        f.material_index = REGION_INDEX[region]
        f[self.tone] = tone if tone is not None else self.jitter(0.05)
        return f

    def quad(self, pts, region, want, tone=None):
        """A lone single-sided quad wound to face `want`, kept out of the normal recalculation (which flips about half of
        the faces that no other face touches)."""
        p = [Vector(q) for q in pts]
        if (p[1] - p[0]).cross(p[2] - p[1]).dot(Vector(want)) < 0:
            p.reverse()
        f = self.face(p, region, tone)
        f[self.fixed] = 1
        return f

    def face_uv(self, pts, region, uvs, tone=None, shift=0.0):
        """A face whose texture coordinates are given per corner as (metres along the strip, 0..1 up or across the strip);
        the UV pass only scales them into the atlas. Lets a surface be cut into as many faces as its shape needs."""
        if self._uv is None:
            self._uv = self.bm.loops.layers.uv.new('UVMap')
            self._preuv = self.bm.faces.layers.int.new('preuv')
        f = self.face(pts, region, tone)
        f[self._preuv] = 1
        f[self.uoff] = shift
        for lp, uv in zip(f.loops, uvs):
            lp[self._uv].uv = uv
        return f

    def rough(self, p, amp):
        """A point nudged by up to `amp` in every direction (uneven stones)."""
        return Vector(p) + Vector((self.rng.random() - 0.5, self.rng.random() - 0.5, self.rng.random() - 0.5)) * (2 * amp)

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

    def sweep(self, pts, w, h, region, up=UP, tone=None, scales=None):
        """Box of section w x h swept along the polyline `pts` (one mitred ring per point, both ends capped). `scales` gives a
        (width, height) factor per point for a taper. The texture of long pieces runs along the polyline in metres."""
        pts = [Vector(p) for p in pts]
        up = Vector(up)
        rings, dist = [], [0.0]
        for i, p in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
            side = d.cross(up)
            if side.length < 1e-6:
                side = d.cross(Vector((1, 0, 0)))
            side.normalize()
            upv = side.cross(d).normalized()
            sw, sh = scales[i] if scales else (1.0, 1.0)
            sv, uv = side * (w * sw / 2), upv * (h * sh / 2)
            rings.append([p - sv - uv, p + sv - uv, p + sv + uv, p - sv + uv])
            if i:
                dist.append(dist[-1] + (p - pts[i - 1]).length)
        tone = tone if tone is not None else self.jitter()
        along = region in LONG_REGIONS
        for i in range(len(pts) - 1):
            for k in range(4):
                j = (k + 1) % 4
                quad = [rings[i][k], rings[i + 1][k], rings[i + 1][j], rings[i][j]]
                if along:
                    self.face_uv(quad, region, [(dist[i], 0.0), (dist[i + 1], 0.0), (dist[i + 1], 1.0), (dist[i], 1.0)], tone)
                else:
                    self.face(quad, region, tone)
        self.face(list(reversed(rings[0])), region, tone)
        self.face(rings[-1], region, tone)

    def beam(self, a, b, w, h, region, up=UP, bottom=True, tone=None, bow=None):
        """Box of section w (sideways) x h (along `up`) from point a to point b. In the full detail a long timber (region 'beam',
        at least 9 cm thick, over 1.5 m long) is not quite straight: it bows a little sideways and up, tapers and varies in section.
        `bow` = share of the length it may bow (0 = dead straight)."""
        a, b = Vector(a), Vector(b)
        length = (b - a).length
        if bow is None:
            bow = BOW if (self.organic and region == 'beam' and length > 1.5 and min(w, h) >= 0.09) else 0.0
        d = (b - a).normalized()
        side = d.cross(Vector(up))
        if side.length < 1e-6:
            side = d.cross(Vector((1, 0, 0)))
        side.normalize()
        upv = side.cross(d).normalized()
        if bow:
            n = max(2, min(3, round(length / 1.2)))
            amp = [max(-BOW_MAX, min(BOW_MAX, bow * length * (self.rng.random() * 2 - 1))) for _ in range(2)]
            taper = (self.rng.random() * 2 - 1) * 0.07
            pts, scales = [], []
            for i in range(n + 1):
                t = i / n
                k = 4 * t * (1 - t)
                pts.append(a + (b - a) * t + side * amp[0] * k + upv * amp[1] * k)
                scales.append((1 + taper * (1 - 2 * t), 1 + taper * (1 - 2 * t) * 0.7))
            self.sweep(pts, w * self.jitter(0.04), h * self.jitter(0.04), region, up=upv, tone=tone, scales=scales)  # upv: stable on posts
            return
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

    def paving(self, outline, z, cell, region='stone_fit', hole=None):
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
                self.quad([(x0 + g, y0 + g, z + dz), (x0 + cell - g, y0 + g, z + dz),
                           (x0 + cell - g, y0 + cell - g, z + dz), (x0 + g, y0 + cell - g, z + dz)],
                          region, (0, 0, 1), self.jitter(0.1))

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
                corners = [a, b, b - out * depth, a - out * depth, a + h, b + h, b - out * depth + h, a - out * depth + h]
                if self.organic:  # no two stones alike: every corner nudged
                    corners = [self.rough(p, 0.02) for p in corners]
                self.hexa(corners, region, bottom=False, tone=self.jitter(0.1))
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


# Dragon-head finial in (u outward, v up) metres before scaling: a neck rising from the apex, ears swept back and an
# open mouth at the top.
DRAGON = [(0.0, 0.0), (0.02, 0.45), (0.1, 0.85), (0.3, 1.15), (0.48, 1.38), (0.6, 1.75), (0.74, 1.4), (1.05, 1.36), (1.4, 1.3),
          (1.72, 1.18), (1.95, 1.02), (1.98, 0.9), (1.88, 0.86), (1.5, 0.95), (1.9, 0.7), (1.8, 0.6), (1.4, 0.7), (1.05, 0.72),
          (0.62, 0.62), (0.45, 0.45), (0.36, 0.2), (0.34, 0.0)]


def dragon(b, apex, outward, scale):
    """Carved dragon-head finial rising from a gable apex and facing outward."""
    pts = [(u * scale * 0.85, v * scale * 0.85) for u, v in DRAGON]
    o = Vector(outward).normalized()
    b.extrude_profile(pts, Vector(apex) - o * 0.12 * scale, o, o.cross(UP), 0.2 * scale, 'beam')


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


def _ss(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


class RoofShape:
    """Height of one roof plane over its flat plane, along its normal (s 0..1 along the ridge, f 0..1 from ridge to eave): a swoop
    (one parabola, level with the flat plane at the ridge and at the wall line `f_wall`, `sag` below it halfway between, so the
    slope is steepest near the ridge, and flicking up over the overhang), a dip along the ridge (`sink`, vertical), soft lumps,
    dents and an uneven eave. Lumps, dents and the eave wave fade out at the ridge and at the two rake edges, so the neighbouring
    slope and the rake boards meet the same edge curve; right over the wall line nothing sags, so the wall tops stay covered."""

    def __init__(self, rng, slope, width, sag, dip, lump=0.0, dents=0, dent_depth=(0.04, 0.09), wave=0.0, f_wall=1.0):
        self.slope, self.width, self.sag, self.dip, self.lump, self.wave, self.f_wall = slope, width, sag, dip, lump, wave, f_wall
        self.waves = []
        for _ in range(3):
            ang = rng.random() * math.tau
            self.waves.append((math.tau / rng.uniform(1.2, 2.6), math.cos(ang), math.sin(ang), rng.random() * math.tau))
        self.dents = [(rng.uniform(0.12, 0.88) * width, rng.uniform(0.15, 0.85) * slope, rng.uniform(0.4, 0.85),
                       rng.uniform(*dent_depth)) for _ in range(dents)]
        self.phase = rng.random() * math.tau

    def swoop(self, f):
        return 4 * self.sag * f * (f - self.f_wall) / self.f_wall ** 2

    def steepening(self):
        """How much steeper than the flat plane the slope starts at the ridge (rise per metre of slope)."""
        return 4 * self.sag / (self.f_wall * self.slope)

    def sink(self, s, f):
        """Vertical drop of the ridge dip, fading out down the slope."""
        return -self.dip * math.sin(math.pi * s) * (1 - f) ** 2

    def h(self, s, f):
        x, y = s * self.width, f * self.slope
        fade = _ss(x / 0.35) * _ss((self.width - x) / 0.35) * _ss(y / 0.35)
        bumps = self.lump * sum(math.sin(k * (ax * x + ay * y) + ph) for k, ax, ay, ph in self.waves) / 3
        dents = -sum(d * math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * r * r)) for cx, cy, r, d in self.dents)
        eave = self.wave * math.sin(math.tau * x / 2.2 + self.phase) * _ss(x / 0.6) * _ss((self.width - x) / 0.6) * f ** 4
        near = _ss(abs(y - self.f_wall * self.slope) / 0.4)  # 0 right over the wall line
        detail = fade * (bumps + dents)
        return self.swoop(f) + (detail * near if detail < 0 else detail) + eave + 0.025 * (1 - near)


def roof_shape(rng, slope, width, dip, lump=0.0, dents=0, dent_depth=(0.04, 0.09), wave=0.0, f_wall=1.0):
    """A RoofShape with the usual sag for a slope this long (a little different on every slope). `f_wall` = share of the slope
    from the ridge to the wall line (1 = no overhang to flick up)."""
    sag = min(ROOF_SAG * slope, ROOF_SAG_MAX) * rng.uniform(0.75, 1.25)
    return RoofShape(rng, slope, width, sag, dip, lump, dents, dent_depth, wave, f_wall)


def ridge_dip(width):
    return min(RIDGE_DIP * width, RIDGE_DIP_MAX)


def sag_path(p0, p1, normal, shape, n=8):
    """Points from the apex p0 to the eave p1 bowed along `normal` by the swoop of a roof edge (a RoofShape)."""
    p0, p1, normal = Vector(p0), Vector(p1), Vector(normal)
    return [p0.lerp(p1, i / n) + normal * shape.swoop(i / n) for i in range(n + 1)]


def gable_edge(shapes, half, ov, pitch, s_wall, x, reach=0.1, margin=0.0):
    """How far (m, vertical) the top surface of the sagging roof lies over its flat plane above lateral position x (m from the
    ridge line, the sign picks the slope) at a gable wall plane s_wall (0..1 along the ridge): the lowest within `reach` m along
    the ridge, less `margin`. A wall or board that ends this far under the flat plane stays inside the roof slab."""
    sh = shapes[1 if x >= 0 else -1]
    f, d = min(1.0, abs(x) / (half + ov)), reach / sh.width
    return min(sh.h(s_wall + k * d, f) * math.hypot(1, pitch) + sh.sink(s_wall + k * d, f) for k in (-1, 0, 1)) - margin


def banded_slab(b, r0, r1, e1, e0, top, edge, band, thick, step=0.0, cols=1, lump=0.0, shape=None, vm=None,
                row_len=0.4, col_len=1.0):
    """One roof plane (ridge start, ridge end, eave end, eave start) as a closed slab `thick` under its surface. The strips are
    metric, so the top is laid in bands of at most `band` m down the slope (a band is one strip high), every band with its own
    texture shift. `step` raises the foot of each band (shingle and thatch courses).
    Without a `shape` each band is one flat quad per column (`cols`, `lump` shakes the inner corners). With a `shape` (a
    RoofShape) the surface follows it and is cut into quads of about `row_len` x `col_len` m with texture coordinates given
    here, so the texture runs on unbroken whatever the cut. `vm` = metres of strip height (default `band`).
    Returns the normal of the flat plane."""
    r0, r1, e1, e0 = (Vector(p) for p in (r0, r1, e1, e0))
    n = (r1 - r0).cross(e0 - r0).normalized()
    if n.z < 0:
        n = -n
    if shape is None:
        nb = max(1, math.ceil((e0 - r0).length / band))
        prof = [(0.0, 0.0)]  # (fraction down the slope, height over the plane): a ramp then a riser per course
        for k in range(nb):
            prof.append(((k + 1) / nb, step))
            if step and k < nb - 1:
                prof.append(((k + 1) / nb, 0.0))
        last = len(prof) - 1
        grid = [[r0.lerp(e0, f).lerp(r1.lerp(e1, f), j / cols) + n * (h + ((b.rng.random() - 0.5) * lump if 0 < i < last and 0 < j < cols else 0.0))
                 for j in range(cols + 1)] for i, (f, h) in enumerate(prof)]
        left, right = [row[0] for row in grid], [row[-1] for row in grid]
        low = [p - n * thick for p in (r0, r1, e1, e0)]
        b.face(low, edge, 0.7)
        b.face([low[3], low[2], right[-1], left[-1]], edge)
        b.face([low[0], low[1], right[0], left[0]], edge)
        b.face([low[0], low[3]] + left[::-1], edge)
        b.face([low[1], low[2]] + right[::-1], edge)
        for i in range(last):
            riser = prof[i][0] == prof[i + 1][0]
            shift, tone = b.rng.random(), 0.72 if riser else 0.9 + b.rng.random() * 0.2
            for j in range(cols):
                f = b.face([grid[i][j], grid[i][j + 1], grid[i + 1][j + 1], grid[i + 1][j]], top, tone * (1 + (b.rng.random() - 0.5) * 0.06))
                f[b.uoff] = shift
        return n

    slope = ((e0 - r0).length + (e1 - r1).length) / 2
    width = max((r1 - r0).length, (e1 - e0).length)
    nb = max(1, math.ceil(slope / band))
    lb = slope / nb
    vm = vm or band
    rows, ncol = max(1, math.ceil(lb / row_len)), max(1, math.ceil(width / col_len))
    ud = (e1 - e0).normalized() if (e1 - e0).length > 1e-6 else (r1 - r0).normalized()

    def base(s, f):
        return r0.lerp(r1, s).lerp(e0.lerp(e1, s), f)

    def pos(s, f, hs=0.0):
        return base(s, f) + n * (hs + shape.h(s, f)) + Vector((0, 0, shape.sink(s, f)))

    def um(s, f):
        return base(s, f).dot(ud)

    prof = []  # (fraction down the slope, height of the course foot) along a rake edge, ridge to eave
    for k in range(nb):
        shift, tone_band = b.rng.random(), 0.9 + b.rng.random() * 0.2
        for m in range(rows):
            t0, t1 = m / rows, (m + 1) / rows
            fa, fb, ha, hb_ = (k + t0) / nb, (k + t1) / nb, step * t0, step * t1
            va, vb = (1 - t0) * lb / vm, (1 - t1) * lb / vm
            for j in range(ncol):
                s0, s1 = j / ncol, (j + 1) / ncol
                b.face_uv([pos(s0, fa, ha), pos(s1, fa, ha), pos(s1, fb, hb_), pos(s0, fb, hb_)], top,
                          [(um(s0, fa), va), (um(s1, fa), va), (um(s1, fb), vb), (um(s0, fb), vb)],
                          tone_band * (1 + (b.rng.random() - 0.5) * 0.06), shift)
        if step and k < nb - 1:
            f = (k + 1) / nb
            for j in range(ncol):
                s0, s1 = j / ncol, (j + 1) / ncol
                b.face_uv([pos(s0, f, step), pos(s1, f, step), pos(s1, f, 0.0), pos(s0, f, 0.0)], top,
                          [(um(s0, f), step / vm), (um(s1, f), step / vm), (um(s1, f), 0.0), (um(s0, f), 0.0)], 0.72, shift)
        for m in range(rows + 1):
            item = ((k + m / rows) / nb, step * m / rows)
            if not prof or prof[-1] != item:
                prof.append(item)

    ur, uc = max(2, math.ceil(slope / 0.9)), max(1, math.ceil(width / 3.0))

    def under(s, f):
        return base(s, f) + n * (shape.swoop(f) - thick) + Vector((0, 0, shape.sink(s, f)))

    ends = [under(0.0, i / ur) for i in range(ur, -1, -1)]
    b.face([pos(0.0, f, hs) for f, hs in prof] + ends, edge)
    b.face([pos(1.0, f, hs) for f, hs in prof] + [under(1.0, i / ur) for i in range(ur, -1, -1)], edge)
    b.face([pos(j / ncol, 1.0, step) for j in range(ncol + 1)] + [under(j / uc, 1.0) for j in range(uc, -1, -1)], edge)
    b.face([pos(j / ncol, 0.0, 0.0) for j in range(ncol + 1)] + [under(j / uc, 0.0) for j in range(uc, -1, -1)], edge)
    for i in range(ur):
        for j in range(uc):
            f0, f1, s0, s1 = i / ur, (i + 1) / ur, j / uc, (j + 1) / uc
            b.face([under(s0, f0), under(s1, f0), under(s1, f1), under(s0, f1)], edge, 0.7)
    return n


def roof_slope(b, g, q, glow=(), shape=None):
    """One roof plane q = (ridge start, ridge end, eave end, eave start): a slab of dark scale shingles laid in stepped
    courses (full, following `shape` when given), plain banded slabs (mid) or one plain slab (far), with a fascia and rafter ends
    under the eave. `glow` lists polylines in (along the ridge 0..1, down the slope 0..1) laid as glowing ribbons."""
    r0, r1, e1, e0 = [Vector(p) for p in q]
    if DETAIL == 0:
        n = banded_slab(b, r0, r1, e1, e0, 'shingle', 'beam', 0.4, ROOF_T, step=0.05, shape=shape, vm=0.4, row_len=0.4, col_len=3.0)
        fascia = (e0 + n * 0.06 + (e0 - r0).normalized() * 0.07, e1 + n * 0.06 + (e1 - r1).normalized() * 0.07)
        b.beam(fascia[0], fascia[1], 0.12, 0.22, 'beam', up=n, bow=0)
        m = max(2, round((e1 - e0).length / 0.6))
        for i in range(m):
            p = e0.lerp(e1, (i + 0.5) / m) - n * 0.13
            d = (e0 - r0).normalized()
            b.beam(p, p + d * 0.28 - n * 0.03, 0.1, 0.1, 'beam', up=n)
    else:
        n = (r1 - r0).cross(e0 - r0).normalized()
        if n.z < 0:
            n = -n
        bands = max(1, math.ceil((e0 - r0).length / 2.6)) if DETAIL == 1 else 1
        for k in range(bands):
            f0, f1 = k / bands, (k + 1) / bands
            top = [r0.lerp(e0, f0), r1.lerp(e1, f0), r1.lerp(e1, f1), r0.lerp(e0, f1)]
            b.hexa([p - n * ROOF_T for p in top] + top, 'beam', top='shingle_far')
        if DETAIL == 1:
            b.beam(e0 + n * 0.05, e1 + n * 0.05, 0.12, 0.22, 'beam', up=n)
    width, slope = max((r1 - r0).length, (e1 - e0).length), (e0 - r0).length
    for line in glow:
        pts = []
        for (t0, s0), (t1, s1) in zip(line, line[1:]):
            k = max(1, math.ceil(max(abs(t1 - t0) * width, abs(s1 - s0) * slope) / 0.8))
            pts += [(t0 + (t1 - t0) * i / k, s0 + (s1 - s0) * i / k) for i in range(k)]
        pts.append(line[-1])
        ribbon_pts = [(r0.lerp(r1, t)).lerp(e0.lerp(e1, t), s) + n * (0.09 + (shape.h(t, s) if shape else 0.0))
                      + Vector((0, 0, shape.sink(t, s) if shape else 0.0)) for t, s in pts]
        glow_strip(g, ribbon_pts, n, 0.07)
    return n


def gable_roof(b, g, arm, u0, u1, half, eave, pitch, ov=0.5, ov0=0.5, ov1=0.5, ends=(False, True),
               finial=1.0, panel=True, glow=()):
    """Gable roof over a ridge running along `arm`'s direction from u0 to u1, `half` the half width.
    Both slopes, ridge cap, and at each gable end the wall triangle, its timber frame, a rune plate,
    rake boards and a dragon. In the full detail the slopes sag and the ridge dips. Returns the ridge height."""
    def P(u, v, z):
        return arm_point(arm, u, v, z)

    ridge, low = eave + half * pitch, eave - ov * pitch
    s, e = u0 - ov0, u1 + ov1
    shapes, dip = {}, 0.0
    if b.organic:
        slope, width = math.hypot(half + ov, ridge - low), e - s
        dip = ridge_dip(width)
        f_wall = 1 - ov * math.hypot(1, pitch) / slope
        shapes = {side: roof_shape(b.rng, slope, width, dip, lump=0.012, f_wall=f_wall) for side in (-1, 1)}
    for side in (-1, 1):
        roof_slope(b, g, (P(s, 0, ridge), P(e, 0, ridge), P(e, side * (half + ov), low),
                          P(s, side * (half + ov), low)), glow, shapes.get(side))
    if DETAIL < 2:
        if shapes:
            seg = max(2, round((e - s) / 0.8))
            b.sweep([P(s + (e - s) * i / seg, 0, ridge + 0.06) + UP * (-dip * math.sin(math.pi * i / seg)) for i in range(seg + 1)],
                    0.4, 0.2, 'beam')
        else:
            b.beam(P(s, 0, ridge + 0.06), P(e, 0, ridge + 0.06), 0.4, 0.2, 'beam')
    for at, wall, sign, keep in ((s, u0, -1, ends[0]), (e, u1, 1, ends[1])):
        if not keep:
            continue
        out = arm_vec(arm) * sign
        if shapes:  # the slanted top of the wall follows the sagging roof, just under its surface
            s_wall = (wall - s) / (e - s)
            top = [(x, ridge - pitch * abs(x) + gable_edge(shapes, half, ov, pitch, s_wall, x, 0.2, 0.05))
                   for x in (half * (1 - i / 8) for i in range(1, 16))]
            b.extrude_profile([(-half, eave), (half, eave)] + top, P(wall, 0, 0) - out * 0.11, P(wall, 1, 0) - P(wall, 0, 0), out, 0.22, 'wall')
        else:
            b.tri_prism(P(wall, -half, eave), P(wall, half, eave), P(wall, 0, ridge), -out * 0.22, 'wall')
        if DETAIL < 2:
            for side in (-1, 1):
                pa, pe = P(at, 0, ridge + 0.1), P(at, side * (half + ov), low + 0.1)
                if shapes:
                    nrm = (pe - pa).cross(out).normalized()
                    if nrm.z < 0:
                        nrm = -nrm
                    b.sweep(sag_path(pa, pe, nrm, shapes[side]), 0.26, 0.34, 'beam')
                else:
                    b.beam(pa, pe, 0.26, 0.34, 'beam')
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
                              o, arm_vec(arm), arm_vec(arm).cross(UP), 0.36, 'stone_fit')
    for sx, sy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        x, y = sx * (TERR - 0.5), sy * (TERR - 0.5)
        b.box(x, y, 0, 0.5, 0.5, 0.75, 'stone_fit')
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


def carved(b, arm, u, v0, v1, z0, z1):
    """A carved panel on the wall plane u of `arm`, laid as friezes about 0.3 m high (the carve strip is one frieze)."""
    n = max(1, round((z1 - z0) / 0.3))
    for i in range(n):
        za, zb = z0 + (z1 - z0) * i / n, z0 + (z1 - z0) * (i + 1) / n
        b.face([arm_point(arm, u, v0, za), arm_point(arm, u, v1, za), arm_point(arm, u, v1, zb), arm_point(arm, u, v0, zb)], 'carve', 1.0)


def build_core(b, g, arm_ridge):
    c = CORE
    b.box(0, 0, BASE_Z, 2 * c, 2 * c, CORE_TOP - BASE_Z, 'wall', bottom=False)
    z0, z1 = arm_ridge + 0.3, CORE_TOP - 0.5
    for arm in ARMS:
        out = arm_vec(arm)
        for k, (v0, v1) in enumerate(((-c + 0.45, -0.25), (0.25, c - 0.45))):
            carved(b, arm, c + 0.04, v0, v1, z0, z1)
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


def build_belfry(b, g, ridge):
    """Belfry on the ridge crossing: a plank box with a carved panel and a rune on each side, a flared eave, a steep
    scale roof and a spire. Returns the height of the spire tip."""
    h, z0, z1 = 1.0, ridge - 0.5, ridge + 1.9
    b.prism(square(h), z0, z1, 'wall')
    if DETAIL < 2:
        for x, y in ((h, h), (h, -h), (-h, h), (-h, -h)):
            wall_post(b, x, y, z0, z1, 0.24)
        b.prism(square(h + 0.14), z1, z1 + 0.2, 'beam', top='beam')
    if DETAIL == 0:
        for k, arm in enumerate(ARMS):
            out = arm_vec(arm)
            carved(b, arm, h + 0.03, -0.5, 0.5, z0 + 0.75, z1 - 0.55)
            for v in (-0.5, 0.5):
                b.beam(arm_point(arm, h + 0.06, v, z0 + 0.7), arm_point(arm, h + 0.06, v, z1 - 0.5), 0.1, 0.08, 'trim', up=out)
            for zz in (z0 + 0.7, z1 - 0.5):
                b.beam(arm_point(arm, h + 0.06, -0.55, zz), arm_point(arm, h + 0.06, 0.55, zz), 0.1, 0.08, 'trim', up=out)
            rune(g, arm_point(arm, h + 0.1, 0, z1 - 0.28), out, 0.32, glyph=k)
    ez, az, ex = z1 + 0.2, z1 + 2.9, h + 0.45
    apex = Vector((0, 0, az))
    corners = [Vector((sx * ex, sy * ex, ez)) for sx, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
    for k in range(4):
        a, c = corners[k], corners[(k + 1) % 4]
        d = (c - a).normalized() * 0.015
        roof_slope(b, g, (apex - d, apex + d, c, a))
    if DETAIL < 2:
        for p in corners:
            b.beam(p, apex, 0.14, 0.12, 'beam')
    b.beam(apex - Vector((0, 0, 0.2)), apex + Vector((0, 0, 1.9)), 0.14 if DETAIL < 2 else 0.1, 0.14 if DETAIL < 2 else 0.1, 'beam')
    if DETAIL < 2:
        b.box(0, 0, az + 0.45, 0.3, 0.3, 0.12, 'trim')
    return az + 1.9


def build_temple(detail=0):
    global DETAIL
    DETAIL = detail
    b, g = Builder(11), Builder(5)
    b.organic = detail == 0
    build_base(b, g)
    build_walls(b, g)

    arm_glow = [[(0.05, 0.88), (0.95, 0.88)]]
    arm_ridge = 0.0
    for k, arm in enumerate(ARMS):
        arm_ridge = gable_roof(b, g, arm, CORE - 0.2, REACH, ARM_HALF, WALL_Z, ARM_PITCH, ov0=0, ends=(False, True),
                               finial=1.0, glow=arm_glow)
        portal(b, g, arm, ('glow', 'blind', 'open', 'blind')[k])

    build_core(b, g, arm_ridge)
    main_glow = [[(0.04, 0.9), (0.96, 0.9)], [(0.18, 0.42), (0.4, 0.42), (0.4, 0.66), (0.62, 0.66), (0.62, 0.42), (0.84, 0.42)]]
    ridge = 0.0
    for arm in ((0, 1), (1, 0)):
        ridge = gable_roof(b, g, arm, -CORE, CORE, CORE, CORE_TOP, MAIN_PITCH, ends=(True, True), finial=1.3, glow=main_glow)
    tip = build_belfry(b, g, ridge)
    global CROWN
    CROWN = tip + 1.7  # centre of the orb the game hovers above the spire
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


def rebuild(detail=0):
    coll = bpy.data.collections.get('temple')
    if coll:
        for obj in list(coll.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    else:
        coll = bpy.data.collections.new('temple')
        bpy.context.scene.collection.children.link(coll)
    for stale in ('temple', 'temple_glow'):  # same-named objects elsewhere would push ours to 'temple.001'
        if stale in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[stale], do_unlink=True)
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
    for name in ('tone', 'uoff', 'preuv'):
        if glow_obj.data.attributes.get(name):
            glow_obj.data.attributes.remove(glow_obj.data.attributes[name])
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
