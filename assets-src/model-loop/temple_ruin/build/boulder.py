"""Part 'boulder': a large faceted cairn-like rock (r07, judge 3.1): the body leans in as it rises (5 inward-tilted side planes), then five steeper planes
meet in an off-centre peak at ~35% of the base width; chipped_block adds 16 facets and big corner chips on top. 3-5 squat wedge lobes with sloped
tops are fused into its flanks at different heights. Moss is the material mask driven mostly by facet normal, so every up-facing facet
(the peak, the lobe tops, ledges) carries a patch with a polygon edge."""
import math
import random

import bpy

import paint
from tcommon import chipped_block, join, set_materials, stone_mat

VARIANTS = {
    "boulder_a": dict(dims=(1.20, 1.00, 1.10), seed=81, moss=0.36, lumps=5, lean=0.12),
    "boulder_b": dict(dims=(1.30, 1.05, 1.00), seed=85, moss=0.3, lumps=6, lean=-0.1),
    "boulder_c": dict(dims=(1.00, 0.95, 1.15), seed=83, moss=0.42, lumps=4, lean=0.16),
}


def _cone_planes(rnd, w, d, h, lean, apex=0.32, side_tilt=(10, 20), peak_tilt=(34, 50)):
    """Cut planes (point, outward normal) that turn a box into a leaning faceted cone with a peak at (lean * w, 0, h)."""
    rho = 0.5 * min(w, d)
    out = []
    n_side = 5
    for i in range(n_side):  # the flanks lean in: outward normals tilted up by 14-24 degrees, through the footprint edge
        th = (i + rnd.uniform(-0.25, 0.25)) * math.tau / n_side
        psi = math.radians(rnd.uniform(*side_tilt))
        n = (math.cos(th) * math.cos(psi), math.sin(th) * math.cos(psi), math.sin(psi))
        out.append(((math.cos(th) * rho * 1.0, math.sin(th) * rho * 1.0, 0.0), n))
    for i in range(n_side):  # the peak: steeper planes through a ring of radius apex * rho around the lean point
        th = (i + rnd.uniform(-0.3, 0.3) + 0.5) * math.tau / n_side
        phi = math.radians(rnd.uniform(*peak_tilt))
        n = (math.cos(th) * math.sin(phi), math.sin(th) * math.sin(phi), math.cos(phi))
        ar = apex * rho
        out.append(((lean * w + math.cos(th) * ar, math.sin(th) * ar, h - ar * math.tan(phi)), n))
    return out


def _rock(name, dims, seed, lean, big):
    w, d, h = dims
    rnd = random.Random(seed * 3 + 1)
    extra = _cone_planes(rnd, w, d, h, lean, apex=0.32 if big else 0.5)
    return chipped_block(name, "boulder", dims, seed, tilt=3.0, facets=24 if big else 10, facet_tilt=14.0, facet_depth=(0.02, 0.08) if big else (0.01, 0.04), corners=0.8, corner_depth=(0.06, 0.16) if big else (0.03, 0.07),
                         edges=4, edge_depth=(0.02, 0.07), face_cut=(0.0, 0.03), bevel=0.015, segs=1, extra=extra, texture_moss=False, mats=(stone_mat(),))


def build_all():
    for n, v in VARIANTS.items():
        w, d, h = v["dims"]
        rnd = random.Random(v["seed"])
        parts = [_rock(n + "_main", v["dims"], v["seed"], v["lean"], True)]
        for i in range(v["lumps"]):
            lw, ld, lh = w * rnd.uniform(0.45, 0.65), d * rnd.uniform(0.45, 0.65), h * rnd.uniform(0.3, 0.5)
            o = _rock(f"{n}_l{i}", (lw, ld, lh), v["seed"] * 7 + i, rnd.uniform(-0.1, 0.1), False)
            ang = (i + rnd.uniform(-0.2, 0.2)) * math.tau / v["lumps"] + rnd.uniform(0, 1.0)
            o.location = (math.cos(ang) * w * 0.3, math.sin(ang) * d * 0.3, rnd.uniform(-0.02, 0.22) * h)
            o.rotation_euler = (0, 0, rnd.uniform(0, 3.14))
            bpy.context.view_layer.update()
            parts.append(o)
        for o in parts:
            o.select_set(True)
        ob = join(parts, n, "boulder")
        ob.location = (0, 0, 0)
        ob.rotation_euler = (0, 0, 0)
        spec = paint.moss_spec(v["seed"], v["dims"], v["moss"])
        spec.update(spots=[((v["lean"] * w, 0.0, h), max(w, d) * 0.8)], thresh=1.18 - 1.1 * v["moss"])
        set_materials(ob, paint.stone_moss_mat("M_" + n, spec, w_noise=0.5, w_up=0.8, w_prox=0.35, noise_scale=7.0, tile_m=1.5))
    return list(VARIANTS)
