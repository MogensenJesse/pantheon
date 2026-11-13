"""Driver for node 'well_test' (root): run inside root_work.blend.
blender -b root_work.blend --factory-startup --python root_drive.py -- <round> [norender] [small]
Builds G_well_test (collection instances), measures, renders the 4 views + a ref view framed like input.png (2752x1536),
saves the work blend + a snapshot. Knob overrides for the round: build/root_round.py (optional, sets PO / CAM)."""
import importlib
import json
import math
import os
import sys

import bpy
from mathutils import Vector

R = r"D:/pantheon/assets-src/model-loop/well_test"
S = r"D:/pantheon/.claude/skills/model-loop/scripts"
sys.path.insert(0, S)
sys.path.insert(0, R + "/build")
rnd_tag = (sys.argv[sys.argv.index("--") + 1:] or ["01"])[0]
do_render = "norender" not in sys.argv
small = "small" in sys.argv

import loop_render  # noqa: E402
import root  # noqa: E402

for m in (loop_render, root):
    importlib.reload(m)

# ---- knobs for this round ----
PO = {}
# camera of the reference render: azimuth/elevation (deg), lens (mm), pixels per metre at the target, and the image pixel the target lands on
CAM = dict(az=30.0, el=20.0, lens=50.0, ppm=427.0, target=(0.0, 0.0, 0.75), px=(1410.0, 835.0))
W, H = 2752, 1536
# ------------------------------
exec(open(R + "/build/root_round.py").read()) if os.path.exists(R + "/build/root_round.py") else None
REF_FRAME = round(1 + CAM["az"] / 3)  # lights are camera-relative on the turntable: render the ref view where they face it like the 4 views

_orig_rb = loop_render.render_batch.run


def _ref_at_frame(*a, **k):
    if k.get("cameras") == ["REF_CAM"]:
        k["frames"] = str(REF_FRAME)
    return _orig_rb(*a, **k)


loop_render.render_batch.run = _ref_at_frame


def _aim(lo, hi, az, el, lens, aspect):
    """Replacement for loop_render._aim_ref_cam: the camera framed like the reference image (scale and offset), not fitted to the bounds."""
    sc = bpy.context.scene
    cam = bpy.data.objects.get("REF_CAM")
    if cam is None:
        cam = bpy.data.objects.new("REF_CAM", bpy.data.cameras.new("REF_CAM"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cd = cam.data
    c = CAM
    cd.lens = c["lens"]
    cd.sensor_fit = "AUTO"
    f_px = c["lens"] / cd.sensor_width * W
    dist = f_px / c["ppm"]
    a, e = math.radians(c["az"]), math.radians(c["el"])
    tgt = Vector(c["target"])
    cam.location = tgt + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
    cd.shift_x = -(c["px"][0] - W / 2) / W
    cd.shift_y = (c["px"][1] - H / 2) / W
    cd.clip_start, cd.clip_end = dist / 100, dist * 20


loop_render._aim_ref_cam = _aim
for _k, _v in PO.items():
    root.P[_k].update(_v)
objs = root.build()
bpy.context.view_layer.update()

g = bpy.data.collections["G_well_test"]
lo, hi = loop_render._bounds(g)
res = {"round": rnd_tag, "size_m": [round(v, 3) for v in (hi - lo)], "lo": [round(v, 3) for v in lo], "hi": [round(v, 3) for v in hi],
       "P": root.P, "CAM": CAM}
for k in ("deck", "shaft", "frame", "roof"):
    lo_k, hi_k = loop_render._bounds(g, only=[objs[k].name])
    res[k] = dict(lo=[round(v, 3) for v in lo_k], hi=[round(v, 3) for v in hi_k])
if do_render and "silonly" not in sys.argv:
    ref_res = (W // 2, H // 2) if small else (W, H)
    out = loop_render.run("G_well_test", R + "/renders/root", "r" + rnd_tag, res=768, ref_view=(CAM["az"], CAM["el"], CAM["lens"]), ref_res=(W, H) if not small else (W, H))
    res["render"] = out


def _sil(tag):
    """Own check: alpha silhouettes per child from the ref camera, half size (renders/root/<tag>_sil_<child>.png)."""
    sc, vl = bpy.context.scene, bpy.context.view_layer
    saved = [(lc, lc.exclude) for lc in vl.layer_collection.children]
    for lc in vl.layer_collection.children:
        lc.exclude = lc.name != "G_well_test"
    old = (sc.render.resolution_x, sc.render.resolution_y, sc.render.film_transparent, sc.camera, sc.render.filepath, sc.render.engine)
    sc.render.resolution_x, sc.render.resolution_y, sc.render.film_transparent = W // 2, H // 2, True
    sc.render.resolution_percentage = 100
    sc.camera = bpy.data.objects["REF_CAM"]
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    for k in ("deck", "shaft", "frame", "roof"):
        for kk, e in objs.items():
            e.hide_render = kk != k
        sc.render.filepath = R + f"/renders/root/{tag}_sil_{k}.png"
        bpy.ops.render.render(write_still=True)
    for e in objs.values():
        e.hide_render = False
    for lc, ex in saved:
        lc.exclude = ex
    sc.render.resolution_x, sc.render.resolution_y, sc.render.film_transparent, sc.camera, sc.render.filepath, sc.render.engine = old


if "sil" in sys.argv or "silonly" in sys.argv:
    if "silonly" in sys.argv:  # no loop_render run: the ref camera has to be aimed here
        _aim(None, None, 0, 0, 0, 1)
    _sil("r" + rnd_tag)
bpy.ops.wm.save_as_mainfile(filepath=R + "/root_work.blend")
os.makedirs(R + "/rounds", exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=R + f"/rounds/root_r{rnd_tag}.blend", copy=True)
print("@@RESULT@@" + json.dumps(res, default=str))
