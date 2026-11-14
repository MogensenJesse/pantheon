"""Find how a raw Trellis GLB must be turned about Z so it stands as in its reference image (bpy + numpy).

Trellis does not put the reference's view at the front: the piece comes out at any yaw. This renders the raw mesh with its
own baked colours (as emission, no lighting) from the reference's viewpoint at a ring of yaws and keeps the yaw whose
picture is closest to the reference (silhouette overlap, then colour inside the overlap). The baked colours are used
for this alignment only; the look still comes from the retexture.

    import orient_fit
    r = orient_fit.run(r"<R>/meshes/runestone.glb", r"<R>/refs/runestone.png", ref_view=(25, 20, 85))
    r["yaw"]            # degrees about Z: pass to recon_import.run(..., yaw_deg=r["yaw"])
    r["scores"]         # [(yaw, score, iou, colour)] best first; a small gap between the first two = ambiguous

    orient_fit.colour_box(glb, yaw, test)   # box of the front-facing faces whose baked colour passes test(rgb array) -> bool array,
                                            # relative to the turned mesh: {"cx", "cz", "w", "h"} as fractions of its width / height
                                            # (cx from the centre, cz from the bottom), e.g. where a glowing panel sits

The reference must sit on a plain background (model-loop's close-ups do). Replaces the scene: run it in its own process
or before opening the run's .blend.
"""
import math
import os
import tempfile

import bpy
import numpy as np
from mathutils import Vector

N = 96  # comparison size


def _load(glb):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for o in bpy.data.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    for o in [o for o in bpy.data.objects if o is not ob]:
        bpy.data.objects.remove(o)
    ob.rotation_mode = "XYZ"  # the glTF importer leaves QUATERNION: rotation_euler would be ignored
    return ob


def _emit(ob):
    """Show the baked base colour unlit."""
    for m in ob.data.materials:
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf is None or not bsdf.inputs["Base Color"].links:
            continue
        src = bsdf.inputs["Base Color"].links[0].from_socket
        nt.links.new(src, bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = 1.0
        for l in list(bsdf.inputs["Base Color"].links):
            nt.links.remove(l)
        bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)


def _pixels(path):
    img = bpy.data.images.load(path, check_existing=False)
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1]  # top row first


def _norm(rgb, mask):
    """Crop to the mask's box, resample to N x N (nearest), return (rgb, mask)."""
    ys, xs = np.nonzero(mask)
    if len(xs) < 20:
        return None
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    side = max(y1 - y0, x1 - x0)  # keep the aspect: pad the short side
    cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
    yy = np.clip((cy - side / 2 + (np.arange(N) + 0.5) * side / N).astype(int), 0, mask.shape[0] - 1)
    xx = np.clip((cx - side / 2 + (np.arange(N) + 0.5) * side / N).astype(int), 0, mask.shape[1] - 1)
    inside = ((cy - side / 2 + (np.arange(N) + 0.5) * side / N >= 0) & (cy - side / 2 + (np.arange(N) + 0.5) * side / N < mask.shape[0]))[:, None] & \
             ((cx - side / 2 + (np.arange(N) + 0.5) * side / N >= 0) & (cx - side / 2 + (np.arange(N) + 0.5) * side / N < mask.shape[1]))[None, :]
    return rgb[yy][:, xx], mask[yy][:, xx] & inside


def _ref(path):
    a = _pixels(path)[..., :3]
    edge = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(edge, 0)
    return _norm(a, np.abs(a - bg).max(2) > 0.11)


def _score(ref, cur):
    (ra, rm), (ca, cm) = ref, cur
    inter = rm & cm
    iou = inter.sum() / max((rm | cm).sum(), 1)
    if inter.sum() < 20:
        return 0.0, float(iou), 0.0

    def chroma(x):  # colour without brightness: the baked texture and the painting are lit differently
        return x - x.mean(1, keepdims=True)

    d = np.abs(chroma(ra[inter]) - chroma(ca[inter])).mean()
    col = max(0.0, 1.0 - d / 0.08)
    return float(iou * (0.5 + 0.5 * col)), float(iou), float(col)


