# Render the model's front silhouette / textured view at the front reference's pixel scale.
#   blender --background <villager.blend> --python front_render.py -- <out.png> [--rest 1] [--clip Idle --frame 1] [--light studio|flat] [--mask 1] [--view front|back]
# Reference front view (builder-farmer.jpg crop 440 x 640): figure centre column 225.5, feet row 628, cap top row 62
# (1.782 m): 317.6 px / m.
import math
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]
opts = dict(zip(args[1::2], args[2::2]))
W, H = 440, 640
BACK = opts.get('--view', 'front') == 'back'
# back reference (builder-farmer.jpg crop at 970,100): figure centre column 210, feet row 626, cap top row 62
PPM = (564 if BACK else 566) / 1.782
FEET_ROW = 626 if BACK else 628
CENTER_COL = 210.0 if BACK else 225.5
RS = int(opts.get('--rs', 1))

sc = bpy.context.scene
rig = bpy.data.objects['Builder_RIG']
if opts.get('--rest', '1') == '1':
    rig.data.pose_position = 'REST'
else:
    rig.data.pose_position = 'POSE'
    rig.animation_data.action = bpy.data.actions[opts.get('--clip', 'Idle')]
    sc.frame_set(int(opts.get('--frame', 1)))
for o in bpy.data.objects:
    if o.type == 'LIGHT':
        o.hide_render = True
    if o.type == 'MESH':
        o.hide_render = not o.name.startswith('Builder_MESH')
cam = bpy.data.objects['Preview camera']
cam.data.type = 'ORTHO'
cam.data.ortho_scale = H / PPM
z_c = 0.018 + (FEET_ROW - H / 2) / PPM
if BACK:  # seen from behind the image's right is -x
    cam.location = ((CENTER_COL - W / 2) / PPM, 6.0, z_c)
    cam.rotation_euler = (math.radians(90), 0, math.radians(180))
else:
    cam.location = ((W / 2 - CENTER_COL) / PPM, -6.0, z_c)  # model x = 0 lands on the centre column
    cam.rotation_euler = (math.radians(90), 0, 0)
sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y = W * RS, H * RS
sc.render.film_transparent = opts.get('--mask', '0') == '1'
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO' if opts.get('--light') == 'studio' else 'FLAT'
sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.background_type = 'WORLD'
sc.view_settings.view_transform = 'Standard'
sc.world.color = (1, 1, 1)
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print('RENDERED', out)
