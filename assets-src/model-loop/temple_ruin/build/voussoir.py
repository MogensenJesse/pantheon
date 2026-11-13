"""Part 'voussoir': wedge-shaped arch stone, wide at the top (outer face), narrow at the foot (inner face), tapering in depth too; chipped, moss on every variant.
r06 (judge 3.8): much stronger wedge (foot ~45% of the top width, ~65% of the depth), 14 facets, moss on both."""
import math

from tcommon import chipped_block

# (outer width, depth, height); foot half-width = w/2 - h * tan(taper)
VARIANTS = {
    "voussoir_a": dict(dims=(0.40, 0.30, 0.34), seed=71, moss=0.5, spots=[((0.15, -0.1, 0.34), 0.34), ((0.17, -0.15, 0.17), 0.12), ((-0.17, 0.1, 0.22), 0.1)], taper=17.0, dtaper=9.0),
    "voussoir_b": dict(dims=(0.44, 0.32, 0.36), seed=73, moss=0.38, spots=[((-0.18, 0.12, 0.36), 0.3), ((-0.2, 0.0, 0.2), 0.11)], taper=15.0, dtaper=8.0),
}


def build_all():
    for n, v in VARIANTS.items():
        w, d, h = v["dims"]
        t, td = math.radians(v["taper"]), math.radians(v["dtaper"])
        inner = w / 2 - h * math.tan(t)
        inner_d = d / 2 - h * math.tan(td)
        extra = [((sx * inner, 0, 0), (sx * math.cos(t), 0, -math.sin(t))) for sx in (-1, 1)]
        extra += [((0, sy * inner_d, 0), (0, sy * math.cos(td), -math.sin(td))) for sy in (-1, 1)]
        chipped_block(n, "voussoir", v["dims"], v["seed"], moss=v["moss"], bite_kw=dict(top=2, base=0, vertical=0), corners=0.8, edges=6, tilt=2.5, facets=14, facet_tilt=5.0,
                      corner_depth=(0.02, 0.055), edge_depth=(0.018, 0.038), edge_facets=1, face_cut=(0.0, 0.006), bevel=0.012, segs=1, extra=extra, moss_spots=v["spots"])
    return list(VARIANTS)