def run(glb, ref_png, ref_view=(0, 20, 85), step=15, refine=5, res=192, keep=None):
    """keep: a folder to write the candidate renders to (debug); default a temp folder."""
    az, el, lens = ref_view
    ob = _load(glb)
    _emit(ob)
    ref = _ref(ref_png)
    sc = bpy.context.scene
    sc.render.engine, sc.cycles.samples, sc.render.film_transparent = "CYCLES", 2, True
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.render.image_settings.file_format, sc.render.image_settings.color_mode = "PNG", "RGBA"
    sc.view_settings.view_transform = "Standard"
    pts = [Vector(c) for c in ob.bound_box]
    c = sum(pts, Vector()) / 8
    r = max((p - c).length for p in pts)
    cam = bpy.data.objects.new("OF_CAM", bpy.data.cameras.new("OF_CAM"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = lens
    dist = r / math.sin(math.atan(cam.data.sensor_width / (2 * lens))) * 1.05
    a, e = math.radians(az), math.radians(el)
    cam.location = c + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.clip_start, cam.data.clip_end = dist / 100, dist * 10
    out = keep or tempfile.mkdtemp(prefix="orient_")
    os.makedirs(out, exist_ok=True)
    done = {}

    def trial(yaw):
        yaw = round(yaw) % 360
        if yaw in done:
            return
        ob.rotation_euler = (0, 0, math.radians(yaw))
        sc.render.filepath = os.path.join(out, f"yaw_{yaw:03d}.png")
        bpy.ops.render.render(write_still=True)
        px = _pixels(sc.render.filepath)
        cur = _norm(px[..., :3], px[..., 3] > 0.5)
        done[yaw] = _score(ref, cur) if cur else (0.0, 0.0, 0.0)

    for yaw in range(0, 360, step):
        trial(yaw)
    best = max(done, key=lambda k: done[k][0])
    for d in range(-step + refine, step, refine):
        trial(best + d)
    ranked = sorted(((k, *done[k]) for k in done), key=lambda t: -t[1])
    return {"yaw": ranked[0][0], "scores": [(k, round(s, 4), round(i, 4), round(col, 4)) for k, s, i, col in ranked[:6]], "renders": out}


def colour_box(glb, yaw, test, facing=-0.8):
    """Where on the turned mesh's front (-Y) the baked colour passes `test`: box as fractions of the mesh's width and height.
    The centre is the area-weighted median and the size twice the interquartile range (exact for an evenly filled box):
    colour that spills onto a frame leg or a second panel seen edge-on only makes a tail and does not move the box
    (a 3-97 % span put the runestone's rune 15 cm off its recess)."""
    ob = _load(glb)
    me = ob.data
    img = None
    for m in me.materials:
        bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf and bsdf.inputs["Base Color"].links and bsdf.inputs["Base Color"].links[0].from_node.type == "TEX_IMAGE":
            img = bsdf.inputs["Base Color"].links[0].from_node.image
    if img is None:
        raise ValueError("no base-colour image on the mesh")
    w, h = img.size
    tex = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(tex)
    tex = tex.reshape(h, w, 4)[..., :3]
    nl = len(me.loops)
    uv = np.empty(nl * 2, dtype=np.float32)
    me.uv_layers.active.data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    npoly = len(me.polygons)
    start = np.empty(npoly, dtype=np.int32)
    total = np.empty(npoly, dtype=np.int32)
    me.polygons.foreach_get("loop_start", start)
    me.polygons.foreach_get("loop_total", total)
    fuv = np.add.reduceat(uv, start, axis=0) / total[:, None]
    col = tex[np.clip((fuv[:, 1] % 1.0 * h).astype(int), 0, h - 1), np.clip((fuv[:, 0] % 1.0 * w).astype(int), 0, w - 1)]
    nor = np.empty(npoly * 3, dtype=np.float32)
    cen = np.empty(npoly * 3, dtype=np.float32)
    area = np.empty(npoly, dtype=np.float32)
    me.polygons.foreach_get("normal", nor)
    me.polygons.foreach_get("center", cen)
    me.polygons.foreach_get("area", area)
    a = math.radians(yaw)
    rot = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]], dtype=np.float32)
    nor, cen = nor.reshape(-1, 3) @ rot.T, cen.reshape(-1, 3) @ rot.T
    co = np.empty(len(me.vertices) * 3, dtype=np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3) @ rot.T
    lo, hi = co.min(0), co.max(0)
    sel = test(col) & (nor[:, 1] < facing)
    if sel.sum() < 10:
        return None
    def quart(v, wts):  # area-weighted 25 / 50 / 75 %
        o = np.argsort(v)
        cw = np.cumsum(wts[o]) / wts.sum()
        return [float(v[o][min(np.searchsorted(cw, q), len(v) - 1)]) for q in (0.25, 0.5, 0.75)]

    xa, xm, xb = quart(cen[sel, 0], area[sel])
    za, zm, zb = quart(cen[sel, 2], area[sel])
    W, H = float(hi[0] - lo[0]), float(hi[2] - lo[2])
    xc = float((hi[0] + lo[0]) / 2)
    return {"cx": (xm - xc) / W, "cz": (zm - float(lo[2])) / H, "w": 2 * (xb - xa) / W, "h": 2 * (zb - za) / H,
            "faces": int(sel.sum()), "area_frac": float(area[sel].sum() / area.sum())}
