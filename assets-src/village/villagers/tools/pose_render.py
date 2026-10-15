# Render the model in a clip at a few frames, side view (or any --view), flat-lit: row of frames.
#   blender --background <villager.blend> --python pose_render.py -- <out.png> --clip Walk_in_place --frames 1,9,17,25 [--view side|front|three]
import math
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]
opts = dict(zip(args[1::2], args[2::2]))
clip = opts.get('--clip', 'Walk_in_place')
frames = [int(f) for f in opts.get('--frames', '1,9,17,25').split(',')]
view = opts.get('--view', 'side')
sc = bpy.context.scene
rig = bpy.data.objects['Builder_RIG']
rig.data.pose_position = 'POSE'
rig.animation_data.action = bpy.data.actions[clip]
for o in bpy.data.objects:
    if o.type == 'LIGHT':
        o.hide_render = True
    if o.type == 'MESH':
        o.hide_render = not o.name.startswith('Builder_MESH')
cam = bpy.data.objects['Preview camera']
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 2.1
target = Vector((0, 0, 0.9))
d = {'side': Vector((1, 0, 0)), 'front': Vector((0, -1, 0)), 'three': Vector((0.62, -0.72, 0.2)).normalized()}[view]
cam.location = target + d * 8
cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
sc.camera = cam
size = 600
sc.render.resolution_x = sc.render.resolution_y = size
sc.render.film_transparent = False
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.background_type = 'WORLD'
sc.view_settings.view_transform = 'Standard'
sc.world.color = (0.85, 0.85, 0.85)
import os
tmp = []
for f in frames:
    sc.frame_set(f)
    p = out.replace('.png', f'_{f}.png')
    sc.render.filepath = p
    bpy.ops.render.render(write_still=True)
    tmp.append(p)
print('FRAMES', ' '.join(tmp))
