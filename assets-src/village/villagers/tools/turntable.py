# Contact sheet of the model at several azimuths (Idle pose), studio-lit: blender --background <blend> --python turntable.py -- <out_prefix> [--elev 20] [--az 0,45,90,...]
import math
import sys

import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]
opts = dict(zip(args[1::2], args[2::2]))
elev = math.radians(float(opts.get('--elev', 20)))
azs = [float(a) for a in opts.get('--az', '0,45,90,135,180,225,270,315').split(',')]
size = int(opts.get('--size', 560))
sc = bpy.context.scene
rig = bpy.data.objects['Builder_RIG']
rig.data.pose_position = 'POSE'
rig.animation_data.action = bpy.data.actions[opts.get('--clip', 'Idle')]
sc.frame_set(int(opts.get('--frame', 1)))
ob = [o for o in bpy.data.objects if o.name.startswith('Builder_MESH')][0]
for o in bpy.data.objects:
    if o.type == 'LIGHT' or (o.type == 'MESH' and o is not ob):
        o.hide_render = True
for m in ob.data.materials:
    m.blend_method = 'OPAQUE'
cam = bpy.data.objects['Preview camera']
cam.data.type = 'ORTHO'
cam.data.ortho_scale = float(opts.get('--scale', 2.05))
sc.camera = cam
sc.render.resolution_x = sc.render.resolution_y = size
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'FLAT' if opts.get('--flat') == '1' else 'STUDIO'
sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.background_type = 'WORLD'
sc.view_settings.view_transform = 'Standard'
sc.world.color = (0.82, 0.82, 0.82)
target = Vector((0, 0, float(opts.get('--zc', 0.9))))
files = []
for az in azs:
    a = math.radians(az)  # 0 = from the front (-y), 90 = from the figure's left (+x)
    d = Vector((math.sin(a) * math.cos(elev), -math.cos(a) * math.cos(elev), math.sin(elev)))
    cam.location = target + d * 8
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    f = f'{out}_{int(az):03d}.png'
    sc.render.filepath = f
    bpy.ops.render.render(write_still=True)
    files.append(f)
print('FILES', ' '.join(files))
