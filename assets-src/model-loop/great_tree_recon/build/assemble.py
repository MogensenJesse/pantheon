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
    crown_base=3.3,         # the crown's trunk stub starts here; scaled so the tree is tree_h tall
    tree_h=10.5,
    stone_sink=0.15,        # runestones stand this far into what they stand on
    stone_front_m=0.6,      # and this far in front of the surface behind their middle
    stone_scale=dict(runestone_l=1.0, runestone_c=0.92, runestone_r=0.92),   # visible heights 211 / 184 / 185 px
    pool=dict(z_above_floor=0.22, grow=1.0),
    ivy=dict(count=1400, leaf_m=0.24, seed=3),
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
roots = place("A_trunk_roots", "trunk_roots")
ks = (P["tree_h"] - P["crown_base"]) / src["crown"].dimensions.z
crown = place("A_crown", "crown", loc=(0, 0, P["crown_base"]), scale=(ks, ks, ks))
bpy.context.view_layer.update()
ground, gverts, gpolys = world_bvh([rockery, roots])

def top_z(x, y):
    """Height of the highest rock / root surface over (x, y); None where there is none."""
    h = ground.ray_cast(Vector((x, y, 50.0)), Vector((0, 0, -1)))
    return None if h[0] is None else h[0].z


# runestones. a01 put each base where the ray through its lowest visible pixel first met rocks or roots: the centre stone ended up
# buried (this root skirt has no niche). a02: take the DEPTH from the ray through the stone's middle pixel (the surface right behind
# it), step toward the camera so the stone stands in front of that, and put the base on the bottom pixel's ray at that depth; a base
# left hanging more than 0.2 m over the ground under it drops onto it.
stones = next(p for p in scene["pieces"] if p["id"] == "runestone")["instances"]
out["stones"] = {}
Cw = Vector(cam.C)
fwd = Vector(cam.ray([(C["size_px"][0] / 2, C["size_px"][1] / 2)])[0])
for inst in stones:
    x0, y0, x1, y1 = inst["bbox_px"]
    mid, bot = ((x0 + x1) / 2, (y0 + y1) / 2), ((x0 + x1) / 2, y1)
    dm, db = Vector(cam.ray([mid])[0]), Vector(cam.ray([bot])[0])
    hit = ground.ray_cast(Cw, dm)
    if hit[0] is None:
        g = cam.ground_xy([bot])[0]
        pos, how = Vector((g[0], g[1], 0.0)), "ground plane"
    else:
        depth = (hit[0] - Cw).dot(fwd) - P["stone_front_m"]
        pos, how = Cw + db * (depth / db.dot(fwd)), "in front of rocks/roots"
        h = top_z(pos.x, pos.y)
        floor = 0.0 if h is None else h
        if pos.z > floor + 0.2:
            pos.z, how = floor, how + ", dropped onto the ground under it"
    s = P["stone_scale"][inst["id"]]
    place("A_" + inst["id"], "runestone", loc=(pos.x, pos.y, pos.z - P["stone_sink"]), scale=(s, s, s))
    out["stones"][inst["id"]] = {"pos_m": [round(v, 2) for v in pos], "how": how}

# ID map: where the input has water and ivy
img = bpy.data.images.load(os.path.join(R, "style", "id_map.png"))
iw, ih = img.size
idm = np.empty(iw * ih * 4, dtype=np.float32)
img.pixels.foreach_get(idm)
idm = idm.reshape(ih, iw, 4)[::-1, :, :3] * 255  # top row first
r_, g_, b_ = idm[..., 0], idm[..., 1], idm[..., 2]
is_water = (r_ < 70) & (g_ < 140) & (b_ > 190)
is_ivy = (r_ > 200) & (g_ < 90) & (b_ > 150)

