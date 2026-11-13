"""Part 'step': wide worn stair step: one thick tread with a rounded front corner over a low ledge that sticks out of the front at one end and stops
part-way along (the ref's stepped front); chipped; moss in a few bands over the top edge and down the front.
r13 (judge 4.1): chunkier (2:1, not 5:1), the ledge is a short low block fused into the tread (no second plank), bigger rounded corner, moss spots set as bands."""
from tcommon import chipped_block, round_edge, union

# lip = (width fraction of the step, depth fraction, height fraction)
VARIANTS = {
    "step_a": dict(dims=(1.30, 0.62, 0.30), seed=61, moss=0.4, flip=1, lip=(0.75, 0.4, 0.34),
                   spots=[((0.15, -0.17, 0.3), 0.17), ((0.15, -0.17, 0.2), 0.14), ((0.15, -0.28, 0.1), 0.12), ((-0.55, -0.1, 0.3), 0.15), ((0.5, 0.2, 0.3), 0.1)]),
    "step_b": dict(dims=(1.15, 0.58, 0.28), seed=62, moss=0.4, flip=-1, lip=(0.72, 0.38, 0.34),
                   spots=[((-0.1, -0.15, 0.28), 0.16), ((-0.1, -0.15, 0.18), 0.14), ((-0.1, -0.26, 0.1), 0.12), ((0.5, -0.05, 0.28), 0.14), ((-0.45, 0.2, 0.28), 0.1)]),
}


def build_all():
    import paint
    from tcommon import set_materials, stone_mat
    for n, v in VARIANTS.items():
        w, d, h = v["dims"]
        fl = v["flip"]
        lwf, ldf, lhf = v["lip"]
        td, lw, ld, lh = d * 0.78, w * lwf, d * ldf, h * lhf
        r = 0.06
        rc = 0.16  # radius of the rounded front corner of the tread
        tread_extra = round_edge((0, -td / 2 + r, h - r), (0, -1, 0), (0, 0, 1), r, steps=3)
        tread_extra += round_edge((fl * (w / 2 - rc), -td / 2 + rc, 0), (fl, 0, 0), (0, -1, 0), rc, steps=5)
        tread = chipped_block(n + "_tread", "step", (w, td, h), v["seed"], tilt=0.6, facets=100, facet_tilt=3.5, facet_depth=(0.002, 0.01), corner_depth=(0.04, 0.10),
                              edge_depth=(0.014, 0.032), edge_facets=1, face_cut=(0.0, 0.008), corners=0.9, edges=6, bevel=0.008, segs=1, extra=tread_extra, texture_moss=False,
                              mats=(stone_mat(),), bite_kw=dict(top=3, base=0, vertical=0), flat_bottom=True, top_facets=14, top_tilt=1.5)
        tread.location.y = d / 2 - td / 2
        lip_extra = round_edge((fl * (lw / 2 - rc), -ld / 2 + rc, 0), (fl, 0, 0), (0, -1, 0), rc, steps=5)
        lip = chipped_block(n + "_lip", "step", (lw, ld, lh), v["seed"] + 3, tilt=1.0, facets=30, facet_tilt=3.5, facet_depth=(0.002, 0.008), top_facets=5, top_tilt=1.5, corner_depth=(0.03, 0.07), corners=0.6, edges=2,
                            bevel=0.004, segs=1, extra=lip_extra, texture_moss=False, mats=(stone_mat(),), flat_bottom=True)
        lip.location.x = fl * (w / 2 - lw / 2)
        lip.location.y = -d / 2 + ld / 2
        ob = union(tread, [lip], n)
        spec = paint.moss_spec(v["seed"], v["dims"], v["moss"])
        spec.update(spots=v["spots"], thresh=1.05 - 1.2 * v["moss"])
        set_materials(ob, paint.stone_moss_mat("M_" + n, spec, w_noise=0.5, w_up=0.2, w_prox=0.9, noise_scale=4.5))
    return list(VARIANTS)
