"""Print the heights that decide where the bucket hangs (world frame, root v2 placement): ring top, bucket rim/bail/bottom, windlass axle, strand tip.
blender -b root_work.blend --factory-startup --python probe_pos.py"""
import sys

import bpy
from mathutils import Vector

sys.path[:0] = [r"D:/pantheon/assets-src/model-loop/well_test/build"]
import frame  # noqa: E402
import shaft  # noqa: E402

shaft.build()
out = frame.build()
bpy.context.view_layer.update()
SHAFT_S, FRAME_Z = 1.13, 0.188


def zr(objs, mw=None):
    zs = []
    for o in objs:
        m = (mw or o.matrix_world) @ o.matrix_world if False else None
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            zs.append(p.z)
    return min(zs), max(zs)


g = bpy.data.collections["G_shaft"]
print("RING top (shaft own frame)", round(zr(g.objects)[1], 3), "-> world", round(zr(g.objects)[1] * SHAFT_S, 3))
b = out["bucket"]
col = bpy.data.collections["P_bucket"]
for o in col.objects:
    zs = [(b.matrix_world @ o.matrix_world @ Vector(c)).z for c in o.bound_box]
    print("BUCKET part", o.name, "z", round(min(zs) + FRAME_Z, 3), round(max(zs) + FRAME_Z, 3))
print("axle z (frame frame)", round(frame.P["post_h"] - frame.P["axle_off"], 3), "-> world", round(frame.P["post_h"] - frame.P["axle_off"] + FRAME_Z, 3))
wr = bpy.data.objects["windlass_rope"]
print("rope strand tip z own", round(min(v.co.z for v in wr.data.vertices), 3), "hang", None)
print("bucket dims", [round(v, 3) for v in bpy.data.objects["bucket"].dimensions])
