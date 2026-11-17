"""First assembly of the great tree from its pieces, with the two procedural assets (water, ivy), seen through the fitted camera.

    BPY_PY=<python with bpy> skills/scene-recon/scripts/run_bpy.sh assets-src/model-loop/great_tree_recon/build/assemble.py -- <tag>

Opens great_tree_recon.blend (the pieces as piece.py left them), builds collection G_great_tree:
  rockery (squashed to the height the input suggests) and trunk_roots at the tile centre, the crown on the trunk,
  three runestones placed where the camera ray through each stone's lowest visible pixel meets the rocks or roots,
  the pool and waterfall (flat teal meshes in the basin), ivy (leaf clusters on up-facing rock and root faces whose
  pixel in the object-ID map is ivy).
Renders renders/scene/<tag>_cam.png with scene.json's camera at the input's size and saves great_tree_recon_scene.blend.
The pieces are not changed. Placement knobs are in P below. The whole-scene compare loop (a judge on this render) is a later step.
"""
import json
import math
import os
import random
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

import camera_fit as cf  # scene-recon/scripts, on PYTHONPATH through run_bpy.sh

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
tag = sys.argv[sys.argv.index("--") + 1]
scene = json.load(open(os.path.join(R, "scene.json")))
C = scene["camera"]
cam = cf.fit([C["corners_px"][k] for k in ("front", "right", "back", "left")], tuple(C["size_px"]), scene["scale"]["tile_m"],
             tile_yaw=C["tile_yaw_deg"], weights=[C["corner_weights"][k] for k in ("front", "right", "back", "left")])

P = dict(
    rockery_h=3.4,          # the input suggests about 3.4 m of rock; the piece kept its close-up's 4.5 m
    crown_base=4.3,         # the crown's trunk stub starts here; scaled so the tree is tree_h tall (a03: 3.3 let the pads hang over the roots
                            # and hide the trunk; the input's lowest pads sit at about 5.7 m)
    tree_h=10.3,            # a09: the canopy touched the frame top (judge a08: lower about 0.3 m)
    tree_y=1.3,             # a05: the tree stands this far BEHIND the tile centre. Centred (a01-a04), its root skirt (4.6 m radius) reached
                            # to within 1.1 m of the rock ring's front corner and covered the basin: the pool had no place
    stone_sink=0.15,        # runestones stand this far into what they stand on
    stone_front_m=dict(runestone_l=0.6, runestone_c=0.1, runestone_r=0.6),   # this far in front of the surface behind their middle
                            # a09: the centre one 0.5 m further back, into the roots (judge a08: stands out in front, not in a niche)
    stone_scale=dict(runestone_l=1.0, runestone_c=0.92, runestone_r=0.92),   # visible heights 211 / 184 / 185 px
    # a07: the pool as the input draws it, from the waterfall forward: 3.1 m wide (223 px at 72 px/m), 2.2 m deep, on the ground
    pool=dict(size_m=(3.1, 2.2), gap_m=0.35, floor_z=0.05, z_above_floor=0.15,
              front_cap_m=0.3, front_keep=0.18, front_soft_m=0.9, front_margin_m=0.5),
    bay=dict(side_m=0.6, back_m=0.25, front_m=1.6, height_m=2.6),   # None = leave the roots whole
    # a11 (user: "remove the water"): no pool, waterfall or foam, and none of what made room for them (the bay cut in the roots, the rocks
    # lowered in front of the pool and pressed under it). The knobs above stay for when water comes back.
    water=False,
    # a11 (user: "a weird bump where trunk and roots connect"; judges a08/a10: a collar rings the trunk): the crown's own flare and lower shaft
    # stood 0.15-0.4 m proud of the trunk-and-roots trunk below the crown's limb fork (about 5.7 m). On a copy of the crown mesh, every vertex
    # below `top` and within near_m of the axis is pulled in to `inset_m` inside the trunk's median surface (pct) at its height; over `blend`
    # above `top` the pull fades out, so the limbs are untouched.
    join=dict(z_from=4.0, top=5.6, blend=0.35, near_m=2.0, inset_m=0.04, pct=50),
    crown_xy=1.22,          # a07: canopy 10.7 m wide in the input (768 px at 72 px/m); scaled to the tree's height (6 m crown) it is 8.6 m
    # a09 (judge a08: a horizontal flange with a flat top rings the trunk; roots flare only about 4 m visible, the input about 9 m): the trunk-
    # and-roots piece wider and lower, so its cut top (now 5.2 m) sits inside the crown's flare, which starts at crown_base
    # (a09 tried (1.12, 1.12, 0.8): the roots then covered the rock ring and the pool, and the collar stayed: it is the crown's own flare top)
    roots_scale=(1.0, 1.0, 1.0),
    # a09 (judge a08: the base reads as a flat-topped rock plateau; the input's back half is roots, its rocks stay under about 1-1.2 m):
    # rocks above `cap` keep `keep` of their height above it; behind back_y the lower back cap applies
    # (a09 tried cap 1.15 everywhere and 0.55 behind: the ring became a flat mossy plate and the side stones lost their footing)
    # a10: the front ring stays as it is; only the tiers behind the tree come down
    rock_cap=dict(cap=99.0, keep=1.0, back_y=0.8, back_cap=1.3, back_keep=0.35, soft=1.5),
    # a12: each leaf a card showing textures/ivy_leaf.png (a GPT leaf, keyed to alpha); leaf_m is the card's size
    ivy=dict(count=2200, leaf_m=0.2, seed=3),   # a09 (judge a08: leaf cards like confetti, 40 % too big, too lime) -> smaller, darker
)


