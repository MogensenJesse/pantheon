"""Test recon_import.run on a synthetic Trellis-like GLB (needs bpy):
a lumpy dense blob about 1 m tall, tilted off the floor, with a baked-looking material and vertex colours,
plus two tiny floating fragments and a stray vertex. Run:  BPY_PY=<python with bpy> ./run_bpy.sh test_recon_import.py
"""
import json
import os
import tempfile

import bpy
import numpy as np

import recon_import

tmp = tempfile.mkdtemp(prefix="recon_test_")
glb = os.path.join(tmp, "raw.glb")

# --- build the raw piece and export it
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=6, radius=0.5)  # 20,480 tris
blob = bpy.context.object
co = np.empty(len(blob.data.vertices) * 3)
blob.data.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)
rng = np.random.default_rng(3)
co[:, 2] *= 1.0 + 0.8 * (co[:, 2] > 0)  # taller than wide
co += rng.normal(0, 0.004, co.shape) + 0.5 * 0.0
blob.data.vertices.foreach_set("co", co.ravel())
blob.data.update()
blob.location = (3.0, -2.0, 4.0)  # off the origin, floating
for i in range(2):  # tiny floaters
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.02, location=(0.9 + i * 0.1, 0.2, 0.3))
mat = bpy.data.materials.new("trellis_baked")
mat.use_nodes = True
for o in bpy.context.scene.objects:
    o.data.materials.append(mat)
blob.data.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", use_selection=True)

# --- fresh file, import and clean
bpy.ops.wm.read_factory_settings(use_empty=True)
st = recon_import.run(glb, "runestone", dims_m=(1.2, 0.6, 3.2), tris=3000)
print("@@RESULT@@", json.dumps(st))

objs = [o for o in bpy.data.objects]
assert [o.name for o in objs] == ["runestone"], [o.name for o in objs]  # one piece, nothing left over
o = objs[0]
assert st["loose_removed"] == 2, st
assert st["tris_in"] > 20000 and st["tris_out"] <= 3000 * 1.15, st
assert abs(st["size_m"][2] - 3.2) < 1e-3 or max(st["size_m"][0] / 1.2, st["size_m"][1] / 0.6) <= 1.001, st  # fits the box
assert st["z_min"] == 0 and st["centre_xy"] == [0.0, 0.0], st  # bottom-centre origin
assert len(o.data.materials) == 0 and not o.data.color_attributes, "material / colours were not stripped"
assert tuple(o.location) == (0, 0, 0) and o.users_collection[0].name == "P_runestone"
assert not [i for i in bpy.data.images], "an image is left behind"
sx, sy, sz = st["size_m"]
assert sx <= 1.2 + 1e-3 and sy <= 0.6 + 1e-3 and sz <= 3.2 + 1e-3, st
print("@@RESULT@@ recon_import test OK")
