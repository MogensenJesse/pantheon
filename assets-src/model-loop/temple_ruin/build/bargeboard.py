"""Part 'bargeboard': long weathered gable board with a bold 3-strand interlace braid between two chunky rails, standing proud of the face (r03, judge 4.5):
about 9 crossings over the length, strands 6.5 cm wide and 1.6-2.8 cm proud, rails 5.5 cm tall and 3 cm proud. Length along X, the carved face looks to -Y.
bargeboard_a is whole with notches along the top rail, bargeboard_b is broken at one end (a slanted split plus splinters). Pale grey-tan timber with
a few small painted moss patches (material mask)."""
import math

import bmesh
from mathutils import Vector

import paint
import shapes
from tcommon import chipped_block, set_materials, timber_mat

VARIANTS = {
    "bargeboard_a": dict(seed=131, dims=(4.5, 0.12, 0.34), period=2.5, amp=0.085, split=False, moss=0.12,
                         spots=[((-2.0, 0.0, 0.08), 0.22), ((-0.7, 0.0, 0.34), 0.2), ((1.1, 0.0, 0.2), 0.18)]),
    "bargeboard_b": dict(seed=132, dims=(3.6, 0.12, 0.34), period=2.3, amp=0.085, split=True, moss=0.12,
                         spots=[((-1.5, 0.0, 0.34), 0.2), ((0.3, 0.0, 0.1), 0.22)]),
}


def _weave(x0, x1, period, amp, phase, n=120):
    return [(x0 + (x1 - x0) * i / n, amp * math.sin(math.tau * (x1 - x0) * (i / n) / period + phase)) for i in range(n + 1)]


def build_all():
    for name, v in VARIANTS.items():
        L, t, h = v["dims"]
        extra = [((L / 2 - 0.35, 0, 0), (math.cos(math.radians(35)), 0.0, math.sin(math.radians(35))))] if v["split"] else [((L / 2 - 0.03, 0, 0), (1.0, 0.15, 0.1))]
        extra += [((-L / 2 + 0.03, 0, 0), (-1.0, -0.12, 0.08))]
        ob = chipped_block(name, "bargeboard", v["dims"], v["seed"], tilt=0.0, face_cut=(0.0, 0.0), corners=0.6, corner_depth=(0.02, 0.05), edges=3,
                           edge_depth=(0.006, 0.014), bevel=0.01, segs=1, extra=extra, texture_moss=False, mats=(timber_mat(),),
                           bite_kw=dict(top=5, base=2, vertical=0, size=(0.03, 0.07)))
        if v["split"]:  # splinters: thin horizontal slots into the broken end, each finger cut off at its own length
            xe = L / 2 - 0.0
            boxes = []
            for z in (h * 0.3, h * 0.55, h * 0.78):
                boxes.append(((xe - 0.5, 0.0, z), (1.1, t * 1.6, 0.011), (0, 0, 0)))
            for i, ang in enumerate((-0.45, 0.4, -0.3, 0.5)):
                zc = h * (0.12 + 0.24 * i)
                boxes.append(((xe - 0.1 - 0.12 * i, 0.0, zc), (0.5, t * 1.6, h * 0.26), (0, ang, 0)))
            paint.cut_boxes(ob, boxes)
            paint.drop_islands(ob)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        O, U, V, N = Vector((0, -t / 2, h / 2)), (1, 0, 0), (0, 0, 1), (0, -1, 0)
        x0, x1 = -L / 2 + 0.1, (L / 2 - 0.1) - (0.57 if v["split"] else 0)
        for k, (dep, sk) in enumerate(((0.028, 0.004), (0.022, 0.0055), (0.016, 0.007))):  # three strands, each a different height so none shares a plane where it crosses
            shapes.ribbon(bm, _weave(x0, x1, v["period"], v["amp"], k * math.tau / 3), 0.065, O, U, V, N, depth=dep, sink=sk)
        for b in (-(h / 2 - 0.035), h / 2 - 0.04):  # the two rails
            shapes.ribbon(bm, [(x0 - 0.05, b), (x1 + 0.05, b)], 0.05, O, U, V, N, depth=0.04, sink=0.008)
        bm.to_mesh(ob.data)
        bm.free()
        spec = paint.moss_spec(v["seed"], v["dims"], v["moss"])
        spec.update(spots=v["spots"], thresh=1.05 - 1.2 * v["moss"])
        set_materials(ob, paint.stone_moss_mat("M_" + name, spec, w_noise=0.5, w_up=0.3, w_prox=0.8, noise_scale=16.0, kind="timber"))
    return list(VARIANTS)
