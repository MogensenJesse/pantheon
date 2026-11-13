"""Part 'plank': chunky stylised deck plank. build(name, seed, dims) -> object in P_plank.

Order matters (r07-r08 lessons):
  1. box -> steep corner cut at the +X end, +Y (back) corner -> dissolve the cut's leftovers
  2. rounded plan corners (vertical edges), then the top rim bevel (2 segments) and a small bottom round,
     on the still-simple box: unclamped bevels need corner radii >= the bevel width, and no extra loops
     (segment loops crossing an unclamped bevel give sawtooth spikes)
  3. then cut lengthwise segments and the groove through everything (bisect keeps the 'edge' face tag)
  4. then bend: warp, twist, edge wave, crown, dips, padded sides, dings (needs those segments;
     dissolve_limit after this point would merge them away)
Layout is fixed (+X end, +Y side) to match the reference; the deck varies it by rotating/mirroring copies.
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

P = dict(segments=14, cut_len=0.10, cut_width=0.76, groove_off=0.04, groove_half=0.005, groove_depth=0.006,
         groove_stop=0.025, corner_bevel=(0.02, 0.03), corner_far_left=0.035, cut_corner_side=0.018,
         cut_corner_end=0.016, bevel=0.012, bevel_segments=2, bottom_bevel=0.005,
         warp=0.003, twist_deg=1.0, wave=0.003, wave_freq=14.0, zwave=0.003, zwave_freq=15.0, crown=0.003,
         dips=2, dip_depth=0.003, side_pad=0.003, dings=3, ding_depth=0.004, sharp_deg=40.0)


def _all(bm):
    return bm.verts[:] + bm.edges[:] + bm.faces[:]


def _is_vertical(e):
    return abs(e.verts[0].co.z - e.verts[1].co.z) > 0.9 * e.calc_length()


def build(name="plank_a", seed=1, dims=(0.62, 0.26, 0.07), col="P_plank"):
    rnd = random.Random(seed)
    L, W, T = dims
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * L, v.co.y * W, v.co.z * T + T / 2))
    # 1. corner cut
    a = Vector((L / 2 - P["cut_len"], W / 2, 0))
    b = Vector((L / 2, W / 2 - P["cut_width"] * W, 0))
    d = b - a
    no = Vector((-d.y, d.x, 0)).normalized()
    if no.x < 0:
        no = -no
    res = bmesh.ops.bisect_plane(bm, geom=_all(bm), plane_co=a, plane_no=no, clear_outer=True)
    edges = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and e.is_valid]
    if edges:
        bmesh.ops.edgeloop_fill(bm, edges=edges)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(0.5), verts=bm.verts[:], edges=bm.edges[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # 2a. rounded plan corners, each with its own radius
    corners = [(e.verts[0].co.x, e.verts[0].co.y) for e in bm.edges if _is_vertical(e)]
    for cx, cy in corners:
        e = next((e for e in bm.edges if e.is_valid and _is_vertical(e)
                  and abs(e.verts[0].co.x - cx) < 1e-6 and abs(e.verts[0].co.y - cy) < 1e-6), None)
        if e is None:
            continue
        if cx < 0 and cy > 0:
            off = P["corner_far_left"]
        elif abs(cx - (L / 2 - P["cut_len"])) < 1e-4:
            off = P["cut_corner_side"]
        elif abs(cx - L / 2) < 1e-4 and cy > -W / 2 + 1e-4:
            off = P["cut_corner_end"]
        else:
            off = rnd.uniform(*P["corner_bevel"])
        bmesh.ops.bevel(bm, geom=[e], offset=off, segments=3, profile=0.5, affect="EDGES", clamp_overlap=True)
    # 2b. top rim bevel (tagged 'edge' for the highlight) and a small bottom round, on the simple box
    lay = bm.faces.layers.float.get("edge") or bm.faces.layers.float.new("edge")
    flat = [e for e in bm.edges if e.is_manifold and not _is_vertical(e) and e.calc_face_angle(0) > math.radians(10)]
    bottom = [e for e in flat if max(v.co.z for v in e.verts) < T * 0.5]
    bmesh.ops.bevel(bm, geom=bottom, offset=P["bottom_bevel"], segments=2, profile=0.5, affect="EDGES", clamp_overlap=False)
    top = [e for e in bm.edges if e.is_valid and e.is_manifold and not _is_vertical(e)
           and min(v.co.z for v in e.verts) > T * 0.5 and e.calc_face_angle(0) > math.radians(10)]
    res = bmesh.ops.bevel(bm, geom=top, offset=P["bevel"], segments=P["bevel_segments"], profile=0.5,
                          affect="EDGES", clamp_overlap=False)
    for f in res["faces"]:
        if f.is_valid:
            f[lay] = 1.0
    # 3. lengthwise segments and the groove, cut through everything
    for i in range(1, P["segments"]):
        bmesh.ops.bisect_plane(bm, geom=_all(bm), plane_co=(-L / 2 + L * i / P["segments"], 0, 0), plane_no=(1, 0, 0))
    gy = P["groove_off"]
    for y in (gy - P["groove_half"], gy + P["groove_half"]):
        bmesh.ops.bisect_plane(bm, geom=_all(bm), plane_co=(0, y, 0), plane_no=(0, 1, 0))
    res = bmesh.ops.bisect_plane(bm, geom=_all(bm), plane_co=(0, gy, 0), plane_no=(0, 1, 0))
    groove_verts = set()
    for v in [g for g in res["geom_cut"] if isinstance(g, bmesh.types.BMVert)]:
        if v.co.z > T - 1e-5 and abs(v.co.x) < L / 2 - P["groove_stop"]:
            v.co.z -= P["groove_depth"]
            groove_verts.add(v)
    # 4. bend and wear
    for _ in range(P["dings"]):
        dx = rnd.uniform(-L / 2 + 0.05, L / 2 - 0.12)
        dy = rnd.choice((-1, 1)) * (W / 2 - 0.006)
        for v in bm.verts:
            if v.co.z > T - P["bevel"] - 1e-4:
                d2 = ((v.co.x - dx) / 0.012) ** 2 + ((v.co.y - dy) / 0.02) ** 2
                if d2 < 1:
                    v.co.z -= P["ding_depth"] * (1 - d2)
    ph = rnd.uniform(0, 6.28)
    dips = [(-L / 2 + L * rnd.uniform(0.08, 0.33), rnd.uniform(0.04, 0.07)) for _ in range(P["dips"])]
    for v in bm.verts:
        t = v.co.x / (L / 2)
        v.co.z += P["warp"] * (1 - t * t)
        v.co.y += P["wave"] * math.sin(v.co.x * P["wave_freq"] + ph) * (abs(v.co.y) / (W / 2))
        if abs(v.co.y) > W / 2 - 0.004:
            v.co.y += P["side_pad"] * math.sin(math.pi * min(max(v.co.z / T, 0.0), 1.0)) * (1 if v.co.y > 0 else -1)
        if v.co.z > T * 0.6:
            v.co.z += P["zwave"] * math.sin(v.co.x * P["zwave_freq"] + ph * 1.7) * (abs(v.co.y) / (W / 2))
            v.co.z += P["crown"] * max(0.0, 1 - (2 * v.co.y / W) ** 2)
            if v.co.y < -W / 4:
                for dx, r in dips:
                    k = max(0.0, 1 - ((v.co.x - dx) / r) ** 2)
                    v.co.z -= P["dip_depth"] * k * min(1.0, (-v.co.y - W / 4) / (W / 4))
        ang = math.radians(P["twist_deg"]) * t
        y, z = v.co.y, v.co.z - T / 2
        v.co.y, v.co.z = y * math.cos(ang) - z * math.sin(ang), y * math.sin(ang) + z * math.cos(ang) + T / 2
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        e.smooth = not (e.is_manifold and e.calc_face_angle(0) > math.radians(P["sharp_deg"]))
        if e.verts[0] in groove_verts and e.verts[1] in groove_verts:
            e.smooth = False  # crisp V so the groove reads as a line
    zmin = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z -= zmin
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.data.collections[col].objects.link(ob)
    mat = bpy.data.materials.get("M_plank") or bpy.data.materials.new("M_plank")
    me.materials.append(mat)
    return ob