# pool: the water pixels' lower blob (the basin), cast onto the basin floor
ys, xs = np.nonzero(is_water)
low = ys > np.percentile(ys, 35)  # below the waterfall's thin strip
cx_px, cy_px = float(np.median(xs[low])), float(np.median(ys[low]))
# a01 cast the pool's pixel onto the first surface and landed on a front boulder. a02: the pool lies on the ground plane; start from
# the pixel cast onto z = 0 and move to the lowest spot of the rockery nearby (its basin), 15 cm of height per metre of distance
g0 = cam.ground_xy([(cx_px, cy_px)], z=0.0)[0]
best = None
for gx in np.arange(g0[0] - 2.5, g0[0] + 2.51, 0.25):
    for gy in np.arange(g0[1] - 4.0, g0[1] + 2.51, 0.25):
        h = top_z(float(gx), float(gy))
        h = 0.0 if h is None else h
        # a03: only a spot the camera sees (a02's lowest spot was the rockery's basin, which this root skirt covers)
        tgt = Vector((float(gx), float(gy), h + P["pool"]["z_above_floor"]))
        dirv = (tgt - Cw).normalized()
        hv = ground.ray_cast(Cw, dirv)
        if hv[0] is not None and (hv[0] - Cw).length < (tgt - Cw).length - 0.3:
            continue
        cost = h + 0.15 * math.hypot(gx - g0[0], gy - g0[1])
        if best is None or cost < best[0]:
            best = (cost, float(gx), float(gy), h)
if best is None:
    best = (0.0, float(g0[0]), float(g0[1]), 0.0)
_, bx_, by_, floor_z = best
pz = floor_z + P["pool"]["z_above_floor"]
shift = np.array([bx_ - g0[0], by_ - g0[1]])
edge = []
for a in np.linspace(0, 2 * math.pi, 28, endpoint=False):  # outline: the furthest water pixel in each direction from the blob's centre
    best = None
    for rad in range(4, 200, 3):
        x, y = int(cx_px + math.cos(a) * rad), int(cy_px + math.sin(a) * rad * 0.55)
        if 0 <= x < iw and 0 <= y < ih and is_water[y, x]:
            best = (x, y)
    best = best or (cx_px, cy_px)
    g = cam.ground_xy([best], z=0.0)[0] + shift
    edge.append((float(g[0]), float(g[1]), pz))
ctr = np.mean(np.array(edge), axis=0)
edge = [tuple(ctr + (np.array(e) - ctr) * P["pool"]["grow"]) for e in edge]
me = bpy.data.meshes.new("water")
me.from_pydata([tuple(ctr)] + edge, [], [(0, 1 + i, 1 + (i + 1) % len(edge)) for i in range(len(edge))])
me.materials.append(flat_mat("M_recon_water", srgb(52, 150, 150), rough=0.15, emit=srgb(70, 190, 185), strength=0.35))
pool = bpy.data.objects.new("A_water", me)
G.objects.link(pool)
out["pool"] = {"centre_m": [round(float(v), 2) for v in ctr], "floor_z": round(floor_z, 2), "width_m": round(float(np.ptp(np.array(edge)[:, 0])), 2),
               "moved_from_pixel_cast_m": [round(float(v), 2) for v in shift]}

# waterfall: a ribbon from under the centre runestone down to the pool's back edge
cst = bpy.data.objects["A_runestone_c"].location
top = Vector((cst.x, cst.y - 0.35, cst.z + 0.25))
back = max(edge, key=lambda e: e[1])
bot = Vector((ctr[0], back[1] - 0.25, pz))
n, w = 8, 0.5
verts, faces = [], []
for i in range(n + 1):
    t = i / n
    p = top.lerp(bot, t) + Vector((0, -0.35 * math.sin(t * math.pi) * (1 - t), 0))  # leans out, then drops
    ww = w * (0.8 + 0.5 * t)
    verts += [(p.x - ww / 2, p.y, p.z), (p.x + ww / 2, p.y, p.z)]
    if i:
        faces.append((2 * i - 2, 2 * i - 1, 2 * i + 1, 2 * i))
mf = bpy.data.meshes.new("waterfall")
mf.from_pydata(verts, [], faces)
mf.materials.append(flat_mat("M_recon_waterfall", srgb(150, 215, 220), rough=0.2, emit=srgb(170, 230, 235), strength=0.5))
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
        side = Vector((-math.sin(ang), math.cos(ang), 0)) * s * 0.42
        pts = [Vector((0, 0, 0.02)), d * s * 0.5 + side, d * s, d * s * 0.5 - side]
        base = len(verts)
        verts += [tuple(Vector(p) + rot @ q) for q in pts]
        faces.append((base, base + 1, base + 2, base + 3))
    placed += 1
mi = bpy.data.meshes.new("ivy")
mi.from_pydata(verts, [], faces)
mi.materials.append(flat_mat("M_recon_ivy", srgb(74, 110, 44), rough=0.9))
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
