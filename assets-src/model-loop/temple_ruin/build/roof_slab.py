"""Part 'roof_slab': thick flat stone roof slate, chipped corners, moss on every variant (tcommon.chipped_block).
r06 (judge 4.1): no groove cracks (the ref tops have none), 14 shallow facets break the top, different footprints / thickness per variant."""
from tcommon import chipped_block

VARIANTS = {
    "roof_slab_a": dict(dims=(0.92, 0.50, 0.14), seed=51, moss=0.2, corners=1.0, edges=7, spots=[((0.36, -0.2, 0.14), 0.13), ((-0.4, 0.12, 0.14), 0.11), ((0.05, 0.23, 0.14), 0.08)]),
    "roof_slab_b": dict(dims=(0.86, 0.50, 0.15), seed=52, moss=0.2, corners=0.9, edges=6, spots=[((-0.34, -0.2, 0.15), 0.12), ((0.3, 0.2, 0.15), 0.12), ((0.0, -0.05, 0.15), 0.07)]),
    "roof_slab_c": dict(dims=(0.96, 0.46, 0.13), seed=53, moss=0.18, corners=1.0, edges=8, spots=[((0.4, 0.15, 0.13), 0.12), ((-0.2, -0.2, 0.13), 0.1), ((-0.42, 0.18, 0.13), 0.08)]),
}


def build_all():
    for n, v in VARIANTS.items():
        chipped_block(n, "roof_slab", v["dims"], v["seed"], moss=v["moss"], bite_kw=dict(top=2, base=0, vertical=0), corners=v["corners"], edges=v["edges"], tilt=2.5, facets=34, facet_tilt=7.0, facet_depth=(0.005, 0.016), top_facets=18, top_tilt=7.0,
                      corner_depth=(0.05, 0.13), edge_depth=(0.014, 0.032), edge_facets=1, face_cut=(0.0, 0.01), bevel=0.008, segs=1, flat_bottom=True, moss_spots=v["spots"], moss_kw=dict(w_noise=0.45, w_up=0.3, w_prox=0.8, noise_scale=7.0))
    return list(VARIANTS)