def srgb(r, g, b):
    return tuple(((c / 255) / 12.92 if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4) for c in (r, g, b))


def flat_mat(name, col, rough=0.9, emit=None, strength=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*col, 1)
    b.inputs["Roughness"].default_value = rough
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = 0.2
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = strength
    return m


def world_bvh(objs):
    """One BVH over several objects in world space, plus per-triangle normals."""
    verts, polys = [], []
    for o in objs:
        me, mw, base = o.data, o.matrix_world, len(verts)
        verts += [mw @ v.co for v in me.vertices]
        polys += [[base + i for i in p.vertices] for p in me.polygons]
    return BVHTree.FromPolygons(verts, polys, epsilon=0.0), verts, polys


bpy.ops.wm.open_mainfile(filepath=os.path.join(R, "great_tree_recon.blend"))
sc = bpy.context.scene
for o in [o for o in bpy.data.objects if o.name.startswith(("LD_", "REF_CAM"))]:  # the turntable's rig
    bpy.data.objects.remove(o)
G = bpy.data.collections.new("G_great_tree")
sc.collection.children.link(G)
src = {k: bpy.data.objects[k] for k in ("rockery", "trunk_roots", "crown", "runestone")}


def place(name, key, loc=(0, 0, 0), scale=(1, 1, 1), yaw=0.0):
    o = bpy.data.objects.new(name, src[key].data)  # linked copy: shares the piece's mesh and materials
    o.location, o.scale, o.rotation_euler = loc, scale, (0, 0, math.radians(yaw))
    G.objects.link(o)
    return o


out = {"tag": tag}
rock_h = src["rockery"].dimensions.z
rockery = place("A_rockery", "rockery", scale=(1, 1, P["rockery_h"] / rock_h))
rockery.data = rockery.data.copy()  # the front gets lowered below: on a copy, the judged piece stays as it is
_rc = P["rock_cap"]
_mw, _inv = rockery.matrix_world.copy(), rockery.matrix_world.inverted()
for v in rockery.data.vertices:
    wv = _mw @ v.co
    t = min(max((wv.y - _rc["back_y"]) / _rc["soft"], 0.0), 1.0)  # 0 in front, 1 behind back_y + soft
    t = t * t * (3 - 2 * t)
    cap_ = _rc["cap"] * (1 - t) + _rc["back_cap"] * t
    keep_ = _rc["keep"] * (1 - t) + _rc["back_keep"] * t
    if wv.z > cap_:
        wv.z = cap_ + (wv.z - cap_) * keep_
        v.co = _inv @ wv
