"""Part 'pillar': square stone pillar (r03, rebuilt on column.py): chunky chipped base block, shaft with two stacked chunky spiral-key panels per face,
and a three-tier cap (two collars under an overhanging slab). pillar_a is whole, pillar_b is broken off with a faceted top and no cap.
Moss: patches on the cap corner, the lower shaft corner and the base corner (material mask)."""
import math

import column

VARIANTS = {
    "pillar_a": dict(seed=101, shaft=(0.5, 0.5), shaft_h=1.72, base=(0.6, 0.6, 0.3), caps=[(0.56, 0.56, 0.14), (0.6, 0.6, 0.14), (0.68, 0.68, 0.2)],
                     panels=(0.8, 1.4), moss=0.34, spots=[((0.3, -0.3, 2.4), 0.45), ((-0.26, -0.26, 0.95), 0.62), ((0.3, 0.3, 0.3), 0.45)]),
    "pillar_b": dict(seed=104, shaft=(0.5, 0.5), shaft_h=1.25, base=(0.6, 0.6, 0.3), caps=[], panels=(0.85,), moss=0.34,
                     spots=[((0.2, -0.25, 1.5), 0.6), ((-0.3, 0.3, 0.3), 0.45)], mirror0=True),
}


def build_all():
    for name, v in VARIANTS.items():
        v = dict(v)
        brk = []
        if not v["caps"]:  # the broken top: three planes at different angles, so it is a rough break and not one saw cut
            top = v["base"][2] - 0.01 + v["shaft_h"]
            for (dx, dy, ang, drop) in ((0.0, 0.0, 30, 0.0), (0.22, 0.12, 46, 0.18), (-0.2, -0.14, 18, 0.08)):
                a = math.radians(ang)
                brk.append(((dx, dy, top - 0.1 - drop), (math.sin(a) * (1 if dx >= 0 else -1), 0.2 * (1 if dy >= 0 else -1), math.cos(a))))
            brk.append(((0.2, -0.2, top - 0.42), (0.6, -0.6, 0.5)))  # one corner knocked off far below the break
            brk.append(((-0.25, 0.25, top - 0.22), (-0.5, 0.5, 0.7)))
        column.build(name, v["seed"], v["shaft"], v["shaft_h"], base=v["base"], caps=v["caps"], panels=v["panels"], panel_size=0.4, bar=0.055, relief=0.02,
                     mirror0=v.get("mirror0", False), break_planes=brk, moss=v["moss"], spots=v["spots"])
    return list(VARIANTS)
