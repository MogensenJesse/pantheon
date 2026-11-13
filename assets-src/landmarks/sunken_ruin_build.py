# assets-src/landmarks/sunken_ruin_build.py — the Sunken ruin landmark model, baked from the model-loop temple
#
# Source: assets-src/model-loop/temple_ruin/temple_work.blend, collection G_temple_ruin (round t11: the five groups as
# collection instances on a stone podium, boulders, rubble heaps, steles, ivy). Its 33 materials are procedural (box-
# projected painted textures in each object's own space, moss masks from mesh attributes, per-object value shifts,
# ambient occlusion), and the game's prop material reads only a base colour map, so this script:
#   1. realizes every instance into its own object (modifiers applied, mesh attributes kept, own Object Info random),
#   2. unwraps all of them together into one shared UV atlas,
#   3. joins a copy of them into one target mesh (it carries the atlas UVs),
#   4. bakes the originals' base colour onto the target in ONE Cycles bake (selected to active, EMIT): the originals
#      keep their own object space, so the texture mapping and per-object variation look exactly as in the blend.
#      (Baking the 669 objects straight into one image re-synced the whole scene once per object and took hours.)
#   5. exports the target (one mesh, one plain material: atlas -> base colour), foot on z = 0, centred on its box.
# Pipeline:
#   1. blender -b assets-src/model-loop/temple_ruin/temple_work.blend --factory-startup --python this file -- <out.glb> [atlas px] [max objects]
#        (open the blend from its own folder: its textures are relative; [max objects] only for quick tests)
#        -> public/models/landmarks/sunken_ruin.glb (PNG atlas), atlas also saved as assets-src/landmarks/sunken_ruin_atlas.png,
#           progress in assets-src/landmarks/sunken_ruin_build.log
#   2. node scripts/assets/bake-play-props.mjs --one public/models/landmarks/sunken_ruin.glb   (KTX2 + LOD chain)
# The front of the temple (Blender -Y, where the stairs and the arch are) becomes glTF +Z, the facing of a landmark at
# rotY 0. Units stay metres; the manifest's targetHeightM is the model's own height, so the game keeps the size.

import json
import math
import os
import sys
import time

import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
OUT = args[0]
RES = int(args[1]) if len(args) > 1 else 4096
LIMIT = int(args[2]) if len(args) > 2 else 0
ROOT = 'G_temple_ruin'
HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS_PNG = os.path.join(HERE, 'sunken_ruin_atlas.png' if not LIMIT else 'sunken_ruin_atlas_test.png')
LOG = os.path.join(HERE, 'sunken_ruin_build.log')
T0 = time.time()
open(LOG, 'w').close()


def log(step, **kw):
    """Progress line straight to a file (a piped stdout only flushes at the end, so a stall shows nothing)."""
    line = '%6.1fs %s %s' % (time.time() - T0, step, json.dumps(kw) if kw else '')
    with open(LOG, 'a', encoding='utf-8') as f:
        f.write(line + chr(10))
    print(line, flush=True)


scene = bpy.context.scene
vl = bpy.context.view_layer

# 1. realize: only the root group stays in the view layer (instances of excluded group collections still evaluate)
for lc in vl.layer_collection.children:
    lc.exclude = lc.name != ROOT
vl.update()
dg = bpy.context.evaluated_depsgraph_get()
out_col = bpy.data.collections.new('SUNKEN_EXPORT')
scene.collection.children.link(out_col)
src = []
for inst in dg.object_instances:
    ob = inst.object
    if ob.type != 'MESH':
        continue
    me = bpy.data.meshes.new_from_object(ob, preserve_all_data_layers=True, depsgraph=dg)
    if len(me.polygons) == 0:
        bpy.data.meshes.remove(me)
        continue
    new = bpy.data.objects.new('ruin_%04d' % len(src), me)
    new.matrix_world = inst.matrix_world.copy()
    out_col.objects.link(new)
    src.append(new)
    if LIMIT and len(src) >= LIMIT:
        break
for lc in vl.layer_collection.children:
    lc.exclude = lc.name != out_col.name
vl.update()
tris = 0
for o in src:
    o.data.calc_loop_triangles()
    tris += len(o.data.loop_triangles)
log('realized', objects=len(src), tris=tris)

# 2. one shared UV atlas. The dark core boxes (podium, stairs, walls) are one flat colour and mostly hidden, but big:
#    they get their own unwrap squeezed into a corner, so the visible stone gets the atlas.
for o in src:
    uv = o.data.uv_layers.new(name='atlas')
    o.data.uv_layers.active = uv
