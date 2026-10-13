# assets-src/village/village_extra_build.py — workshop, granary and well, built from the house_build.py parts.
# exec() it into the namespace of house_build.py (`hb`) after that file: it reuses its builder, wall, gable and
# roof functions and registers itself in BUILDERS / KIND_META, so house_build's rebuild() and make() export it:
#   exec(open(root + '/village_extra_build.py').read(), hb)
#   hb['make'](out_dir, ns, atlas_png, kinds=('workshop', 'granary', 'well'))
# Same conventions: metres, Blender +Z up, the door / open front faces -Y (glTF +Z), origin at the footprint centre.
import math


def cyl(b, cx, cy, z0, r, h, n, region, top=None):
    """Closed n-sided prism standing on z0 (barrels, stumps, stools, the bucket)."""
    pts = [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    b.prism(pts, z0, z0 + h, region, top=top or region)
    b.face([(x, y, z0) for x, y in reversed(pts)], region)


def rafters_y(b, hx, hy, eave, ov, ov_end):
    """Open roof frame for a ridge running along y: a pair of rafters every 0.7 m, ridge beam, two battens."""
    ridge, low = eave + hx * PITCH, eave - ov * PITCH
    n = max(2, round(2 * hy / 0.7))
    step = 2 * hy / n
    for k in range(n + 1):
        y = -hy + k * step
        b.beam((-(hx + ov), y, low), (0, y, ridge), 0.12, 0.17, 'beam')
        b.beam((hx + ov, y, low), (0, y, ridge), 0.12, 0.17, 'beam')
    b.beam((0, -hy - ov_end[0], ridge + 0.05), (0, hy + ov_end[1], ridge + 0.05), 0.3, 0.14, 'beam')
    for f in (0.35, 0.7):
        for sg in (-1, 1):
            x, z = sg * (hx + ov) * (1 - f), low + (ridge - low) * f
            b.beam((x, -hy - 0.3, z + 0.1), (x, hy + 0.3, z + 0.1), 0.07, 0.07, 'beam')


# ---------------------------------------------------------------- workshop (open gable front, forge inside)
WS_HX, WS_HY, WS_EAVE = 2.5, 3.0, 2.6
WS_FORGE = (1.3, 2.35)


def workshop_props(b, g):
    """Forge with its fire, anvil on a stump, workbench, stool, weapon rack, barrels and a crate."""
    fx, fy = WS_FORGE
    b.box(fx, fy, FLOOR, 1.5, 1.1, 0.95, 'stone')
    b.box(fx, fy + 0.1, FLOOR + 0.95, 1.1, 0.8, 0.7, 'stone')
    b.box(fx, fy + 0.1, FLOOR + 1.65, 0.85, 0.65, 1.95, 'stone')
    yf = fy - 0.56
    x0, x1, z0, z1 = fx - 0.4, fx + 0.4, FLOOR + 0.18, FLOOR + 0.72
    b.quad([(x0, yf, z0), (x1, yf, z0), (x1, yf, z1), (x0, yf, z1)], 'dark', (0, -1, 0), 0.7)
    g.quad([(x0 + 0.05, yf - 0.005, z0 + 0.03), (x1 - 0.05, yf - 0.005, z0 + 0.03),
            (x1 - 0.05, yf - 0.005, z1 - 0.1), (x0 + 0.05, yf - 0.005, z1 - 0.1)], 'trim', (0, -1, 0), WARM + 1.0)
    if DETAIL > 1:
        return
    ax, ay = -0.2, 0.8  # anvil on a stump
    cyl(b, ax, ay, FLOOR, 0.26, 0.5, 8, 'plank')
    b.box(ax, ay, FLOOR + 0.5, 0.34, 0.22, 0.14, 'dark')
    b.box(ax, ay, FLOOR + 0.64, 0.2, 0.16, 0.14, 'dark')
    b.box(ax, ay, FLOOR + 0.78, 0.62, 0.2, 0.1, 'dark')
    b.beam((ax + 0.3, ay, FLOOR + 0.83), (ax + 0.58, ay, FLOOR + 0.8), 0.14, 0.1, 'dark')
    bx, by = -1.55, 0.6  # workbench
    b.box(bx, by, FLOOR + 0.82, 1.5, 0.62, 0.08, 'plank')
    b.box(bx, by, FLOOR + 0.3, 1.4, 0.55, 0.06, 'plank')
    for sx in (-0.65, 0.65):
        for sy in (-0.25, 0.25):
            b.beam((bx + sx, by + sy, FLOOR), (bx + sx, by + sy, FLOOR + 0.82), 0.1, 0.1, 'beam')
    for k, tx in enumerate((-0.5, 0.0, 0.45)):
        b.box(bx + tx, by + 0.05 * k, FLOOR + 0.9, 0.3 - 0.06 * k, 0.07, 0.05, 'dark')
    if DETAIL > 0:
        for bxx, byy in ((1.85, -2.0), (-1.9, -2.35)):
            cyl(b, bxx, byy, FLOOR, 0.32, 0.8, 6, 'plank')
        return
    cyl(b, -0.85, 0.2, FLOOR + 0.42, 0.2, 0.06, 8, 'plank')  # stool
    for k in range(3):
        a = 2 * math.pi * k / 3
        b.beam((-0.85 + 0.13 * math.cos(a), 0.2 + 0.13 * math.sin(a), FLOOR), (-0.85 + 0.13 * math.cos(a), 0.2 + 0.13 * math.sin(a), FLOOR + 0.42), 0.06, 0.06, 'beam')
    b.box(-WS_HX + 0.1, -0.9, FLOOR + 1.0, 0.06, 1.4, 0.9, 'plank')  # weapon rack
    for k in range(4):
        b.box(-WS_HX + 0.16, -1.4 + 0.33 * k, FLOOR + 1.08, 0.04, 0.05, 0.75, 'dark')
    for bxx, byy in ((1.85, -2.0), (-1.9, -2.35)):
        cyl(b, bxx, byy, FLOOR, 0.32, 0.8, 8, 'plank')
        for zz in (0.15, 0.55):
            cyl(b, bxx, byy, FLOOR + zz, 0.335, 0.07, 8, 'dark')
    b.box(-0.9, -2.3, FLOOR, 0.6, 0.4, 0.28, 'plank')  # crate with tool handles
    for k in range(3):
        b.beam((-1.05 + 0.15 * k, -2.3, FLOOR + 0.28), (-1.05 + 0.15 * k + 0.05, -2.3, FLOOR + 0.62), 0.05, 0.05, 'beam')


def build_workshop(detail=0, stage=2):
    global DETAIL
    DETAIL = detail
    hx, hy, eave = WS_HX, WS_HY, WS_EAVE
    b, g = HB(51), HB(5)
    ring = [(hx + 0.09, -hy - 0.09), (hx + 0.09, hy + 0.09), (-hx - 0.09, hy + 0.09), (-hx - 0.09, -hy - 0.09)]
    inner = [(hx - 0.02, -hy + 0.02), (hx - 0.02, hy - 0.02), (-hx + 0.02, hy - 0.02), (-hx + 0.02, -hy + 0.02)]
    if DETAIL == 0:
        b.block_ring(ring, 0.0, FLOOR, 0.3, 'stone')
    else:
        b.prism(ring, 0.0, FLOOR, 'stone')
    b.prism(inner, 0.0, FLOOR - 0.02, 'wall', top='plank')
    if DETAIL == 0:
        x = -hx + 0.1
        while x < hx - 0.05:
            b.box(x, 0, FLOOR - 0.03, 0.19, 2 * hy - 0.06, 0.05, 'plank')
            x += 0.2
    for sx in (-1, 1):  # big stone footings under the two front posts
        b.box(sx * (hx - 0.14), -hy + 0.14, 0.0, 0.62, 0.62, FLOOR + 0.1, 'stone')
    if stage == 0:
        h = 0.14
        for (x0, y0), (x1, y1) in (((-hx + 0.15, -hy + 0.15), (hx - 0.15, -hy + 0.15)),
                                   ((hx - 0.15, -hy + 0.15), (hx - 0.15, hy - 0.15)),
                                   ((hx - 0.15, hy - 0.15), (-hx + 0.15, hy - 0.15)),
                                   ((-hx + 0.15, hy - 0.15), (-hx + 0.15, -hy + 0.15))):
            b.beam((x0, y0, FLOOR + h / 2), (x1, y1, FLOOR + h / 2), 0.24, h, 'beam')
        for k in range(3):
            b.box(0.9, 0.6, FLOOR + k * 0.1, 1.8, 0.35, 0.1, 'plank')
        return b, g, FLOOR
    top = None if stage == 2 else FLOOR + 0.9
    for a, c, length in (((hx, -hy), (hx, hy), 2 * hy), ((hx, hy), (-hx, hy), 2 * hx), ((-hx, hy), (-hx, -hy), 2 * hy)):
        wall_run(b, a, c, FLOOR, eave, posts=auto_posts(length, []), board_top=top if stage == 1 else None)
    for sx in (-1, 1):
        px = sx * (hx - 0.14)
        b.beam((px, -hy + 0.14, FLOOR), (px, -hy + 0.14, eave + 0.05), 0.32, 0.32, 'beam')
        if DETAIL < 2:
            b.beam((px, -hy + 0.14, eave - 1.0), (sx * (hx - 1.05), -hy + 0.14, eave - 0.12), 0.16, 0.16, 'beam')
    b.beam((-hx + 0.1, -hy + 0.14, eave - 0.12), (hx - 0.1, -hy + 0.14, eave - 0.12), 0.28, 0.36, 'beam')
    if stage == 1:
        rafters_y(b, hx, hy, eave, 0.75, (0.9, 0.45))
        return b, g, eave + hx * PITCH
    ridge = gable_roof(b, (0, 0), (0, 1), hx, eave, -hy, hy, ov_end=(0.9, 0.45), ov=0.75, fill=(-hy, hy), z_fill=eave,
                       rake_w=0.3, rake_ext=0.75, heads=True, vertical_fill=True)
    # Chimney over the forge, through the right slope.
    cx, cy = WS_FORGE[0], WS_FORGE[1] + 0.1
    if DETAIL == 2:
        b.box(cx, cy, 3.7, 0.95, 0.95, 2.8, 'stone')
    else:
        b.box(cx, cy, 3.7, 0.95, 0.95, 2.65, 'stone')
        b.box(cx, cy, 6.35, 1.15, 1.15, 0.18, 'stone')
        workshop_props(b, g)
    if DETAIL == 0:
        for k in range(7):  # rafter tails under both long eaves
            y = -hy + 0.4 + k * (2 * hy - 0.8) / 6
            for sx in (-1, 1):
                b.beam((sx * (hx + 0.05), y, eave - 0.2), (sx * (hx + 0.75), y, eave - 0.75 * PITCH - 0.02), 0.11, 0.11, 'beam')
    return b, g, ridge


# ---------------------------------------------------------------- granary (stone feet, door in the gable end)
GR_H, GR_FEET, GR_EAVE, GR_PITCH = 1.6, 0.9, 3.0, 1.25


def build_granary(detail=0, stage=2):
    global DETAIL, PITCH, FLOOR
    saved = (PITCH, FLOOR)
    PITCH, FLOOR = GR_PITCH, GR_FEET + 0.22
    try:
        DETAIL = detail
        h, eave = GR_H, GR_EAVE
        b, g = HB(71), HB(5)
        for sx in (-1, 1):
            for sy in (-1, 1):
                cx, cy = sx * (h - 0.22), sy * (h - 0.22)
                j = b.jitter(0.06)
                c = [(cx - 0.32, cy - 0.32, 0), (cx + 0.32, cy - 0.32, 0), (cx + 0.32, cy + 0.32, 0), (cx - 0.32, cy + 0.32, 0),
                     (cx - 0.25 * j, cy - 0.25, GR_FEET), (cx + 0.25, cy - 0.25 * j, GR_FEET),
                     (cx + 0.25 * j, cy + 0.25, GR_FEET), (cx - 0.25, cy + 0.25 * j, GR_FEET)]
                b.hexa(c, 'stone', tone=b.jitter(0.1))
                b.box(cx, cy, GR_FEET, 0.4, 0.4, 0.22, 'trim')  # corner block
        for (x0, y0), (x1, y1) in (((-h + 0.2, -h + 0.2), (h - 0.2, -h + 0.2)), ((h - 0.2, -h + 0.2), (h - 0.2, h - 0.2)),
                                   ((h - 0.2, h - 0.2), (-h + 0.2, h - 0.2)), ((-h + 0.2, h - 0.2), (-h + 0.2, -h + 0.2))):
            b.beam((x0, y0, GR_FEET + 0.11), (x1, y1, GR_FEET + 0.11), 0.26, 0.22, 'beam')
        if stage == 0:
            return b, g, FLOOR
        top = None if stage == 2 else FLOOR + 0.5
        door = [(h - 0.45, h + 0.45, FLOOR, FLOOR + 1.55)] if stage == 2 else []
        runs = (((-h, -h), (h, -h), 2 * h, door), ((h, -h), (h, h), 2 * h, []), ((h, h), (-h, h), 2 * h, []), ((-h, h), (-h, -h), 2 * h, []))
        for a, c, length, ops in runs:
            wall_run(b, a, c, FLOOR, eave, openings=ops, posts=auto_posts(length, ops), board_top=top if stage == 1 else None)
        if stage == 1:
            rafters_y(b, h, h, eave, 0.65, (0.55, 0.55))
            return b, g, eave + h * PITCH
        ridge = gable_roof(b, (0, 0), (0, 1), h, eave, -h, h, ov_end=(0.55, 0.55), ov=0.65, fill=(-h, h), z_fill=eave,
                           rake_w=0.3, rake_ext=0.8, heads=True, turf=(0.12, 0.88, 0.3, 0.8))
        door_leaf(b, (0.5, -h - 0.03), 0.0, height=1.5)
        if DETAIL < 2:  # ladder to the door
            for sx in (-1, 1):
                b.beam((sx * 0.3, -h - 0.15, FLOOR - 0.05), (sx * 0.3, -h - 0.95, 0.0), 0.1, 0.1, 'plank')
            for k in range(3):
                f = (k + 0.5) / 3
                b.beam((-0.3, -h - 0.15 - 0.8 * f, FLOOR - 0.05 - (FLOOR - 0.05) * f), (0.3, -h - 0.15 - 0.8 * f, FLOOR - 0.05 - (FLOOR - 0.05) * f), 0.09, 0.09, 'plank')
        return b, g, ridge
    finally:
        PITCH, FLOOR = saved


# ---------------------------------------------------------------- well (round stone ring, windlass, small roof)
WELL_PITCH = 1.0


def build_well(detail=0, stage=2):
    global DETAIL, PITCH
    saved = PITCH
    PITCH = WELL_PITCH
    try:
        DETAIL = detail
        b, g = HB(61), HB(5)
        r_in, r_out, ring_h = 0.68, 1.0, 0.9
        if DETAIL == 0:
            for c in range(3):
                n, step = 9, 2 * math.pi / 9
                off = (c % 2) * step / 2
                for i in range(n):
                    a0, a1 = off + i * step + 0.02, off + (i + 1) * step - 0.02
                    ro, ri = r_out + (b.rng.random() - 0.5) * 0.08, r_in + (b.rng.random() - 0.5) * 0.06
                    z0, z1 = c * 0.3 + 0.005, c * 0.3 + 0.295 + (b.rng.random() - 0.5) * 0.03
                    bot = [(ro * math.cos(a0), ro * math.sin(a0), z0), (ro * math.cos(a1), ro * math.sin(a1), z0),
                           (ri * math.cos(a1), ri * math.sin(a1), z0), (ri * math.cos(a0), ri * math.sin(a0), z0)]
                    b.hexa(bot + [(x, y, z1) for x, y, _ in bot], 'stone', tone=b.jitter(0.12))
        else:
            n = 10 if DETAIL == 1 else 8
            outer = [(r_out * math.cos(2 * math.pi * i / n), r_out * math.sin(2 * math.pi * i / n)) for i in range(n)]
            inner = [(r_in * math.cos(2 * math.pi * i / n), r_in * math.sin(2 * math.pi * i / n)) for i in reversed(range(n))]
            b.prism(outer, 0.0, ring_h, 'stone', top=None)
            b.prism(inner, 0.0, ring_h, 'stone', top=None)
            for i in range(n):
                j = (i + 1) % n
                b.face([(*outer[i], ring_h), (*outer[j], ring_h), (*inner[(n - 1 - j) % n], ring_h), (*inner[(n - 1 - i) % n], ring_h)], 'stone')
        b.face([(r_in * math.cos(-2 * math.pi * i / 12), r_in * math.sin(-2 * math.pi * i / 12), 0.35) for i in range(12)], 'dark')
        # Plank apron, a hexagon-ish deck around the ring.
        if DETAIL == 0:
            y = -1.1
            while y < 1.12:
                half = math.sqrt(max(0.01, 1.15 ** 2 - y * y))
                b.beam((-half, y, 0.04), (half, y, 0.04), 0.23, 0.08, 'plank')
                y += 0.26
            for k in range(6):
                a = 0.5 + k * 1.05
                b.beam((0.85 * math.cos(a) - 0.3 * math.sin(a), 0.85 * math.sin(a) + 0.3 * math.cos(a), 0.11),
                       (0.85 * math.cos(a) + 0.3 * math.sin(a), 0.85 * math.sin(a) - 0.3 * math.cos(a), 0.11), 0.2, 0.06, 'plank')
        else:
            cyl(b, 0, 0, 0.0, 1.15, 0.08, 8, 'plank')
        # Posts, windlass, bucket, top plates and the roof.
        pz = 1.95
        for sx in (-1, 1):
            b.beam((sx * 0.85, 0, 0.5), (sx * 0.85, 0, pz), 0.2, 0.2, 'beam')
            b.beam((sx * 0.85, -0.9, pz), (sx * 0.85, 0.9, pz), 0.18, 0.2, 'beam')
            if DETAIL < 2:
                for sy in (-1, 1):
                    b.beam((sx * 0.85, 0, 1.45), (sx * 0.85, sy * 0.7, pz), 0.12, 0.12, 'beam')
        if DETAIL < 2:
            b.beam((-0.95, 0, 1.45), (1.12, 0, 1.45), 0.18, 0.18, 'beam')
            b.beam((-0.25, 0, 1.45), (0.25, 0, 1.45), 0.3, 0.3, 'rope')
            b.beam((-0.25, 0, 1.45), (0.25, 0, 1.45), 0.3, 0.3, 'rope', up=(0, 1, 1))
            b.beam((0, 0, 1.4), (0, 0, 1.0), 0.05, 0.05, 'rope')
            cyl(b, 0, 0, 0.74, 0.17, 0.26, 8, 'plank')
            b.beam((-0.15, 0, 1.0), (0.15, 0, 1.0), 0.04, 0.04, 'dark')
            b.beam((1.12, 0, 1.45), (1.12, 0, 1.05), 0.08, 0.08, 'beam')
            b.beam((1.12, 0, 1.05), (1.5, 0, 1.05), 0.1, 0.1, 'beam')
        ridge = gable_roof(b, (0, 0), (0, 1), 0.95, pz, -0.85, 0.85, ov_end=(0.2, 0.2), ov=0.18, fill=(-0.85, 0.85), z_fill=pz,
                           rake_w=0.2, rake_ext=0.4, fill_boards=False)
        return b, g, ridge
    finally:
        PITCH = saved


# ---------------------------------------------------------------- fence segment and site stockpile (single pieces)
def log_x(b, x0, x1, cy, cz, r, n=8):
    """A closed log along x; the two end faces use the lighter 'trim' so the cut reads."""
    ring = [(cy + r * math.cos(2 * math.pi * i / n + 0.4), cz + r * math.sin(2 * math.pi * i / n + 0.4)) for i in range(n)]
    for i in range(n):
        j = (i + 1) % n
        b.face([(x0, *ring[i]), (x1, *ring[i]), (x1, *ring[j]), (x0, *ring[j])], 'plank')
    b.face([(x0, y, z) for y, z in reversed(ring)], 'trim')
    b.face([(x1, y, z) for y, z in ring], 'trim')


def build_fence(detail=0, stage=2):
    """Two-metre fence segment along x: two thick posts and three slightly uneven rails with iron nails."""
    global DETAIL
    DETAIL = detail
    b, g = HB(81), HB(5)
    for sx in (-1, 1):
        b.box(sx * 0.98, 0.0, 0.0, 0.2, 0.22, 1.12, 'beam')
        b.box(sx * 0.98, 0.0, 1.12, 0.22, 0.24, 0.06, 'trim')
    for k, z in enumerate((0.3, 0.64, 0.98)):
        tilt = (b.rng.random() - 0.5) * 0.06
        b.beam((-0.99, 0.0, z - tilt), (0.99, 0.0, z + tilt), 0.07, 0.2, 'plank', up=(0, 1, 0))
        for sx in (-1, 1):
            b.box(sx * 0.98, -0.12, z - 0.03, 0.045, 0.03, 0.045, 'dark')
    return b, g, 1.18


def build_stockpile(detail=0, stage=2):
    """Site stockpile (about 1.6 x 0.8 x 0.6 m): five logs in two rows, a stack of planks on top, four stakes."""
    global DETAIL
    DETAIL = detail
    b, g = HB(83), HB(5)
    r = 0.14
    for k, y in enumerate((-0.28, 0.0, 0.28)):
        j = (b.rng.random() - 0.5) * 0.08
        log_x(b, -0.78 + j, 0.78 - j * 0.5, y, r, r)
    for k, y in enumerate((-0.14, 0.14)):
        j = (b.rng.random() - 0.5) * 0.08
        log_x(b, -0.74 + j, 0.76 - j, y, 2 * r + 0.1, r)
    for layer in range(2):
        for k in range(5):
            y = -0.26 + 0.13 * k + (0.04 if layer else 0.0)
            j = (b.rng.random() - 0.5) * 0.1
            b.box(0.02 + j, y, 0.56 + 0.055 * layer, 1.5 + (b.rng.random() - 0.5) * 0.1, 0.12, 0.05, 'plank')
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box(sx * 0.62, sy * 0.44, 0.0, 0.07, 0.07, 0.72 + 0.05 * (sx * sy > 0), 'beam')
    return b, g, 0.8


def make_pieces(out_dir, atlas_ns, atlas_png, kinds=('fence', 'stockpile')):
    """Export single-LOD pieces as <kind>.gltf (no stages, no LOD siblings, no glow)."""
    image, strips = atlas_ns['paint_atlas'](atlas_png)
    counts = {}
    for kind in kinds:
        name = kind + '_s2'
        info = rebuild(name, 0, 2)
        atlas_ns['apply_atlas'](bpy.data.objects[name], image, strips)
        tb['export_one'](kind, [bpy.data.objects[name]], out_dir)
        counts[kind] = info['tris']
    return counts


BUILDERS.update({'workshop': build_workshop, 'granary': build_granary, 'well': build_well,
                 'fence': build_fence, 'stockpile': build_stockpile})
KIND_META.update({
    'fence': lambda: {},
    'stockpile': lambda: {},
    'workshop': lambda: {'footprint': [2 * WS_HX, 2 * WS_HY], 'door': [0.0, WS_HY], 'chimney': [WS_FORGE[0], 6.6, -(WS_FORGE[1] + 0.1)],
                         'workSlots': [[-1.4, WS_HY + 0.9], [1.4, WS_HY + 0.9], [-WS_HX - 1.1, 0.0], [WS_HX + 1.1, 0.0]]},
    'granary': lambda: {'footprint': [2 * GR_H, 2 * GR_H], 'door': [0.0, GR_H], 'workSlots': [[-1.1, GR_H + 1.0], [1.1, GR_H + 1.0], [0.0, -GR_H - 1.0]]},
    'well': lambda: {'footprint': [2.2, 2.2], 'door': [0.0, 1.1], 'workSlots': [[0.0, 1.6], [0.0, -1.6]]},
})
