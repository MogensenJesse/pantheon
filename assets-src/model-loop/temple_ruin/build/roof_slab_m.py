"""Part 'roof_slab_m': the three roof slabs again (same seeds and shapes as roof_slab, so the geometry is identical) with much more painted moss: cover 0.3 and
somewhat bigger patches, biased to the up-facing top (user 2026-11-01: the roof wants more moss as texture). build_all() -> object names."""
from tcommon import chipped_block
from roof_slab import VARIANTS as BASE

MOSSY = {n.replace("roof_slab_", "roof_slab_m"): dict(v, moss=0.3, spots=[(p, r * 1.4) for p, r in v["spots"]]) for n, v in BASE.items()}


def build_all():
    for n, v in MOSSY.items():
        chipped_block(n, "roof_slab_m", v["dims"], v["seed"], moss=v["moss"], bite_kw=dict(top=2, base=0, vertical=0), corners=v["corners"], edges=v["edges"], tilt=2.5, facets=34, facet_tilt=7.0, facet_depth=(0.005, 0.016), top_facets=18, top_tilt=7.0,
                      corner_depth=(0.05, 0.13), edge_depth=(0.014, 0.032), edge_facets=1, face_cut=(0.0, 0.01), bevel=0.008, segs=1, flat_bottom=True, moss_spots=v["spots"], moss_kw=dict(w_noise=0.45, w_up=0.45, w_prox=0.8, noise_scale=7.0))
    return list(MOSSY)
