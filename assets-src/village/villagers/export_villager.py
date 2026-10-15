# assets-src/village/villagers/export_villager.py — export a villager .blend (rig, skinned mesh, clips, held tool)
# to the game GLB.
#
#   blender --background villagers/builder_m/builder_m.blend --python villagers/export_villager.py -- \
#     --figure builder_m --glb public/models/village-kit/villager_builder_m.glb [--preview <dir>]
#
# The tool meshes are parented to the hand bone, gripped at the fist with the handle across the palm and the
# head forward, so they export as children of that bone's node. The game shows the tool only during the work
# clip (see skinnedVillager.ts). --preview renders the work clip from the side, with the tool, to check the grip.
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

FIGURES = {
    'builder_m': {
        'rig': 'Builder_RIG',
        'mesh': 'Builder_MESH • textured v2',
        'tool': ('Hammer • handle', 'Hammer • head'),
        'bone': 'hand.L',
        'fingers': ('fingers.L', 'thumb.L'),
        # Grip height along the handle (tool space, from its bottom), and how far the fist sits along the hand.
        'grip_z': 0.09,
        'work_clip': 'Hammer_gesture',
    },
}


def fist_centre(mesh, rig, names):
    """Centroid (rest pose, world) of the vertices mostly weighted to the hand bones."""
    groups = {g.index for g in mesh.vertex_groups if g.name in names}
    pts = []
    for v in mesh.data.vertices:
        w = sum(g.weight for g in v.groups if g.group in groups)
        if w > 0.5:
            pts.append(mesh.matrix_world @ v.co)
    return sum(pts, Vector()) / len(pts)


def attach_tool(spec):
    rig = bpy.data.objects[spec['rig']]
    mesh = bpy.data.objects[spec['mesh']]
    bone = rig.data.bones[spec['bone']]
    centre = fist_centre(mesh, rig, (spec['bone'],) + spec['fingers'])
    hand_axis = (rig.matrix_world @ bone.tail_local - rig.matrix_world @ bone.head_local).normalized()
    # Handle across the palm, in the swing plane, pointing forward (-Y is the figure's front).
    forward = Vector((0, -1, 0))
    handle = (forward - hand_axis * forward.dot(hand_axis)).normalized()
    side = handle.cross(hand_axis).normalized()
    # Tool space: +Z along the handle toward the head, +Y toward the hand axis (head stays upright on it).
    rot = Matrix((side, -hand_axis, handle)).transposed().to_4x4()
    tools = [bpy.data.objects[n] for n in spec['tool']]
    base_z = min(min((o.matrix_world @ Vector(c)).z for c in o.bound_box) for o in tools)
    base_x = tools[0].matrix_world.translation.x
    base_y = tools[0].matrix_world.translation.y
    # A bone child hangs off the bone's tail; cancel that in the rest pose so the placement below is world space.
    tail = rig.matrix_world @ bone.matrix_local @ Matrix.Translation((0, bone.length, 0))
    for o in tools:
        # Tool authored upright (handle along +Z from base_z); its grip point goes to the fist centre.
        world = Matrix.Translation(centre) @ rot @ Matrix.Translation(
            Vector((-base_x, -base_y, -base_z - spec['grip_z']))) @ o.matrix_world
        o.parent = rig
        o.parent_type = 'BONE'
        o.parent_bone = spec['bone']
        o.matrix_parent_inverse = tail.inverted()
        o.matrix_basis = world
        o.hide_render = False
    print('FIST', [round(c, 3) for c in centre], 'HANDLE', [round(c, 3) for c in handle])
    return tools


def _channelbags(action):
    for layer in action.layers:
        for strip in layer.strips:
            yield from strip.channelbags


def keep_fist(spec):
    """The work clip opens the hand; drop its finger and thumb keys so the hand stays a fist round the tool."""
    action = bpy.data.actions[spec['work_clip']]
    for bag in _channelbags(action):
        for fc in [fc for fc in bag.fcurves if any(f'"{b}"' in fc.data_path for b in spec['fingers'])]:
            bag.fcurves.remove(fc)


def preview(spec, path):
    sc = bpy.context.scene
    rig = bpy.data.objects[spec['rig']]
    rig.animation_data.action = bpy.data.actions[spec['work_clip']]
    cam = bpy.data.objects.get('Preview camera')
    cam.location = (5.0, 0.0, 1.0)
    cam.rotation_euler = (math.radians(90), 0, math.radians(90))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 2.4
    sc.camera = cam
    sc.render.resolution_x = sc.render.resolution_y = 500
    sc.render.engine = 'BLENDER_EEVEE'
    a = bpy.data.actions[spec['work_clip']]
    f0, f1 = int(a.frame_range[0]), int(a.frame_range[1])
    for f in range(f0, f1 + 1, max(1, (f1 - f0) // 4)):
        sc.frame_set(f)
        sc.render.filepath = os.path.join(path, f'work_{f:02d}.png')
        bpy.ops.render.render(write_still=True)


def export(spec, path):
    rig = bpy.data.objects[spec['rig']]
    rig.animation_data.action = None
    bpy.ops.object.select_all(action='DESELECT')
    for o in [rig, bpy.data.objects[spec['mesh']], *(bpy.data.objects[n] for n in spec['tool'])]:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
        export_animations=True, export_animation_mode='ACTIONS', export_skins=True, export_cameras=False,
        export_lights=False, export_extras=False,
    )


def main(argv):
    args = argv[argv.index('--') + 1:] if '--' in argv else []
    opts = dict(zip(args[::2], args[1::2]))
    spec = FIGURES[opts['--figure']]
    attach_tool(spec)
    keep_fist(spec)
    if '--preview' in opts:
        preview(spec, opts['--preview'])
    if '--glb' in opts:
        export(spec, opts['--glb'])
        print('EXPORTED', opts['--glb'])


if __name__ == '__main__':
    main(sys.argv)
