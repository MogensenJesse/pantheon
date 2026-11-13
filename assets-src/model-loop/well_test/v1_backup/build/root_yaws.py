"""Own check: workbench renders of the whole well from the ref camera for several deck yaws (renders/root/yaw_<n>.png), deck at the fitted scale/offset.
blender -b root_work.blend --python root_yaws.py"""
import math, sys, os
import bpy
from mathutils import Vector
R = r"D:/pantheon/assets-src/model-loop/well_test"
sys.path.insert(0, R + "/build")
W, H = 2752, 1536
CAM = dict(az=30.0, el=20.0, lens=50.0, ppm=427.0, target=(0.0, 0.0, 0.75), px=(1410.0, 835.0))
for line in open(R + "/build/root_round.py").read().splitlines():
    if line.startswith("CAM.update"):
        exec(line)
sc = bpy.context.scene
vl = bpy.context.view_layer
cam = bpy.data.objects["REF_CAM"]
cd = cam.data
cd.lens = CAM["lens"]; cd.sensor_fit = "AUTO"
f_px = CAM["lens"] / cd.sensor_width * W
dist = f_px / CAM["ppm"]
a, e = math.radians(CAM["az"]), math.radians(CAM["el"])
tgt = Vector(CAM["target"])
cam.location = tgt + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
cam.rotation_euler = (tgt - cam.location).to_track_quat("-Z", "Y").to_euler()
cd.shift_x = -(CAM["px"][0] - W / 2) / W
cd.shift_y = (CAM["px"][1] - H / 2) / W
cd.clip_start, cd.clip_end = dist / 100, dist * 20
for lc in vl.layer_collection.children:
    lc.exclude = lc.name != "G_well_test"
sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W // 2, H // 2, 100
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "STUDIO"
sc.display.shading.color_type = "MATERIAL"
sc.render.film_transparent = False
sc.render.image_settings.file_format = "PNG"
deck = bpy.data.objects["well_deck"]
ys = [int(x) for x in sys.argv[sys.argv.index("--") + 1:]] if "--" in sys.argv else list(range(0, 360, 30))
for y in ys:
    deck.rotation_euler = (0, 0, math.radians(y))
    deck.location = (0.1, -0.2, 0)
    deck.scale = (1.1, 1.1, 1.1)
    sc.render.filepath = R + f"/renders/root/yaw_{y}.png"
    bpy.ops.render.render(write_still=True)
print("@@RESULT@@done")
