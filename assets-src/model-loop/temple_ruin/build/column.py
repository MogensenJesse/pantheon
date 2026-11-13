"""Shared builder of the temple's stone columns (pillar and stele): a chipped base block, a square shaft, a recessed neck and a stepped / overhanging
cap, fused into one solid, with chunky spiral-key relief panels (and an optional fluted strip) on the faces. Moss is the material mask
(paint.py) with several patches. Everything is a chipped_block (tilted planes, corner chips, bites), so no edge is a ruler line."""
import math

import bmesh
import bpy
from mathutils import Vector

import paint
import shapes
from tcommon import chipped_block, set_materials, stone_mat, union


def _block(name, seed, dims, z, **kw):
    part = name.split("_")[0]
    kw = dict(dict(tilt=1.5, facets=4, corners=0.8, corner_depth=(0.025, 0.06), edges=6, edge_depth=(0.015, 0.035), edge_facets=1, bevel=0.012, segs=1, texture_moss=False, mats=(stone_mat(),)), **kw)
    ob = chipped_block(name, part, dims, seed, **kw)
    ob.location.z = z
    return ob


def build(name, seed, shaft, shaft_h, base=None, neck=None, caps=(), panels=(), panel_size=0.4, bar=0.05, relief=0.03, mirror0=False, faces=4,
          flutes=None, break_planes=(), moss=0.2, spots=None, fluted_z=None):
    """shaft = (w, d); base / neck = (w, d, h); caps = [(w, d, h), ...] from the shaft upward; panels = z of each meander centre (from the ground);
    faces = how many sides carry panels (1 = front only, -Y); flutes = (z0, height) of a 3-slot strip under the first panel; break_planes = planes
    cutting the shaft top (point, normal) for a broken column; spots = [(point, radius)] of moss patches."""
    sw, sd = shaft
    parts, z = [], 0.0
    if base:
        parts.append(_block(name + "_base", seed + 1, base, 0.0, facets=3, bite_kw=dict(top=1, base=1, vertical=3, size=(0.06, 0.11))))
        z = base[2] - 0.01
    sh = chipped_block(name + "_shaft", name.split("_")[0], (sw, sd, shaft_h), seed, tilt=0.0, face_cut=(0.0, 0.0), corners=0.5, corner_depth=(0.03, 0.07), edges=2,
                       bevel=0.014, segs=1, facets=6, facet_tilt=2.0, extra=list(break_planes), texture_moss=False, mats=(stone_mat(),),
                       bite_kw=dict(top=2, base=1, vertical=1))
    sh.location.z = z
    top = z + shaft_h
    if neck:
        n = _block(name + "_neck", seed + 5, neck, top - 0.01, tilt=0.5, facets=2, corners=0.5, bite_kw=dict(top=1, base=0, vertical=0))
        parts.append(n)
        top += neck[2] - 0.01
    for i, c in enumerate(caps):
        parts.append(_block(name + "_cap%d" % i, seed + 10 + i, c, top - 0.01, facets=7 if i == len(caps) - 1 else 2, corner_depth=(0.035, 0.08) if i == len(caps) - 1 else (0.02, 0.04), bite_kw=dict(top=2 if i == len(caps) - 1 else 0, base=0, vertical=0)))
        top += c[2] - 0.01
    bpy.context.view_layer.update()
    ob = union(sh, parts, name)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    sides = [((0, -sd / 2, 0), (1, 0, 0), (0, -1, 0)), ((sw / 2, 0, 0), (0, 1, 0), (1, 0, 0)), ((0, sd / 2, 0), (-1, 0, 0), (0, 1, 0)), ((-sw / 2, 0, 0), (0, -1, 0), (-1, 0, 0))]
    for k, zc in enumerate(panels):
        for i, (c, u, nrm) in enumerate(sides[:faces]):
            shapes.meander(bm, panel_size, Vector((c[0], c[1], zc)), u, (0, 0, 1), nrm, mirror=bool((i + k) % 2) != mirror0, width=bar, depth=relief, sink=0.02)
    if flutes:  # a strip of three recessed slots, drawn as four raised ribs between them
        z0, fh = flutes
        rib = bar * 0.7
        span = panel_size * 0.8
        for j in range(4):
            x = -span / 2 + span * j / 3
            shapes.ribbon(bm, [(0, 0), (0, fh)], rib, Vector((x, -sd / 2, z0)), (1, 0, 0), (0, 0, 1), (0, -1, 0), depth=relief * 0.8, sink=0.02)
    bm.to_mesh(ob.data)
    bm.free()
    h = top
    spec = paint.moss_spec(seed, (sw, sd, h), moss)
    spec.update(spots=spots or [(spec["p0"], 0.35)], thresh=1.05 - 1.2 * moss)
    set_materials(ob, paint.stone_moss_mat("M_" + name, spec, w_noise=0.45, w_up=0.25, w_prox=0.8, noise_scale=10.0, cell=1.0))
    return ob
