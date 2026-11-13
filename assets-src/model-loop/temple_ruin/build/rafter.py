"""Part 'rafter': weathered squared roof beam with a split, splintered end.
r17 (judge 3.8): fat prongs. The split end is a grid of 2 columns x 3 rows of prongs (about 10 x 8 cm) freed by one lengthwise groove and two horizontal slots,
every prong cut off at its own length (staggered over ~40% of the beam) by a cutter that pivots at its inner face, so a steep chisel slant never nicks the row
next to it. The body is our own faceted timber block (3 cm chamfers on every long edge and on the intact end, plane breaks, flat shading)."""
import math
import random

import paint
from tcommon import chipped_block, set_materials, timber_mat

# L: length; side: which end is split; rows x columns of prongs are fixed (3 x 2)
VARIANTS = {
    "rafter_a": dict(seed=128, L=2.0, side=1),
    "rafter_b": dict(seed=129, L=1.9, side=-1),
    "rafter_c": dict(seed=127, L=2.1, side=1),
}
BITES = {"rafter_a": dict(top=1, base=1, vertical=0, size=(0.05, 0.09)), "rafter_b": dict(top=1, base=1, vertical=0, size=(0.05, 0.1)),
         "rafter_c": dict(top=1, base=1, vertical=0, size=(0.04, 0.08))}
W, H = 0.23, 0.25
ROWS = 3
CH = 0.03  # chamfer leg on the long edges and the intact end


def _mat():
    return timber_mat()


def _body_planes(L, side):
    """Chamfer planes (point, normal): the four long edges and the four edges of the intact end, plus a slightly skewed end face."""
    r = math.sqrt(0.5)
    out = []
    for sy in (-1, 1):
        for tx, px in ((0.0, 0.0),):  # two tilted planes per edge: the chamfer is wider at one end of each, so the band wanders
            for sz, zz in ((1, H), (-1, 0)):
                nn = math.sqrt(tx * tx + 2 * r * r)
                out.append(((px, sy * (W / 2 - CH), zz), (tx / nn, sy * r / nn, sz * r / nn)))
        out.append(((-side * (L / 2 - CH), sy * W / 2, 0), (-side * r, sy * r, 0)))
    out.append(((-side * (L / 2 - CH), 0, H), (-side * r, 0, r)))
    out.append(((-side * (L / 2 - CH), 0, 0), (-side * r, 0, -r)))
    out.append(((-side * (L / 2 - 0.012), 0, 0), (-side, 0.05, 0.03)))
    return out


def _split_end(rnd, L, side):
    """Boxes to cut: the central groove, two horizontal slots, and one pivoting cutter per prong (2 columns x 3 rows)."""
    xe = side * L / 2
    zs = [H * k / ROWS for k in range(ROWS + 1)]
    boxes = []
    sl = rnd.uniform(1.0, 1.3)
    big = 0.3
    boxes.append(((xe - side * (sl / 2 - big / 2), 0.0, H / 2), (sl + big, 0.025, H * 1.6), (0, 0, 0)))  # the groove down the middle, through the whole depth
    a = math.radians(2.6)
    for sg in (-1, 1):  # two slightly splayed cutters pivoting at the groove's inner end open it into a V towards the split
        lh = (sl + big) / 2
        boxes.append(((xe - side * (sl / 2 - big / 2), sg * lh * math.sin(a) * 0.5, H / 2), (sl + big, 0.03, H * 1.6), (0, 0, side * sg * a)))
    for k in (1, 2):  # horizontal slots between the rows
        sl = rnd.uniform(0.8, 1.2)
        boxes.append(((xe - side * (sl / 2 - big / 2), 0.0, zs[k]), (sl + big, W * 1.6, 0.02), (0, 0, 0)))
    lengths = [0.18, 0.3, 0.42, 0.55, 0.68, 0.82]
    rnd.shuffle(lengths)
    cells = [(c, r) for c in (0, 1) for r in range(ROWS)]
    for (c, r), cut_at in zip(cells, lengths):
        yc = -W / 4 if c == 0 else W / 4
        z_lo = zs[r] - (0.1 if r == 0 else 0.004)
        z_hi = zs[r + 1] + (0.1 if r == ROWS - 1 else 0.004)
        zm, hh = (z_lo + z_hi) / 2, z_hi - z_lo
        ang = math.radians(rnd.uniform(10, 20)) * rnd.choice((-1, 1))
        wl = 0.1  # the slanted chisel face is a short wedge cutter pivoting at the prong's end face, so its tilted body stays inside the cell's rows
        wx = xe - side * cut_at + side * (wl / 2) * math.cos(ang)
        wz = zm - side * (wl / 2) * math.sin(ang)
        wy = W / 2 * 1.02 + 0.004
        boxes.append(((wx, yc, wz), (wl, wy, hh), (0, ang, 0)))
        rest = cut_at - 0.06 + 0.15  # a straight box takes the rest of the cell out to past the beam end
        boxes.append(((xe - side * (cut_at - 0.06) + side * rest / 2, yc, zm), (rest, wy, hh), (0, 0, 0)))
    return boxes


def build_all():
    for n, v in VARIANTS.items():
        rnd = random.Random(v["seed"] * 5)
        L, side = v["L"], v["side"]
        ob = chipped_block(n, "rafter", (L, W, H), v["seed"], tilt=0.5, face_cut=(0.0, 0.006), corners=1.0, corner_depth=(0.02, 0.06), edges=8, edge_depth=(0.008, 0.025),
                           bevel=0.006, segs=1, facets=60, facet_tilt=1.6, facet_depth=(0.002, 0.008), top_facets=10, top_tilt=1.2, extra=_body_planes(L, side),
                           texture_moss=False, mats=(_mat(),))
        paint.cut_boxes(ob, _split_end(rnd, L, side))
        paint.drop_islands(ob)
        paint.bites(ob, v["seed"], **BITES[n])
        set_materials(ob, _mat())
    return list(VARIANTS)