rockery.data.update()
roots = place("A_trunk_roots", "trunk_roots", loc=(0, P["tree_y"], 0), scale=P["roots_scale"])
ks = (P["tree_h"] - P["crown_base"]) / src["crown"].dimensions.z
crown = place("A_crown", "crown", loc=(0, P["tree_y"], P["crown_base"]), scale=(ks * P["crown_xy"], ks * P["crown_xy"], ks))
bpy.context.view_layer.update()
if P["join"]:  # tuck the crown's flare inside the trunk (see the knob)
    J = P["join"]
    crown.data = crown.data.copy()
    rmw = np.array(roots.matrix_world)
    rco = np.empty(len(roots.data.vertices) * 3)
    roots.data.vertices.foreach_get("co", rco)
    rw = rco.reshape(-1, 3) @ rmw[:3, :3].T + rmw[:3, 3]
    ax = (roots.location.x, roots.location.y)
    rd = np.hypot(rw[:, 0] - ax[0], rw[:, 1] - ax[1])
    zs = np.arange(J["z_from"], J["top"] + J["blend"] + 0.31, 0.1)
    prof = np.array([np.percentile(rd[b_], J["pct"]) if (b_ := (np.abs(rw[:, 2] - z) < 0.08) & (rd < 2.5)).sum() > 10 else np.nan for z in zs])
    ok_ = ~np.isnan(prof)
    prof = np.interp(zs, zs[ok_], prof[ok_])
    cmw, cinv = crown.matrix_world.copy(), crown.matrix_world.inverted()
    tucked = 0
    for v in crown.data.vertices:
        w = cmw @ v.co
        if w.z > J["top"] + J["blend"]:
            continue
        d = math.hypot(w.x - ax[0], w.y - ax[1])
        rt = float(np.interp(w.z, zs, prof)) - J["inset_m"]
        if d > J["near_m"] or d <= rt or d < 1e-6:
            continue
        t = 1.0 if w.z <= J["top"] else 1.0 - (w.z - J["top"]) / J["blend"]
        k = (d + (rt - d) * t) / d
        w.x, w.y = ax[0] + (w.x - ax[0]) * k, ax[1] + (w.y - ax[1]) * k
        v.co = cinv @ w
        tucked += 1
    crown.data.update()
    out["join"] = {"crown_vertices_tucked": tucked, "trunk_r50_m": {f"{z:.1f}": round(float(r), 2) for z, r in zip(zs[::4], prof[::4])}}
Cw = Vector(cam.C)
fwd = Vector(cam.ray([(C["size_px"][0] / 2, C["size_px"][1] / 2)])[0])

# ID map: where the input has water and ivy
img = bpy.data.images.load(os.path.join(R, "style", "id_map.png"))
iw, ih = img.size
idm = np.empty(iw * ih * 4, dtype=np.float32)
img.pixels.foreach_get(idm)
idm = idm.reshape(ih, iw, 4)[::-1, :, :3] * 255  # top row first
r_, g_, b_ = idm[..., 0], idm[..., 1], idm[..., 2]
is_water = (r_ < 70) & (g_ < 140) & (b_ > 190)
is_ivy = (r_ > 200) & (g_ < 90) & (b_ > 150)

ground, gverts, gpolys = world_bvh([rockery, roots])


def top_z(x, y, bvh=None):
    """Height of the highest surface over (x, y); None where there is none."""
    h = (bvh or ground).ray_cast(Vector((x, y, 50.0)), Vector((0, 0, -1)))
    return None if h[0] is None else h[0].z


# runestones. a01 put each base where the ray through its lowest visible pixel first met rocks or roots: the centre stone ended up
# buried. a02: take the DEPTH from the ray through the stone's middle pixel (the surface right behind it), step toward the camera so
# the stone stands in front of that, and put the base on the bottom pixel's ray at that depth; a base left hanging more than 0.2 m
# over the ground under it drops onto it.
stones = next(p for p in scene["pieces"] if p["id"] == "runestone")["instances"]
out["stones"] = {}
for inst in stones:
    x0, y0, x1, y1 = inst["bbox_px"]
    mid, bot = ((x0 + x1) / 2, (y0 + y1) / 2), ((x0 + x1) / 2, y1)
    dm, db = Vector(cam.ray([mid])[0]), Vector(cam.ray([bot])[0])
    hit = ground.ray_cast(Cw, dm)
    if hit[0] is None:  # nothing behind its middle: stand it where its bottom pixel's ray first meets rocks or roots (a01's rule)
        hb = ground.ray_cast(Cw, db)
        if hb[0] is not None:
            pos, how = hb[0].copy(), "on the first surface along its bottom ray"
        else:
            g = cam.ground_xy([bot])[0]
            pos, how = Vector((g[0], g[1], 0.0)), "ground plane"
    else:
        depth = (hit[0] - Cw).dot(fwd) - P["stone_front_m"][inst["id"]]
        pos, how = Cw + db * (depth / db.dot(fwd)), "in front of rocks/roots"
        h = top_z(pos.x, pos.y)
        floor = 0.0 if h is None else h
        if pos.z > floor + 0.2:
            pos.z, how = floor, how + ", dropped onto the ground under it"
    s = P["stone_scale"][inst["id"]]
    place("A_" + inst["id"], "runestone", loc=(pos.x, pos.y, pos.z - P["stone_sink"]), scale=(s, s, s))
    out["stones"][inst["id"]] = {"pos_m": [round(v, 2) for v in pos], "how": how}

