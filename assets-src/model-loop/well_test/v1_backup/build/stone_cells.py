"""Part 'stone': chunky stylised well-shaft block. build(name, seed, dims) -> object in P_stone.

Recipe 3 (shaft judge r04: "lumpy melted clay" because the facets were cut first and rounded after).
Round first, then chisel:
  1. cage: box with a 2x2 grid per face, front bowed, face centres pushed out (bulge), box edges
     creased -> Subsurf level 4 -> a rounded loaf (corner radius ~5 cm) with flat-ish faces
  2. chisel: 3-5 cells per face; inside a cell every vertex is cut down onto that cell's plane
     (tilted 4-7 deg, sunk ~1-1.5 cm), fading to 0 at the cell border and on the rounded edges
     -> flat chisel facets, soft ridges between them, round corners untouched
  3. 'fvar' point attribute = one random value per cell (per-facet value in the material)
The previous recipe (convex polyhedron + creased subsurf) is in stone_r05.py.
"""
import math
import random

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

P = dict(crease=0.3, levels=4, cut_smooth=4, bow=0.012, bulge={"side": 0.015, "top": 0.008},
         cells={"front": 5, "back": 4, "endL": 3, "endR": 3, "top": 4},
         tilt=(4.0, 7.0), depth=(0.009, 0.015), ramp=0.5, align=(0.8, 0.93))
FACES = {"front": (1, -1), "back": (1, 1), "endL": (0, -1), "endR": (0, 1), "top": (2, 1)}  # axis, sign


def _rot(v, axis, deg):
    return np.array(Matrix.Rotation(math.radians(deg), 3, Vector(axis).normalized()) @ Vector(v))


def build(name="stone_a", seed=1, dims=(0.42, 0.24, 0.25), col="P_stone"):
    rnd = random.Random(seed)
    w, d, h = dims
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old)
    # 1. cage
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
    for v in bm.verts:
        x, y, z = v.co.x * w, v.co.y * d, v.co.z * h + h / 2
        on = [abs(abs(v.co.x) - 0.5) < 1e-6, abs(abs(v.co.y) - 0.5) < 1e-6, abs(abs(v.co.z) - 0.5) < 1e-6]
        if sum(on) == 1:  # a face centre: push out so the face bulges
            k = on.index(True)
            if not (k == 2 and v.co.z < 0):  # the bed stays flat
                b = P["bulge"]["top" if k == 2 else "side"]
                if k == 0:
                    x += b * (1 if x > 0 else -1)
                elif k == 1:
                    y += b * (1 if y > 0 else -1)
                else:
                    z += b
        if y < 0:  # bow the front in plan
            y -= P["bow"] * (1 - (2 * x / w) ** 2)
        v.co = Vector((x, y, z))
    cl = bm.edges.layers.float.get("crease_edge") or bm.edges.layers.float.new("crease_edge")
    for e in bm.edges:
        e[cl] = P["crease"] if (e.is_manifold and e.calc_face_angle(0) > math.radians(45)) else 0.0
    me = bpy.data.meshes.new(name + "_cage")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.data.collections[col].objects.link(ob)
    sub = ob.modifiers.new("Subsurf", "SUBSURF")
    sub.levels = sub.render_levels = P["levels"]
    dg = bpy.context.evaluated_depsgraph_get()
    dense = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    ob.data = dense
    bpy.data.meshes.remove(me)
    dense.name = name
    # 2. chisel cells per face
    n = len(dense.vertices)
    co = np.empty(n * 3)
    dense.vertices.foreach_get("co", co)
    co = co.reshape(n, 3)
    nor = np.empty(n * 3)
    dense.vertex_normals.foreach_get("vector", nor)
    nor = nor.reshape(n, 3)
    fvar = np.full(n, 0.5)
    cut_all = np.zeros(n)  # cut depth per vertex, smoothed over the mesh before it is applied (no stair steps)
    dir_all = nor.copy()   # direction of the cut (its cell's plane normal)
    for f, (a, sgn) in FACES.items():
        nf = np.zeros(3)
        nf[a] = sgn
        align = nor @ nf
        idx = np.nonzero(align > P["align"][0])[0]
        if len(idx) < 30:
            continue
        pts = co[idx]
        others = [k for k in range(3) if k != a]
        ext = (pts[:, others].max(axis=0) - pts[:, others].min(axis=0))
        cnt = P["cells"][f]
        gap = 0.8 * math.sqrt(ext[0] * ext[1] / cnt)
        seeds = []
        for _ in range(cnt * 80):
            s = pts[rnd.randrange(len(pts))]
            if all(np.linalg.norm(s - o) > gap for o in seeds):
                seeds.append(s)
                if len(seeds) == cnt:
                    break
        seeds = np.array(seeds)
        planes_m, planes_q = [], []
        for s in seeds:
            m = _rot(nf, np.cross(nf, [rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1)]), rnd.uniform(*P["tilt"]))
            planes_m.append(m / np.linalg.norm(m))
            planes_q.append(s - nf * rnd.uniform(*P["depth"]))
        planes_m, planes_q = np.array(planes_m), np.array(planes_q)
        dist = np.linalg.norm(pts[:, None, :] - seeds[None, :, :], axis=2)
        order = np.argsort(dist, axis=1)
        f1 = np.take_along_axis(dist, order[:, :1], 1)[:, 0]
        f2 = np.take_along_axis(dist, order[:, 1:2], 1)[:, 0] if len(seeds) > 1 else f1 * 3 + 1
        who = order[:, 0]
        m = planes_m[who]
        s_above = np.einsum("vk,vk->v", pts - planes_q[who], m)
        wgt = np.clip((1 - f1 / np.maximum(f2, 1e-6)) / P["ramp"], 0, 1)  # 0 on the ridge between cells
        lo, hi = P["align"]
        wgt *= np.clip((align[idx] - lo) / (hi - lo), 0, 1)  # 0 on the rounded edges
        cut = np.maximum(s_above, 0) * wgt
        cut_all[idx] = cut
        dir_all[idx] = m
        vals = np.array([rnd.random() for _ in seeds])
        fvar[idx] = np.where(wgt > 0.5, vals[who], fvar[idx])
    ev = np.empty(len(dense.edges) * 2, dtype=np.int64)
    dense.edges.foreach_get("vertices", ev)
    ev = ev.reshape(-1, 2)
    cnt_n = np.zeros(n)
    np.add.at(cnt_n, ev[:, 0], 1)
    np.add.at(cnt_n, ev[:, 1], 1)
    for _ in range(P["cut_smooth"]):
        acc = np.zeros(n)
        np.add.at(acc, ev[:, 0], cut_all[ev[:, 1]])
        np.add.at(acc, ev[:, 1], cut_all[ev[:, 0]])
        cut_all = 0.5 * cut_all + 0.5 * acc / np.maximum(cnt_n, 1)
    co -= dir_all * cut_all[:, None]
    co[:, 2] -= co[:, 2].min()
    dense.vertices.foreach_set("co", co.ravel())
    dense.update()
    attr = dense.attributes.get("fvar") or dense.attributes.new("fvar", "FLOAT", "POINT")
    attr.data.foreach_set("value", fvar)
    dense.shade_smooth()
    mat = bpy.data.materials.get("M_stone") or bpy.data.materials.new("M_stone")
    dense.materials.append(mat)
    return ob
