"""Part 'rubble': a heap of broken angular stone (r06, judge 4.5): one tall leaning chunk at the centre, 3-4 medium chunks fused against it, and
small chips lying against their foot (all fused into one solid). Chunks are tilted, tapered wedges (not boxes) with 12 facets; moss is a
polygon-edged mask on the tall chunk and one medium chunk, the rest stays bare stone."""
import math
import random

import bpy

import paint
from tcommon import chipped_block, set_materials, stone_mat, union

VARIANTS = {
    "rubble_a": dict(seed=91, med=3, chips=6, moss=0.28),
    "rubble_b": dict(seed=97, med=4, chips=5, moss=0.3),
    "rubble_c": dict(seed=98, med=4, chips=7, moss=0.14),
    "rubble_d": dict(seed=94, med=3, chips=5, moss=0.2),
}


def _chunk(name, seed, r, tall, x, y, rnd, tilt):
    dims = (r * rnd.uniform(1.5, 1.9), r * rnd.uniform(1.3, 1.6), r * rnd.uniform(1.6, 1.9)) if tall else (r * rnd.uniform(2.0, 2.6), r * rnd.uniform(1.5, 2.0), r * rnd.uniform(0.7, 1.0))
    o = chipped_block(name, "rubble", dims, seed, tilt=14.0, facets=24, facet_tilt=14.0, facet_depth=(0.05 * r, 0.25 * r), corners=1.0, corner_depth=(0.2 * r, 0.5 * r),
                      edges=6, edge_depth=(0.1 * r, 0.3 * r), bevel=0.0025, segs=1, texture_moss=False, mats=(stone_mat(),))
    o.location = (x, y, 0)
    o.rotation_euler = (rnd.uniform(-tilt, tilt), rnd.uniform(-tilt, tilt), rnd.uniform(0, 6.28))
    bpy.context.view_layer.update()
    o.location.z = -min((o.matrix_world @ vv.co).z for vv in o.data.vertices)  # rest on the ground
    return o


def build_all():
    for name, v in VARIANTS.items():
        rnd = random.Random(v["seed"])
        tall = _chunk(f"{name}_t", v["seed"] * 11, 0.09, True, 0.0, 0.0, rnd, 0.3)
        parts, placed = [], [(0.0, 0.0, 0.07)]  # (x, y, reach): every new chunk leans on one already placed, so the heap fuses into one solid
        for i in range(v["med"] + v["chips"]):
            chip = i >= v["med"]
            rr = rnd.uniform(0.025, 0.035) if chip else rnd.uniform(0.055, 0.07)
            px, py, pr = rnd.choice(placed if not chip else placed[1:] or placed)
            ang = rnd.uniform(0, math.tau)
            d = (pr + rr * (0.8 if chip else 1.3)) * 0.5
            x, y = px + math.cos(ang) * d, py + math.sin(ang) * d
            placed.append((x, y, rr * (0.8 if chip else 1.3)))
            parts.append(_chunk(f"{name}_{'c' if chip else 'm'}{i}", v["seed"] * 11 + 1 + i, rr, False, x, y, rnd, 0.4))
        bpy.context.view_layer.update()
        ob = union(tall, parts, name)
        ob.location = (0, 0, 0)
        ob.rotation_euler = (0, 0, 0)
        spec = paint.moss_spec(v["seed"], (0.3, 0.25, 0.2), v["moss"])
        spec.update(spots=[((0.0, 0.0, 0.17), 0.06), ((rnd.uniform(-0.14, 0.14), rnd.uniform(-0.12, 0.12), 0.08), 0.05)], thresh=1.1 - 1.1 * v["moss"])
        set_materials(ob, paint.stone_moss_mat("M_" + name, spec, w_noise=0.45, w_up=0.6, w_prox=0.45, noise_scale=22.0, tile_m=0.45))
    return list(VARIANTS)
