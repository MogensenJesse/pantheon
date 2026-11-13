"""Part 'wall_block': a tight wall stone for walls and podium facing (user 2026-11-01: the ashlar read as loose piled stones, too pronounced). Same stone
recipe as ashlar, but near-flat faces (tilt 0.8 deg), shallow 1-2 cm chamfers, no chiselled bands or bites, small corner chips, hairline bevel, so a course
of them reads as one wall with narrow joints. Moss is paint, a little on every variant. build_all() -> object names."""
from tcommon import chipped_block

VARIANTS = {
    "wall_block_a": dict(dims=(0.60, 0.40, 0.30), seed=71, moss=0.22),
    "wall_block_b": dict(dims=(0.52, 0.40, 0.30), seed=72, moss=0.12),
    "wall_block_c": dict(dims=(0.68, 0.40, 0.30), seed=73, moss=0.3),
}


def build_all():
    for n, v in VARIANTS.items():
        chipped_block(n, "wall_block", v["dims"], v["seed"], moss=v["moss"], tilt=0.8, facets=14, facet_tilt=3.0, facet_depth=(0.002, 0.006), corners=0.35, corner_depth=(0.012, 0.03),
                      edges=4, edge_depth=(0.008, 0.016), edge_facets=0, face_cut=(0.0, 0.002), bevel=0.007, segs=1, flat_bottom=True, top_facets=4, top_tilt=1.5,
                      moss_kw=dict(w_noise=0.45, w_up=0.25, w_prox=0.8, noise_scale=16.0))
    return list(VARIANTS)
