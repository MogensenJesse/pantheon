"""Part 'crank': windlass crank = short thick plank arm + round peg handle + dark iron bolt cap.
build(seed) -> {'crank': plate, 'crank_peg': peg, 'crank_cap': cap}, all in collection P_crank (inside PARTS).

Frame (assembly convention): plate thin along X (inner face on x = 0, outer face on x = t), width along Y
(centred on y = 0), long axis along Z, bottom on z = 0. Peg and cap stick out along +X from the outer face.
The bolt cap is on the windlass log axis (z = bolt_z), the peg is the handle end of the arm.

Materials: plate = M_crank_wood (copy of frozen M_plank, grain rotated to run along Z, own gain), peg = FROZEN
M_timber (untouched), cap = M_crank_iron (ready texture textures/iron.png, built with loop_mat).
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

# r01: first build from the reference (plate 0.12 x 0.36 x 0.045, 9-sided peg, octagon cap); too narrow/long/dark
# r03: peg 0.165 long, 4-ring whittled peg; colours re-measured (wood kept, peg/iron retinted)
# r02: plate 0.145 x 0.335 x 0.048 (silhouette ratio of the reference), fatter shorter peg, tighter plate corners,
#      per-material measured gain/tint (M_crank_wood from M_plank, M_crank_peg from M_timber, M_crank_iron)
P = dict(
    t=0.048, w=0.145, L=0.335,
    radii=(0.032, 0.015, 0.014, 0.016),  # corner radii in plan: bottom-left, bottom-right, top-right, top-left (y,z)
    corner_seg=4,
    bevel_out=0.012, bevel_in=0.009, bevel_seg=2, bevel_profile=0.55,
    groove_x=0.58, groove_half=0.004, groove_depth=0.0045,
    hew=0.0012,
    peg_d=0.08, peg_len=0.165, peg_z=0.07, peg_y=0.0, peg_sides=9, peg_jit=0.05, peg_taper=0.94,
    peg_edge_bevel=0.005, peg_rim_bevel=0.009,
    bolt_z=0.24, bolt_flat=0.082, bolt_sides=8, bolt_jit=0.03,
    sharp_deg=40.0,
)


def _coll():
    col = bpy.data.collections.get("P_crank") or bpy.data.collections.new("P_crank")
    parent = bpy.data.collections.get("PARTS")
    if parent is not None and col.name not in parent.children:
        parent.children.link(col)
    elif parent is None and col.name not in bpy.context.scene.collection.children:
        bpy.context.scene.collection.children.link(col)
    return col


def _fresh(name):
    old = bpy.data.objects.get(name)
    if old:
        me = old.data
        bpy.data.objects.remove(old)
        if me.users == 0:
            bpy.data.meshes.remove(me)


def _finish(bm, name, col, sharp=None):
    """bm -> object in col; smooth faces, creases sharper than `sharp` deg stay hard."""
    sharp = P["sharp_deg"] if sharp is None else sharp
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if e.is_manifold and e.calc_face_angle(0) > math.radians(sharp):
            e.smooth = False
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    col.objects.link(ob)
    return ob


def _tag(bm, faces, val=1.0):
    lay = bm.faces.layers.float.get("edge") or bm.faces.layers.float.new("edge")
    for f in faces:
        if f.is_valid:
            f[lay] = val


def _bevel_ring(bm, xx, offset, seg, profile):
    ring = [e for e in bm.edges if all(abs(v.co.x - xx) < 1e-6 for v in e.verts)]
    res = bmesh.ops.bevel(bm, geom=ring, offset=offset, segments=seg, profile=profile, affect="EDGES", clamp_overlap=False)
    _tag(bm, res["faces"])


def _plate(rnd, col):
    t, w, L = P["t"], P["w"], P["L"]
    pts = []
    corners = [(-w / 2, 0.0, 180), (w / 2, 0.0, 270), (w / 2, L, 0), (-w / 2, L, 90)]  # (cy, cz, start angle) before inset
    for (cy, cz, a0), r in zip(corners, P["radii"]):
        cy += r if cy < 0 else -r
        cz += r if cz == 0.0 else -r
        for i in range(P["corner_seg"] + 1):
            a = math.radians(a0 + 90.0 * i / P["corner_seg"])
            pts.append((cy + r * math.cos(a), cz + r * math.sin(a)))
    bm = bmesh.new()
    back = [bm.verts.new((0.0, y, z)) for y, z in pts]
    front = [bm.verts.new((t, y, z)) for y, z in pts]
    n = len(pts)
    bm.faces.new(back[::-1])
    bm.faces.new(front)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((back[i], back[j], front[j], front[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # 1. soft rounded rims, bigger on the outer face (tagged 'edge' for the faint highlight)
    _bevel_ring(bm, t, P["bevel_out"], P["bevel_seg"], P["bevel_profile"])
    _bevel_ring(bm, 0.0, P["bevel_in"], P["bevel_seg"], P["bevel_profile"])
    # 2. one V-groove loop round the side wall: the "two boards" seam of the reference
    gx, half = t * P["groove_x"], P["groove_half"]
    for off in (-half, half):
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(gx + off, 0, 0), plane_no=(1, 0, 0))
    res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(gx, 0, 0), plane_no=(1, 0, 0))
    bm.normal_update()
    for v in [g for g in res["geom_cut"] if isinstance(g, bmesh.types.BMVert)]:
        nrm = Vector((0, v.normal.y, v.normal.z))
        if nrm.length > 0.3:
            v.co -= nrm.normalized() * P["groove_depth"]
    # 3. slow hand-hewn wave on the outline (1 mm), then sit on z = 0
    ph = rnd.uniform(0, 6.28)
    for v in bm.verts:
        v.co.y += P["hew"] * math.sin(v.co.z * 17 + ph) * (1 if v.co.y > 0 else -1)
        v.co.z += P["hew"] * math.sin(v.co.y * 31 + ph * 1.7) * (1 if v.co.z > L / 2 else -1)
    zmin = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z -= zmin
    return _finish(bm, "crank", col)


def _peg(rnd, col):
    """Whittled peg: 4 rings along X, per-vertex radius random-walking along the length (facets that converge, bulge
    and wander a little), taper to the end, soft longitudinal bevels and a chamfered end rim."""
    t, n = P["t"], P["peg_sides"]
    R, x0, x1 = P["peg_d"] / 2, P["t"] * 0.45, P["t"] + P["peg_len"]
    xs = [x0, t + 0.012, (t + x1) / 2 + 0.01, x1]
    scale = [1.0, 1.0, 0.985, P["peg_taper"]]
    ph = rnd.uniform(0, 6.28)
    ang = [ph + 2 * math.pi * k / n + rnd.uniform(-0.06, 0.06) for k in range(n)]
    jit = [rnd.uniform(-P["peg_jit"], P["peg_jit"]) for _ in range(n)]
    bm = bmesh.new()
    rings = []
    for ri, (x, s) in enumerate(zip(xs, scale)):
        if ri:
            jit = [max(-0.08, min(0.08, j + rnd.uniform(-0.025, 0.025))) for j in jit]
        wy, wz = (rnd.uniform(-0.0015, 0.0015), rnd.uniform(-0.0015, 0.0015)) if ri > 1 else (0.0, 0.0)
        rings.append([bm.verts.new((x, P["peg_y"] + wy + R * (1 + jit[k]) * s * math.cos(ang[k]),
                                    P["peg_z"] + wz + R * (1 + jit[k]) * s * math.sin(ang[k]))) for k in range(n)])
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    for a, b in zip(rings, rings[1:]):
        for k in range(n):
            j = (k + 1) % n
            bm.faces.new((a[k], a[j], b[j], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    long_edges = [e for e in bm.edges if abs(e.verts[0].co.x - e.verts[1].co.x) > 1e-6]
    res = bmesh.ops.bevel(bm, geom=long_edges, offset=P["peg_edge_bevel"], segments=1, affect="EDGES", clamp_overlap=False)
    _tag(bm, res["faces"])
    xe = max(v.co.x for v in bm.verts)
    ring = [e for e in bm.edges if all(abs(v.co.x - xe) < 1e-6 for v in e.verts)]
    res = bmesh.ops.bevel(bm, geom=ring, offset=P["peg_rim_bevel"], segments=2, profile=0.6, affect="EDGES", clamp_overlap=False)
    _tag(bm, res["faces"])
    return _finish(bm, "crank_peg", col, sharp=50.0)


def _cap(rnd, col):
    t, n = P["t"], P["bolt_sides"]
    R = P["bolt_flat"] / 2 / math.cos(math.pi / n)
    prof = [(t - 0.004, 1.0), (t + 0.012, 1.0), (t + 0.0185, 0.93), (t + 0.0235, 0.80)]
    top_x = t + 0.0262
    bm = bmesh.new()
    rings, side_faces = [], []
    for ri, (x, s) in enumerate(prof):
        ring = []
        for k in range(n):
            a = math.pi / n + 2 * math.pi * k / n  # flat sides top/bottom/left/right like the reference
            r = R * s * (1 + (rnd.uniform(-P["bolt_jit"], P["bolt_jit"]) if ri >= 1 else 0))
            xx = x + (rnd.uniform(-0.0012, 0.0012) if ri >= 2 else 0)
            ring.append(bm.verts.new((xx, r * math.cos(a), P["bolt_z"] + r * math.sin(a))))
        rings.append(ring)
    bm.faces.new(rings[0][::-1])
    for i in range(len(rings) - 1):
        for k in range(n):
            j = (k + 1) % n
            f = bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k]))
            if i >= 1:
                side_faces.append(f)
    c = bm.verts.new((top_x + rnd.uniform(-0.001, 0.001), 0.0, P["bolt_z"]))
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((rings[-1][k], rings[-1][j], c))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    _tag(bm, side_faces)
    return _finish(bm, "crank_cap", col, sharp=40.0)


def _tint(m, rgb):
    """Multiply the colour just before the final gain scale by an RGB tint (node CRANK_TINT, created once)."""
    nt = m.node_tree
    sc = [n for n in nt.nodes if n.type == "VECT_MATH" and n.operation == "SCALE"][-1]
    mul = nt.nodes.get("CRANK_TINT")
    if mul is None:
        src = sc.inputs[0].links[0].from_socket
        mul = nt.nodes.new("ShaderNodeVectorMath")
        mul.operation, mul.name = "MULTIPLY", "CRANK_TINT"
        nt.links.new(src, mul.inputs[0])
        nt.links.new(mul.outputs[0], sc.inputs[0])
    mul.inputs[1].default_value = rgb


def _copy_mat(src, name, gain, tint):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials[src].copy()
        m.name = name
    next(nd for nd in m.node_tree.nodes if nd.type == "VALUE").outputs[0].default_value = gain
    _tint(m, tint)
    return m


def _wood_mat(gain, tint, tile=(1.0, 0.35, 1.0)):
    """Plate wood: copy of the frozen M_plank (same image, same grading), grain turned to run along Z, own gain/tint."""
    m = _copy_mat("M_plank", "M_crank_wood", gain, tint)
    mp = next(nd for nd in m.node_tree.nodes if nd.type == "MAPPING")
    # scale is applied before the rotation: x = thickness, y = across the grain, z = along the grain
    mp.inputs["Scale"].default_value = (1 / tile[0], 1 / tile[1], 1 / tile[2])
    mp.inputs["Rotation"].default_value = (math.pi / 2, 0.0, 0.0)
    return m


def _peg_mat(gain, tint):
    """Peg wood: copy of the frozen M_timber (it renders too dark on a small peg), own gain/tint. M_timber itself is untouched."""
    return _copy_mat("M_timber", "M_crank_peg", gain, tint)


def build(seed=1, wood_gain=0.51, wood_tint=(1.0, 0.955, 0.672), tile=(1.0, 0.35, 1.0), peg_gain=0.766, peg_tint=(1.0, 0.91, 0.97)):
    rnd = random.Random(seed)
    col = _coll()
    out = {}
    for name in ("crank", "crank_peg", "crank_cap"):
        _fresh(name)
    out["crank"] = _plate(rnd, col)
    out["crank_peg"] = _peg(rnd, col)
    out["crank_cap"] = _cap(rnd, col)
    out["crank"].data.materials.append(_wood_mat(wood_gain, wood_tint, tile))
    out["crank_peg"].data.materials.append(_peg_mat(peg_gain, peg_tint))
    # M_crank_iron is made by the driver (needs loop_mat)
    return out
