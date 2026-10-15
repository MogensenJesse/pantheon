# Wireframe + flat texture renders of the model from the side / front / back, framed on the head or the full body.
#   blender --background <villager.blend> --python wire_render.py -- <out_dir> [--view side|front|back|three] [--frame head|body]
import math
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]
opts = dict(zip(args[1::2], args[2::2]))
view = opts.get('--view', 'side')
frame = opts.get('--frame', 'body')
sc = bpy.context.scene
rig = bpy.data.objects.get('Builder_RIG')
rig.data.pose_position = 'REST'
for o in bpy.data.objects:
    if o.type in ('LIGHT',):
        o.hide_render = True
    if o.type == 'MESH':
        o.hide_render = not o.name.startswith('Builder_MESH')
mesh = [o for o in bpy.data.objects if o.name.startswith('Builder_MESH')][0]
for m in mesh.data.materials:
    m.blend_method = 'OPAQUE'  # the Codex material is hashed: workbench then shows overlapping layers ghosted
cam = bpy.data.objects['Preview camera']
cam.data.type = 'ORTHO'
if frame == 'head':
    cam.data.ortho_scale, zc = 0.62, 1.55
elif frame == 'torso':
    cam.data.ortho_scale, zc = 0.9, 0.95
else:
    cam.data.ortho_scale, zc = 2.0, 0.9
rots = {'side': ((6, 0, zc), (90, 0, 90)), 'front': ((0, -6, zc), (90, 0, 0)), 'back': ((0, 6, zc), (90, 0, 180)),
        'three': (None, None)}
loc, rot = rots[view]
if view == 'three':
    # Look at the figure from the front-right, slightly above (ortho: the view axis must pass through the target).
    from mathutils import Vector
    target = Vector((0, 0, zc))
    direction = Vector((0.62, -0.72, 0.30)).normalized()
    cam.location = target + direction * 8
    cam.rotation_euler = (-direction).to_track_quat('-Z', 'Y').to_euler()
else:
    cam.location = loc
    cam.rotation_euler = [math.radians(r) for r in rot]
sc.camera = cam
sc.render.resolution_x = sc.render.resolution_y = int(opts.get('--size', 900))
sc.render.film_transparent = False
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.light = 'STUDIO'
sc.display.shading.background_type = 'WORLD'
if sc.world:
    sc.world.color = (0.82, 0.82, 0.82)
sc.display.shading.color_type = 'TEXTURE'
sc.display.shading.show_cavity = False
sc.view_settings.view_transform = 'Standard'
world = sc.world
if world and world.use_nodes:
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
if opts.get('--wire', '1') == '1':
    # Workbench renders draw no wire overlay: lay a thin black wireframe copy over the mesh.
    wire = mesh.copy()
    wire.data = mesh.data.copy()
    wire.name = 'wire_copy'
    wire.parent = mesh.parent
    for m in list(wire.modifiers):
        wire.modifiers.remove(m) if m.type != 'ARMATURE' else None
    mod = wire.modifiers.new('wire', 'WIREFRAME')
    mod.thickness = 0.0016
    mod.use_even_offset = False
    mod.offset = 1.0
    black = bpy.data.materials.new('wire_black')
    black.diffuse_color = (0, 0, 0, 1)
    wire.data.materials.clear()
    wire.data.materials.append(black)
    bpy.context.scene.collection.objects.link(wire)
sc.display.shading.show_object_outline = False
sc.render.filepath = f"{out}/{view}_{frame}.png"
bpy.ops.render.render(write_still=True)
print('RENDERED', sc.render.filepath)