core = [o for o in src if any(m and 'core' in m.name.lower() for m in o.data.materials)]
rest = [o for o in src if o not in core]
CORNER = 0.03


def unwrap(objs, scale, offset):
    if not objs:
        return
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    # smart_project packs once itself; an extra pack_islands over tens of thousands of stone facets is very slow
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in objs:
        for d in o.data.uv_layers['atlas'].data:
            d.uv = (d.uv[0] * scale + offset, d.uv[1] * scale + offset)


unwrap(rest, 1.0 - CORNER - 0.004, 0.0)
unwrap(core, CORNER, 1.0 - CORNER)
log('unwrapped', core=[o.name for o in core])

# 3. the bake target: a joined copy of everything (world space, atlas UVs only, one plain material)
img = bpy.data.images.new('sunken_ruin_atlas', RES, RES, alpha=False, float_buffer=False)
img.colorspace_settings.name = 'sRGB'
mat = bpy.data.materials.new('sunken_ruin')
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = img
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 1.0
bsdf.inputs['Metallic'].default_value = 0.0
nt.nodes.active = tex
copies = []
for o in src:
    c = o.copy()
    c.data = o.data.copy()
    out_col.objects.link(c)
    me = c.data
    me.materials.clear()
    me.materials.append(mat)
    for uv in [u for u in me.uv_layers if u.name != 'atlas']:
        me.uv_layers.remove(uv)
    for name in [a.name for a in me.attributes if not a.is_internal and not a.name.startswith('.')
                 and a.name not in ('position', 'sharp_face', 'sharp_edge', 'atlas')]:
        if name in me.attributes:
            me.attributes.remove(me.attributes[name])
    for cattr in list(me.color_attributes):
        me.color_attributes.remove(cattr)
    copies.append(c)
with bpy.context.temp_override(active_object=copies[0], selected_objects=copies, selected_editable_objects=copies):
    bpy.ops.object.join()
target = copies[0]
target.name = 'sunken_ruin'
target.data.transform(target.matrix_world)
target.matrix_world = Matrix.Identity(4)
for attr in ('visible_diffuse', 'visible_glossy', 'visible_shadow', 'visible_transmission', 'visible_volume_scatter'):
    setattr(target, attr, False)  # the originals' ambient-occlusion rays must not hit the coincident copy
log('target joined', faces=len(target.data.polygons))

# 4. the originals emit their base colour; one selected-to-active bake writes it into the atlas
mats = {m for o in src for m in o.data.materials if m}
for m in mats:
    mnt = m.node_tree
    out = next(n for n in mnt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
    mb = next((n for n in mnt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    emit = mnt.nodes.new('ShaderNodeEmission')
    if mb is not None and mb.inputs['Base Color'].links:
        mnt.links.new(mb.inputs['Base Color'].links[0].from_socket, emit.inputs['Color'])
    elif mb is not None:
        emit.inputs['Color'].default_value = mb.inputs['Base Color'].default_value
    mnt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    for n in mnt.nodes:
        if n.type == 'AMBIENT_OCCLUSION':
            n.samples = 8
scene.render.engine = 'CYCLES'
scene.cycles.samples = 4
scene.cycles.device = 'CPU'
scene.render.bake.margin = 6
bpy.ops.object.select_all(action='DESELECT')
for o in src:
    o.select_set(True)
target.select_set(True)
vl.objects.active = target
log('bake start', materials=len(mats), res=RES)
with bpy.context.temp_override(active_object=target, selected_objects=src + [target], selected_editable_objects=src + [target]):
    bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=0.01, max_ray_distance=0.04, margin=6, use_clear=True)
log('bake done')
img.filepath_raw = ATLAS_PNG
img.file_format = 'PNG'
img.save()

# 5. export the target: foot on z = 0, centred on its box
for o in src:
    bpy.data.objects.remove(o)
me = target.data
lo = Vector((min(v.co.x for v in me.vertices), min(v.co.y for v in me.vertices), min(v.co.z for v in me.vertices)))
hi = Vector((max(v.co.x for v in me.vertices), max(v.co.y for v in me.vertices), max(v.co.z for v in me.vertices)))
me.transform(Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))))
me.update()
for attr in ('visible_diffuse', 'visible_glossy', 'visible_shadow', 'visible_transmission', 'visible_volume_scatter'):
    setattr(target, attr, True)
bpy.ops.object.select_all(action='DESELECT')
target.select_set(True)
vl.objects.active = target
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                          export_image_format='AUTO', export_materials='EXPORT', export_normals=True, export_texcoords=True)
me.calc_loop_triangles()
log('exported', out=OUT, tris=len(me.loop_triangles), size_m=[round(h - l, 2) for l, h in zip(lo, hi)])
