"""Cross-check camera_fit's Blender conversion against Blender's own projection (needs bpy).
Run:  BPY_PY=<python with bpy> ./run_bpy.sh test_camera_fit_bpy.py
For several cameras (including portrait and wide images, and an aim offset): build a bpy camera from
Camera.blender(), project known ground/air points with bpy_extras.world_to_camera_view, and require the
same pixels as Camera.project (< 0.05 px). Also: ground_xy of those pixels returns the ground points.
"""
import json
import sys

import bpy
import numpy as np
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

import camera_fit as cf

worst = 0.0
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
for az, el, lens, dist, aim, size in [(0, 30, 50, 4.0, (0, 0), (1536, 1024)), (35, 25, 85, 6.0, (0.2, 0.1), (1024, 1024)),
                                      (-50, 40, 35, 3.0, (-0.1, 0.3), (1536, 1024)), (120, 20, 28, 5.0, (0, 0), (1024, 1536)),
                                      (15, 55, 70, 8.0, (0.5, -0.3), (1920, 1080))]:
    cam = cf._synthetic(az, el, lens, dist, aim, size)
    b = cam.blender()
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = size[0], size[1], 100
    cd = bpy.data.cameras.new("c")
    cd.lens, cd.sensor_width, cd.sensor_fit = b["lens_mm"], b["sensor_width_mm"], b["sensor_fit"]
    ob = bpy.data.objects.new("c", cd)
    sc.collection.objects.link(ob)
    ob.location, ob.rotation_mode, ob.rotation_euler = b["location"], "XYZ", b["rotation_euler"]
    bpy.context.view_layer.update()
    pts = np.array([[0, 0, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0], [0.5, -0.5, 0], [-0.5, -0.5, 0], [0.2, -0.1, 0.8], [-0.3, 0.2, 1.5]])
    ref = cam.project(pts)
    got = []
    for p in pts:
        v = world_to_camera_view(sc, ob, Vector(p))
        got.append([v.x * size[0], (1 - v.y) * size[1]])
    err = float(np.abs(np.array(got) - ref).max())
    worst = max(worst, err)
    assert err < 0.05, f"blender camera disagrees by {err:.3f} px (az {az} el {el} lens {lens} size {size})"
    g = cam.ground_xy(ref[:5])
    assert np.abs(g - pts[:5, :2]).max() < 1e-6
    bpy.data.objects.remove(ob)
    bpy.data.cameras.remove(cd)
print("@@RESULT@@", json.dumps({"camera_fit_bpy": "OK", "worst_px": round(worst, 5)}))
