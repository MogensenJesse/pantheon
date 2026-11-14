"""Measure a material's colour on the reference and on a render, and print the tint / gain change that would match them.

    python3 build/colmeasure.py <stone|bark|leaf> <ref.png> <render_ref.png> <render_mask.png> [tint r,g,b] [gain]

colstats.mjs (model-loop) only counts saturated pixels: on grey stone that is the glow, on bark the moss. This one
measures the material itself: object pixels (reference: unlike its plain border colour; render: the alpha of the
mask pass), minus the cyan glow (stone) or the green moss (bark). 'top' = median of the brightest 40 %, 'side' =
median of the darkest 30 %, as colstats defines them. The suggestion follows model-loop's rule: scale tint per
channel by (target / current) ^ 2.2, normalise it to a maximum of 1, fold the rest into gain.
"""
import sys

import numpy as np
from PIL import Image


def stats(rgb, obj, kind):
    r, g, b = (rgb[..., i].astype(float) for i in range(3))
    if kind == "stone":
        keep = obj & ~((b > r + 18) & (g > r + 10))          # not the cyan rune
    elif kind == "leaf":
        keep = obj & (g > r + 4)                             # only the green
    else:
        keep = obj & ~(g > r + 4)                            # not the moss
    px = rgb[keep].astype(float)
    order = np.argsort(px.mean(1))
    px = px[order]
    top, side = px[int(len(px) * 0.6):], px[:int(len(px) * 0.3)]
    return np.median(top, 0), np.median(side, 0), np.median(px, 0), len(px)


def main(kind, ref, render, mask, tint="1,1,1", gain="1"):
    a = np.asarray(Image.open(ref).convert("RGB"))
    edge = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(edge, 0)
    obj_ref = np.abs(a.astype(float) - bg).max(2) > 28
    rt, rs, rm, n1 = stats(a, obj_ref, kind)
    b = np.asarray(Image.open(render).convert("RGB"))
    m = np.asarray(Image.open(mask).convert("RGBA"))[..., 3] > 200
    ct, cs, cm, n2 = stats(b, m, kind)
    hx = lambda c: "#" + "".join(f"{int(round(v)):02x}" for v in c)
    print(f"reference  top {hx(rt)} side {hx(rs)} all {hx(rm)}  (n {n1})")
    print(f"render     top {hx(ct)} side {hx(cs)} all {hx(cm)}  (n {n2})")
    k = (rm / np.maximum(cm, 1)) ** 2.2
    t0 = np.array([float(v) for v in tint.split(",")]) * k * float(gain)
    g1 = t0.max()
    print("suggest    tint (%.3f, %.3f, %.3f)  gain %.3f   (from tint %s gain %s)" % (*(t0 / g1), g1, tint, gain))
    print("contrast   top/side value ratio: reference %.2f, render %.2f" % (rt.mean() / rs.mean(), ct.mean() / cs.mean()))


if __name__ == "__main__":
    main(*sys.argv[1:])