if P["water"]:  # the pool's place, the rocks lowered in front of it, the bay cut in the roots
    # the pool. a01-a06 searched for it from the pool's pixels; at this view angle a pixel's ground point slides metres in depth, and the
    # pool ended up under the centre stone (a06). a07: as in the input, the waterfall drops from just below the centre stone into the
    # pool's back edge: the pool is an ellipse w x d on the ground right in front of that stone.
    PP = P["pool"]
    sc_ = bpy.data.objects["A_runestone_c"].location
    pw, pd = PP["size_m"]
    pc = np.array([sc_.x, sc_.y - PP["gap_m"] - pd / 2])
    rnd_p = random.Random(7)
    edge_xy = []
    for a in np.linspace(0, 2 * math.pi, 32, endpoint=False):
        k = 1.0 + rnd_p.uniform(-0.08, 0.08)
        edge_xy.append((float(pc[0] + math.cos(a) * pw / 2 * k), float(pc[1] + math.sin(a) * pd / 2 * k)))
    floor_z = PP["floor_z"]

    # the rocks in front of and under the pool: the input's front is open (low paving, one front boulder). Lower every rockery vertex in
    # that corridor above `cap` (relief kept at `keep`), with a soft edge. On the copy made above; vertices are in local space (scale z).
    inv = rockery.matrix_world.inverted()
    mw = rockery.matrix_world
    cap, keep, soft = floor_z + PP["front_cap_m"], PP["front_keep"], PP["front_soft_m"]
    lowered = 0
    for v in rockery.data.vertices:
        wv = mw @ v.co
        dx = abs(wv.x - pc[0]) - (pw / 2 + PP["front_margin_m"])
        dy = (wv.y - (pc[1] + pd / 2 + PP["front_margin_m"]))  # > 0: behind the pool (untouched)
        out_dist = max(dx, dy, 0.0)
        if out_dist >= soft or wv.z <= cap:
            continue
        wt = 1.0 - out_dist / soft
        wt = wt * wt * (3 - 2 * wt)
        z_new = cap + (wv.z - cap) * keep
        wv.z = wv.z * (1 - wt) + z_new * wt
        v.co = inv @ wv
        lowered += 1
    # a08: inside the pool's own outline the rocks go under the water (a07: lowered to 0.35 m they still covered it, 0 % seen)
    pressed = 0
    for v in rockery.data.vertices:
        wv = mw @ v.co
        e = math.hypot((wv.x - pc[0]) / (pw / 2), (wv.y - pc[1]) / (pd / 2))
        if e >= 1.12 or wv.z <= floor_z:
            continue
        wt = 1.0 if e <= 0.95 else (1.12 - e) / 0.17
        wv.z = wv.z * (1 - wt) + (floor_z - 0.03 + (wv.z - floor_z) * 0.03) * wt
        v.co = inv @ wv
        pressed += 1
    rockery.data.update()
    out["rocks_pressed_under_water"] = pressed
    out["rocks_lowered"] = lowered

    # the bay: this root skirt (4.6 m) closes the front; cut an ellipsoid out of a COPY of the trunk mesh around the pool, reaching
    # forward from just behind the pool's back edge (the centre stone stands behind it, on roots that stay). Sized in metres (a06 sized it
    # from the pool's cast outline: 3.9 m, most front roots gone).
    if P["bay"]:
        B = P["bay"]
        roots.data = roots.data.copy()
        import bmesh as _bm

        bm_ = bpy.data.meshes.new("bay_cutter")
        b = _bm.new()
        _bm.ops.create_icosphere(b, subdivisions=3, radius=1.0)
        rx, ry, rz = pw / 2 + B["side_m"], pd / 2 + B["back_m"] / 2 + B["front_m"] / 2, B["height_m"]
        for v in b.verts:
            v.co = Vector((v.co.x * rx, v.co.y * ry, v.co.z * rz))
        b.to_mesh(bm_)
        b.free()
        cutter = bpy.data.objects.new("bay_cutter", bm_)
        back_y = pc[1] + pd / 2 + B["back_m"]
        cutter.location = (float(pc[0]), float(back_y - ry), floor_z)
        G.objects.link(cutter)
        mod = roots.modifiers.new("bay", "BOOLEAN")
        mod.operation, mod.solver, mod.object = "DIFFERENCE", "EXACT", cutter
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        roots.select_set(True)
        bpy.context.view_layer.objects.active = roots
        t0 = len(roots.data.polygons)
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.data.objects.remove(cutter)
        for p_ in roots.data.polygons:
            p_.use_smooth = False
        out["bay"] = {"faces_before": t0, "faces_after": len(roots.data.polygons), "radii_m": [round(rx, 2), round(ry, 2), rz]}

