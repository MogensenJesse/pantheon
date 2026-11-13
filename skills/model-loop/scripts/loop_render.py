"""Render one collection for judging: front/right/back/left (studio turntable) + an optional
view matched to the reference image.

MCP:
    import bpy, sys, importlib; sys.path.insert(0, r"<SKILL_DIR>/scripts")
    import loop_render; importlib.reload(loop_render)
    result = loop_render.run("P_brick", r"<R>/renders/brick", "r01",
                             ref_view=(35, 25, 50), ref_res=(1024, 1024))
ref_view = (azimuth, elevation, lens_mm) of the reference image's camera. Azimuth 0 = looking from
the front (-Y), 90 = from the right (+X); elevation in degrees above the horizon. The REF_CAM
camera is created/re-aimed to fit the collection and rendered at ref_res (w, h).
Every other collection is excluded from the view layer while rendering (instances of excluded
source parts still render), then restored.
Returns {"views": {front|right|back|left: png}, "ref": png|None, "size_m": [x, y, z]}.
"""
import glob
import math
import os
import sys

import bpy
from mathutils import Vector

_found = glob.glob(os.path.expanduser("~/.claude/plugins/cache/blender-agent-skills/blender-agent-skills/*/skills"))
if not _found:
    raise ImportError("loop_render needs the blender-agent-skills plugin (turntable.py, render_batch.py); install it first")
SKILLS = max(_found, key=lambda p: [int(x) for x in p.replace("\\", "/").split("/")[-2].split(".") if x.isdigit()])
for sub in ("blender-lighting-lookdev", "blender-rendering"):
    sys.path.insert(0, os.path.join(SKILLS, sub, "scripts"))
import render_batch  # noqa: E402
import turntable  # noqa: E402

VIEWS = {"front": 1, "right": 31, "back": 61, "left": 91}  # 120-frame turntable, camera starts at -Y
SHAPE_TYPES = {"MESH", "CURVE", "SURFACE", "FONT", "META", "CURVES", "VOLUME"}


def _bounds(col, only=None):
    """World bounds of everything the collection draws, including collection instances."""
    owned = set(only) if only else {o.name for o in col.all_objects}
    dg = bpy.context.evaluated_depsgraph_get()
    pts = []
    for inst in dg.object_instances:
        src = inst.parent if inst.is_instance else inst.object
        if src is None or src.original.name not in owned or inst.object.type not in SHAPE_TYPES:
            continue
        mw = inst.matrix_world.copy()
        pts += [mw @ Vector(c) for c in inst.object.bound_box]
    if not pts:
        raise ValueError(f"collection {col.name} draws nothing")
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def _isolate(layer, target, keep, saved):
    """Exclude every layer collection that is not the target, a kept one, or an ancestor of the target."""
    for lc in layer.children:
        if lc.collection == target or lc.name in keep:
            continue
        if target.name in {c.name for c in lc.collection.children_recursive}:
            _isolate(lc, target, keep, saved)
        else:
            saved.append((lc, lc.exclude))
            lc.exclude = True


def _aim_ref_cam(lo, hi, az, el, lens, aspect):
    sc = bpy.context.scene
    cam = bpy.data.objects.get("REF_CAM")
    if cam is None:
        cam = bpy.data.objects.new("REF_CAM", bpy.data.cameras.new("REF_CAM"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cd = cam.data
    cd.lens = lens
    fov = 2 * math.atan(cd.sensor_width / (2 * lens))  # sensor fit AUTO: along the longer side
    fov = min(fov, 2 * math.atan(math.tan(fov / 2) / max(aspect, 1 / aspect)))  # the narrower side
    center = (lo + hi) / 2
    dist = max((hi - lo).length / 2, 1e-3) / math.sin(fov / 2) * 1.05
    a, e = math.radians(az), math.radians(el)
    cam.location = center + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.clip_start, cd.clip_end = dist / 100, dist * 20


def run(collection, out_dir, tag, res=768, ref_view=None, ref_res=None, only=None, **_):
    """only: object names inside the collection to show (e.g. one variant); the rest are hidden."""
    sc = bpy.context.scene
    vl = bpy.context.view_layer
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    col = bpy.data.collections[collection]
    os.makedirs(out_dir, exist_ok=True)
    saved, hidden = [], {}
    proxy = me = None
    try:
        _isolate(vl.layer_collection, col, {"LD_Lookdev"}, saved)
        for o in sc.collection.objects:  # loose objects in the scene root (cameras stay)
            if o.type != "CAMERA":
                hidden[o] = o.hide_render
                o.hide_render = True
        for o in col.all_objects if only else ():
            if o.name not in only:
                hidden[o] = o.hide_render
                o.hide_render = True
        vl.update()
        lo, hi = _bounds(col, only)
        # turntable frames named objects by their bound_box, so hand it a box with the real bounds
        me = bpy.data.meshes.new("LOOP_Bounds")
        me.from_pydata([(x, y, z) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)], [], [])
        proxy = bpy.data.objects.new("LOOP_Bounds", me)
        proxy.hide_render = True
        col.objects.link(proxy)
        vl.update()
        sc.render.resolution_x = sc.render.resolution_y = res  # turntable fits the camera to the current aspect
        sc.view_settings.exposure = -2.0  # the studio rig is hot; -2 keeps mid albedo readable
        turntable.run(objects=[proxy.name], rig="studio", frames=120, lens=60, elevation=20, backdrop=True)
        common = dict(engine="BLENDER_EEVEE", preset="preview", percent=100, format="PNG", view="Khronos PBR Neutral")
        render_batch.run(res=(res, res), out=os.path.join(out_dir, f"{tag}_####"),
                         frames=",".join(str(f) for f in VIEWS.values()), **common)
        views = {}
        for name, f in VIEWS.items():
            dst = os.path.join(out_dir, f"{tag}_{name}.png")
            os.replace(os.path.join(out_dir, f"{tag}_{f:04d}.png"), dst)
            views[name] = dst.replace("\\", "/")
        ref = None
        if ref_view:
            w, h = ref_res or (res, res)
            _aim_ref_cam(lo, hi, *ref_view, aspect=w / h)
            r = render_batch.run(res=(w, h), out=os.path.join(out_dir, f"{tag}_ref_####"), frames="1",
                                 cameras=["REF_CAM"], **common)
            ref = os.path.join(out_dir, f"{tag}_ref.png")
            os.replace(r["files"][0], ref)
            ref = ref.replace("\\", "/")
        return {"views": views, "ref": ref, "size_m": [round(v, 3) for v in (hi - lo)]}
    finally:
        if proxy:
            bpy.data.objects.remove(proxy)
        if me:
            bpy.data.meshes.remove(me)
        for lc, ex in saved:
            lc.exclude = ex
        for o, h in hidden.items():
            o.hide_render = h
