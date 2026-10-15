# Render the model's side silhouette (transparent film) at the reference sheet's pixel scale.
#   blender --background <villager.blend> --python side_render.py -- <out.png> [--rest 1]
# The reference side view (17.png) is 532 x 812 px with feet at row 725 and cap top at row 167 (1.782 m).
import math
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]
opts = dict(zip(args[1::2], args[2::2]))
W, H = 532, 812
PPM = 558 / 1.782
FEET_ROW = 725
Y_AT_COL = (float(opts.get('--y0', 0.0)), 266)  # Blender Y at image column 266 (centre)

sc = bpy.context.scene
rig = bpy.data.objects.get('Builder_RIG')
if rig and opts.get('--rest', '1') == '1':
    rig.data.pose_position = 'REST'
for o in bpy.data.objects:
    if o.type == 'MESH' and not o.name.startswith('Builder_MESH'):
        o.hide_render = True
    if o.type == 'LIGHT':
        o.hide_render = True
for o in bpy.data.objects:
    if o.type == 'MESH' and o.name.startswith('Builder_MESH'):
        o.hide_render = False
cam = bpy.data.objects['Preview camera']
cam.data.type = 'ORTHO'
cam.data.ortho_scale = H / PPM
z_c = 0.018 + (FEET_ROW - H / 2) / PPM
cam.location = (6.0, Y_AT_COL[0], z_c)
cam.rotation_euler = (math.radians(90), 0, math.radians(90))
cam.data.shift_x = 0
cam.data.shift_y = 0
sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.resolution_percentage = 100
sc.render.film_transparent = True
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT'
sc.display.shading.color_type = 'TEXTURE'
sc.view_settings.view_transform = 'Standard'
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('RENDERED', out)