bpy.context.view_layer.update()
ground, gverts, gpolys = world_bvh([rockery, roots])


def seen(pt):
    d = (pt - Cw)
    h = ground.ray_cast(Cw, d.normalized())
    return h[0] is None or (h[0] - Cw).length > d.length - 0.25


# a stone that lost its footing to the bay or the lowered front drops onto what is under it now
for inst in stones:
    o = bpy.data.objects["A_" + inst["id"]]
    h = top_z(o.location.x, o.location.y)
    base = o.location.z + P["stone_sink"]
    if h is not None and base > h + 0.2:
        o.location.z = h - P["stone_sink"]
        out["stones"][inst["id"]]["how"] += "; dropped after the cuts"

if P["water"]:  # pool, waterfall and foam
    pz = floor_z + PP["z_above_floor"]
    vis = sum(seen(Vector((x, y, pz))) for x, y in edge_xy + [tuple(pc)]) / (len(edge_xy) + 1)
    edge = [(x, y, pz) for x, y in edge_xy]
    ctr = np.array([pc[0], pc[1], pz])
    me = bpy.data.meshes.new("water")
    me.from_pydata([tuple(ctr)] + edge, [], [(0, 1 + i, 1 + (i + 1) % len(edge)) for i in range(len(edge))])
    # a09 (judge a08: flat opaque bright cyan; the input's water is teal with darker depth and a lighter rim): a centre-to-rim gradient
    ca = me.color_attributes.new("depth", "FLOAT_COLOR", "POINT")
    ca.data[0].color = (*srgb(22, 92, 96), 1)
    for i in range(1, len(me.vertices)):
        ca.data[i].color = (*srgb(92, 178, 172), 1)
    wm = bpy.data.materials.get("M_recon_water") or bpy.data.materials.new("M_recon_water")
    wb = next(n for n in wm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    an = wm.node_tree.nodes.new("ShaderNodeAttribute")
    an.attribute_type, an.attribute_name = "GEOMETRY", "depth"
    wm.node_tree.links.new(an.outputs["Color"], wb.inputs["Base Color"])
    wm.node_tree.links.new(an.outputs["Color"], wb.inputs["Emission Color"])
    wb.inputs["Emission Strength"].default_value, wb.inputs["Roughness"].default_value = 0.12, 0.1
    me.materials.append(wm)
    pool = bpy.data.objects.new("A_water", me)
    G.objects.link(pool)
    out["pool"] = {"centre_m": [round(float(v), 2) for v in ctr], "size_m": [pw, pd], "seen_fraction": round(float(vis), 2)}

    # waterfall: a ribbon from under the centre runestone down to the pool's back edge
    cst = bpy.data.objects["A_runestone_c"].location
    top = Vector((cst.x, cst.y - 0.35, cst.z + 0.25))
    back = max(edge, key=lambda e: e[1])
    bot = Vector((ctr[0], back[1] - 0.25, pz))
    n, w = 8, 0.32   # a08: the input's fall is a thin strand (a07: 0.5 m read as a lit panel)
    verts, faces = [], []
    for i in range(n + 1):
        t = i / n
        p = top.lerp(bot, t) + Vector((0, -0.35 * math.sin(t * math.pi) * (1 - t), 0))  # leans out, then drops
        ww = w * (0.35 + 0.9 * t)   # a09: tapered (judge a08: a straight plank)
        verts += [(p.x - ww / 2, p.y, p.z), (p.x + ww / 2, p.y, p.z)]
        if i:
            faces.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
    mf = bpy.data.meshes.new("waterfall")
    mf.from_pydata(verts, [], faces)
    fm = flat_mat("M_recon_waterfall", srgb(190, 228, 230), rough=0.2, emit=srgb(170, 225, 228), strength=0.2)
    fb = next(n for n in fm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    fb.inputs["Alpha"].default_value = 0.7  # a09: some see-through (judge a08: opaque)
    mf.materials.append(fm)
    # foam where it lands (judge a08)
    foam = bpy.data.meshes.new("foam")
    fv = [(bot.x + math.cos(a) * 0.45, bot.y + math.sin(a) * 0.3, pz + 0.02) for a in np.linspace(0, 2 * math.pi, 16, endpoint=False)]
    foam.from_pydata([(bot.x, bot.y, pz + 0.02)] + fv, [], [(0, 1 + i, 1 + (i + 1) % 16) for i in range(16)])
    foam.materials.append(flat_mat("M_recon_foam", srgb(225, 240, 240), rough=0.6))
    G.objects.link(bpy.data.objects.new("A_foam", foam))
    fall = bpy.data.objects.new("A_waterfall", mf)
    G.objects.link(fall)

# ivy: leaf clusters on up-facing rock / root faces that the input paints as ivy (their pixel in the ID map)
rnd = random.Random(P["ivy"]["seed"])
cands = []
gv = np.array([v[:] for v in gverts])
for poly in gpolys:
    a, b, c = (gv[i] for i in poly[:3])
    nrm = np.cross(b - a, c - a)
    area = np.linalg.norm(nrm) / 2
    if area < 1e-6 or nrm[2] / (2 * area) < 0.25:
        continue
    cands.append((poly, area, nrm / (2 * area)))
weights = np.array([c[1] for c in cands])
pick = np.random.default_rng(P["ivy"]["seed"]).choice(len(cands), size=min(len(cands), P["ivy"]["count"] * 8), p=weights / weights.sum())
verts, faces, placed = [], [], 0
L = P["ivy"]["leaf_m"]
for k in pick:
    if placed >= P["ivy"]["count"]:
        break
    poly, _, nrm = cands[k]
    a, b, c = (gv[i] for i in poly[:3])
    u, v = rnd.random(), rnd.random()
    if u + v > 1:
        u, v = 1 - u, 1 - v
    p = a + (b - a) * u + (c - a) * v
    px = cam.project([p])[0]
    xi, yi = int(px[0]), int(px[1])
    if not (0 <= xi < iw and 0 <= yi < ih) or not is_ivy[yi, xi]:
        continue
    hitp = ground.ray_cast(Vector(cam.C), (Vector(p) - Vector(cam.C)).normalized())  # only where the camera really sees this spot
    if hitp[0] is None or (hitp[0] - Vector(p)).length > 0.15:
        continue
    zax = Vector(nrm)
    xax = zax.orthogonal().normalized()
    rot = Matrix.Rotation(rnd.uniform(0, 2 * math.pi), 3, zax) @ Matrix((xax, zax.cross(xax), zax)).transposed()
    for j in range(3):  # three pointed leaves fanned from one stem
        ang = j * 2.1 + rnd.uniform(-0.3, 0.3)
        s = L * rnd.uniform(0.7, 1.2)
        tilt = rnd.uniform(0.15, 0.5)
        d = Vector((math.cos(ang), math.sin(ang), tilt))
        side = Vector((-math.sin(ang), math.cos(ang), 0)) * s * 0.5
        o0 = Vector((0, 0, 0.02)) - d.normalized() * s * 0.08  # the stem's foot just under the cluster's centre
        pts = [o0 - side, o0 + side, o0 + side + d * s, o0 - side + d * s]  # card: stem edge first, tip edge last
        base = len(verts)
        verts += [tuple(Vector(p) + rot @ q) for q in pts]
        faces.append((base, base + 1, base + 2, base + 3))
    placed += 1
mi = bpy.data.meshes.new("ivy")
mi.from_pydata(verts, [], faces)
uvl = mi.uv_layers.new(name="UVMap")
uvl.data.foreach_set("uv", [c for _ in faces for c in (0, 0, 1, 0, 1, 1, 0, 1)])
vary = mi.attributes.new("vary", "FLOAT", "FACE")  # per-leaf value, as the input's leaves are not all one green
vary.data.foreach_set("value", [rnd.uniform(0.8, 1.15) for _ in faces])
# a12 (user: textures everywhere): the leaf sprite, cut out by its alpha; per-leaf value. (a11: one flat green, srgb 50/82/34)
iv = bpy.data.materials.new("M_recon_ivy")
nt_ = iv.node_tree
ib = next(n for n in nt_.nodes if n.type == "BSDF_PRINCIPLED")
itx = nt_.nodes.new("ShaderNodeTexImage")
itx.image = bpy.data.images.load(os.path.join(R, "textures", "ivy_leaf.png"), check_existing=True)
itx.extension = "CLIP"
iuv = nt_.nodes.new("ShaderNodeUVMap")
iuv.uv_map = "UVMap"
nt_.links.new(iuv.outputs["UV"], itx.inputs["Vector"])
iat = nt_.nodes.new("ShaderNodeAttribute")
iat.attribute_type, iat.attribute_name = "GEOMETRY", "vary"
isc = nt_.nodes.new("ShaderNodeVectorMath")
isc.operation = "SCALE"
nt_.links.new(itx.outputs["Color"], isc.inputs[0])
nt_.links.new(iat.outputs["Fac"], isc.inputs["Scale"])
nt_.links.new(isc.outputs["Vector"], ib.inputs["Base Color"])
icut = nt_.nodes.new("ShaderNodeMath")
icut.operation = "GREATER_THAN"
icut.inputs[1].default_value = 0.5
nt_.links.new(itx.outputs["Alpha"], icut.inputs[0])
nt_.links.new(icut.outputs[0], ib.inputs["Alpha"])
ib.inputs["Roughness"].default_value = 0.85
if "Specular IOR Level" in ib.inputs:
    ib.inputs["Specular IOR Level"].default_value = 0.2
mi.materials.append(iv)
ivy = bpy.data.objects.new("A_ivy", mi)
G.objects.link(ivy)
out["ivy"] = {"clusters": placed, "leaves": len(faces)}

# camera and a plain light, like the input: white background, light from the upper left
for lc in bpy.context.view_layer.layer_collection.children:
    lc.exclude = lc.name != "G_great_tree"
b = C["blender"]
camd = bpy.data.cameras.new("INPUT_CAM")
camd.lens, camd.sensor_width, camd.sensor_fit = b["lens_mm"], b["sensor_width_mm"], b["sensor_fit"]
camd.clip_start, camd.clip_end = 1.0, 300.0
camo = bpy.data.objects.new("INPUT_CAM", camd)
camo.location, camo.rotation_euler = b["location"], b["rotation_euler"]
sc.collection.objects.link(camo)
sc.camera = camo
world = bpy.data.worlds.new("W_preview")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value, bg.inputs["Strength"].default_value = (1, 1, 1, 1), 0.9
sc.world = world
sun = bpy.data.objects.new("SUN_preview", bpy.data.lights.new("SUN_preview", "SUN"))
sun.data.energy, sun.data.angle = 2.6, math.radians(8)
sun.rotation_euler = (math.radians(48), 0, math.radians(-38))
sc.collection.objects.link(sun)
sc.render.engine, sc.cycles.device, sc.cycles.samples = "CYCLES", "CPU", 48
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = C["size_px"][0], C["size_px"][1], 100
sc.render.film_transparent = False
sc.render.image_settings.file_format, sc.render.image_settings.color_mode = "PNG", "RGB"
sc.view_settings.view_transform, sc.view_settings.exposure = "Standard", 0.0
os.makedirs(os.path.join(R, "renders", "scene"), exist_ok=True)
sc.render.filepath = os.path.join(R, "renders", "scene", f"{tag}_cam.png")
bpy.ops.render.render(write_still=True)
out["render"] = sc.render.filepath
out["tris"] = int(sum(len(o.data.loop_triangles) or (o.data.calc_loop_triangles() or len(o.data.loop_triangles)) for o in G.objects))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(R, "great_tree_recon_scene.blend"))
json.dump(out, open(os.path.join(R, "renders", "scene", f"{tag}_result.json"), "w"), indent=1)
print("@@RESULT@@" + json.dumps(out)[:2000])
