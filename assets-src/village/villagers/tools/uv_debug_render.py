# Render the model from front, side, back and from above with every face whose UVs collapse painted magenta
# (those faces only show one column of atlas pixels, so they need a UV island and paint of their own).
#   blender --background <blend> --python uv_debug_render.py -- <out_dir>
import math
import sys

import bmesh
import bpy
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1]
ob = [o for o in bpy.data.objects if o.name.startswith('Builder_MESH')][0]
img = [i for i in bpy.data.images if i.name.startswith('Builder') and i.size[0] > 0][0]
TW, TH = img.size
bm = bmesh.new()
bm.from_mesh(ob.data)
bm.faces.ensure_lookup_table()
uvl = bm.loops.layers.uv.active


def poly_area(pts):
    return abs(sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
                   for i in range(len(pts)))) / 2


dens = []
for f in bm.faces:
    uv = [(l[uvl].uv.x * TW, l[uvl].uv.y * TH) for l in f.loops]
    a3 = f.calc_area()
    dens.append(math.sqrt(poly_area(uv) / a3) if a3 > 1e-9 else 0)
med = sorted(dens)[len(dens) // 2]
mag = bpy.data.materials.new('collapsed_uv')
mag.use_nodes = True
mag.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (1, 0, 0.8, 1)
mag.diffuse_color = (1, 0, 0.8, 1)
ob.data.materials.append(mag)
mi = len(ob.data.materials) - 1
n = 0
for f, d in zip(bm.faces, dens):
    if d < 0.1 * med:
        f.material_index = mi
        n += 1
bm.to_mesh(ob.data)
print('COLLAPSED', n, 'of', len(dens))
sc = bpy.context.scene
bpy.data.objects['Builder_RIG'].data.pose_position = 'REST'
for o in bpy.data.objects:
    if o.type == 'LIGHT' or (o.type == 'MESH' and o is not ob):
        o.hide_render = True
for m in ob.data.materials:
    m.blend_method = 'OPAQUE'
cam = bpy.data.objects['Preview camera']
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 2.0
sc.camera = cam
sc.render.resolution_x = sc.render.resolution_y = 700
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.background_type = 'WORLD'
sc.view_settings.view_transform = 'Standard'
sc.world.color = (0.9, 0.9, 0.9)
target = Vector((0, 0, 0.9))
views = {'front': Vector((0, -1, 0)), 'side': Vector((1, 0, 0)), 'back': Vector((0, 1, 0)),
         'above': Vector((0.55, -0.6, 0.85)).normalized()}
for name, d in views.items():
    cam.location = target + d * 8
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = f'{out}/uvdebug_{name}.png'
    bpy.ops.render.render(write_still=True)
print('RENDERED')
