"""Part 'ashlar': squared wall block with chipped corners and edges and patches of moss (tcommon.chipped_block: a box cut by tilted face
planes, corner chips and edge chamfers, then bevel strips like the well's stone). build_all() -> object names.
r23 (judge 5.0): no base slot bites (corner chips only), 18 facets and 6 edge chamfers for a wobbling outline, chunkier b / c, moss on every variant."""
from tcommon import chipped_block

VARIANTS = {
    "ashlar_a": dict(dims=(0.50, 0.27, 0.26), seed=41, moss=0.3, corners=1.0, edges=8, bites=dict(top=4, base=0, vertical=2, size=(0.05, 0.085))),
    "ashlar_b": dict(dims=(0.50, 0.28, 0.25), seed=46, moss=0.18, corners=1.0, edges=8, bites=dict(top=4, base=0, vertical=2, size=(0.05, 0.085))),
    "ashlar_c": dict(dims=(0.50, 0.26, 0.27), seed=43, moss=0.22, corners=1.0, edges=8, bites=dict(top=4, base=0, vertical=2, size=(0.05, 0.085))),
}


def build_all():
    for n, v in VARIANTS.items():
        chipped_block(n, "ashlar", v["dims"], v["seed"], moss=v["moss"], bite_kw=v["bites"], corners=v["corners"], edges=v["edges"], tilt=2.5, facets=60, facet_tilt=10.0, facet_depth=(0.002, 0.012), corner_depth=(0.035, 0.08),
                      edge_depth=(0.028, 0.05), edge_facets=1, face_cut=(0.0, 0.006), bevel=0.014, segs=1, flat_bottom=True, top_facets=10, moss_kw=dict(w_noise=0.45, w_up=0.25, w_prox=0.8, noise_scale=16.0))
    return list(VARIANTS)
