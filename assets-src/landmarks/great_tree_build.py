# assets-src/landmarks/great_tree_build.py — the Great tree landmark model, baked from the scene-recon assembly
#
# Source: assets-src/model-loop/great_tree_recon/great_tree_recon_scene.blend, collection G_great_tree (trunk and roots,
# crown, rockery, three runestones, ivy). Its materials are procedural (box-projected painted textures in each object's own
# space, moss masks from mesh attributes, ambient occlusion, a rune mask driving the runestones' emission), and the game's
# prop material reads only a base colour map, so this script:
#   1. joins a copy of every solid object (all but the ivy) into one target mesh, unwraps it into one UV atlas,
#   2. bakes the originals' base colour (plus the runes' emission) onto the target in ONE Cycles bake (selected to active,
#      EMIT): the originals keep their own object space, so the texture mapping looks as in the blend,
#   3. exports the target plus the ivy as two primitives: `great_tree` (the atlas) and `great_tree_ivy_leaf` (the ivy
#      card's own alpha texture; the name makes the game treat it as foliage and cut it out),
#   4. makes lod1 (35 % of the triangles, 1024 atlas) and lod2 (10 %, 512 atlas) with Blender's collapse decimator (the
#      play baker's simplify cannot reduce flat-shaded, seam-heavy meshes); the ivy cards stay whole in every LOD so all
#      three keep the same two primitives (the play instancing needs aligned primitive counts).
# Pipeline:
#   1. blender -b assets-src/model-loop/great_tree_recon/great_tree_recon_scene.blend --factory-startup --python this file \
#        -- <out.glb> [atlas px]
#        -> <out>.glb, <out>_lod1.glb, <out>_lod2.glb (PNG textures; default public/models/landmarks/great_tree*.glb), the
#           atlas as assets-src/landmarks/great_tree_atlas.png, progress in assets-src/landmarks/great_tree_build.log
#   2. node scripts/assets/bake-play-props.mjs --one public/models/landmarks/great_tree.glb --no-lod   (and _lod1, _lod2)
# The front of the scene (Blender -Y, where the runestones and the camera are) becomes glTF +Z, the facing of a landmark at
# rotY 0. Units stay metres, foot on z = 0, x and y stay the scene's own (the rockery's centre), so the manifest's
# targetHeightM is the model's own height and the game keeps the size.

import json
import math
import os
import struct
import sys
import time

import bpy
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index('--') + 1:]
OUT = args[0]
RES = int(args[1]) if len(args) > 1 else 4096
ROOT = 'G_great_tree'
IVY = 'A_ivy'
HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS_PNG = os.path.join(HERE, 'great_tree_atlas.png' if RES >= 2048 else 'great_tree_atlas_test.png')
LOG = os.path.join(HERE, 'great_tree_build.log')
LEVELS = ((1, 0.35, 1024, 512), (2, 0.10, 512, 256))  # lod, triangle share, atlas px, ivy texture px
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
col = bpy.data.collections[ROOT]
src = [o for o in col.objects if o.type == 'MESH' and o.name != IVY]
ivy = bpy.data.objects[IVY]
log('sources', solid=[o.name for o in src], ivy=ivy.name)

# 1. the bake target: a joined copy of the solid objects (world space, one plain material, no other UV layers or attributes)
img = bpy.data.images.new('great_tree_atlas', RES, RES, alpha=False, float_buffer=False)
img.colorspace_settings.name = 'sRGB'
mat = bpy.data.materials.new('great_tree')
mat.use_nodes = True
nt = mat.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
tex = nt.nodes.new('ShaderNodeTexImage')
tex.image = img
nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 1.0
bsdf.inputs['Metallic'].default_value = 0.0
nt.nodes.active = tex
out_col = bpy.data.collections.new('GREAT_TREE_EXPORT')
scene.collection.children.link(out_col)
copies = []
for o in src:
    c = o.copy()
    c.data = o.data.copy()
    out_col.objects.link(c)
    me = c.data
    me.materials.clear()
    me.materials.append(mat)
    for uv in list(me.uv_layers):
        me.uv_layers.remove(uv)
    for name in [a.name for a in me.attributes if not a.is_internal and not a.name.startswith('.')
                 and a.name not in ('position', 'sharp_face', 'sharp_edge', 'custom_normal')]:
        if name in me.attributes:
            me.attributes.remove(me.attributes[name])
    for cattr in list(me.color_attributes):
        me.color_attributes.remove(cattr)
    copies.append(c)
with bpy.context.temp_override(active_object=copies[0], selected_objects=copies, selected_editable_objects=copies):
    bpy.ops.object.join()
target = copies[0]
target.name = 'great_tree'
target.data.transform(target.matrix_world)
target.matrix_world = Matrix.Identity(4)
target.data.name = 'great_tree'
log('target joined', faces=len(target.data.polygons))
# the glTF exporter warns "mesh is not valid" for the joined mesh: validate() repairs and reports it (verbose prints what)
log('validated', repaired=target.data.validate(verbose=True))

# 2. one UV atlas. The surface is faceted, so smart_project makes about 27k islands of 5 facets: a margin of 8 px between
#    them (island_margin 0.002) left 1.5 % of the atlas covered (13 px/m); a 1 px margin plus a second, AABB-shaped
#    pack (a concave pack over this many islands stalls) covers 51 % (74 px/m at 4096).
bpy.ops.object.select_all(action='DESELECT')
target.select_set(True)
vl.objects.active = target
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
uv = target.data.uv_layers.new(name='atlas')
target.data.uv_layers.active = uv
bpy.ops.uv.smart_project(angle_limit=math.radians(89), island_margin=0.0002, area_weight=0.0, correct_aspect=True,
                         scale_to_bounds=False)
bpy.ops.uv.select_all(action='SELECT')
bpy.ops.uv.pack_islands(rotate=True, margin_method='FRACTION', margin=0.0003, shape_method='AABB')
bpy.ops.object.mode_set(mode='OBJECT')
log('unwrapped')
for attr in ('visible_diffuse', 'visible_glossy', 'visible_shadow', 'visible_transmission', 'visible_volume_scatter'):
    setattr(target, attr, False)  # the originals' ambient-occlusion rays must not hit the coincident copy

# 3. the originals emit their base colour (plus the rune emission); one selected-to-active bake writes it into the atlas
mats = {m for o in src for m in o.data.materials if m}
for m in mats:
    mnt = m.node_tree
    out = next(n for n in mnt.nodes if n.type == 'OUTPUT_MATERIAL' and n.is_active_output)
    mb = next((n for n in mnt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    emit = mnt.nodes.new('ShaderNodeEmission')
    color_out = None  # a socket, or None when the colour is the BSDF's constant
    if mb is not None and mb.inputs['Base Color'].links:
        color_out = mb.inputs['Base Color'].links[0].from_socket
    if mb is not None and mb.inputs['Emission Strength'].links:
        # glowing parts (the runes): base colour + emission colour x strength (the mix clamps the strength to 1)
        mix = mnt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'ADD'
        mix.inputs[0].default_value = 1.0
        mnt.links.new(mb.inputs['Emission Strength'].links[0].from_socket, mix.inputs[0])
        if color_out is not None:
            mnt.links.new(color_out, mix.inputs[6])
        else:
            mix.inputs[6].default_value = mb.inputs['Base Color'].default_value
        mix.inputs[7].default_value = mb.inputs['Emission Color'].default_value
        color_out = mix.outputs[2]
    if color_out is not None:
        mnt.links.new(color_out, emit.inputs['Color'])
    elif mb is not None:
        emit.inputs['Color'].default_value = mb.inputs['Base Color'].default_value
    mnt.links.new(emit.outputs['Emission'], out.inputs['Surface'])
    for n in mnt.nodes:
        if n.type == 'AMBIENT_OCCLUSION':
            n.samples = 8
scene.render.engine = 'CYCLES'
scene.cycles.samples = 4
scene.cycles.device = 'CPU'
scene.render.bake.margin = 3
bpy.ops.object.select_all(action='DESELECT')
for o in src:
    o.select_set(True)
target.select_set(True)
vl.objects.active = target
log('bake start', materials=len(mats), res=RES)
with bpy.context.temp_override(active_object=target, selected_objects=src + [target], selected_editable_objects=src + [target]):
    bpy.ops.object.bake(type='EMIT', use_selected_to_active=True, cage_extrusion=0.01, max_ray_distance=0.04, margin=3, use_clear=True)
log('bake done')
img.filepath_raw = ATLAS_PNG
img.file_format = 'PNG'
img.save()
for attr in ('visible_diffuse', 'visible_glossy', 'visible_shadow', 'visible_transmission', 'visible_volume_scatter'):
    setattr(target, attr, True)

# 4. the ivy: its own mesh in world space, one plain material with the card's colour and alpha
ivy_me = ivy.data.copy()
ivy_me.transform(ivy.matrix_world)
ivy_me.materials.clear()
for name in [a.name for a in ivy_me.attributes if not a.is_internal and not a.name.startswith('.')
             and a.name not in ('position', 'sharp_face', 'sharp_edge', 'custom_normal', 'UVMap')]:
    if name in ivy_me.attributes:
        ivy_me.attributes.remove(ivy_me.attributes[name])
ivy_src = next(n.image for n in bpy.data.materials['M_recon_ivy'].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image)
ivy_src.colorspace_settings.name = 'sRGB'


def ivy_material(name, px):
    im = ivy_src.copy()
    im.name = name
    if px != ivy_src.size[0]:
        im.scale(px, px)
    im.pack()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    mnt = m.node_tree
    mb = next(n for n in mnt.nodes if n.type == 'BSDF_PRINCIPLED')
    t = mnt.nodes.new('ShaderNodeTexImage')
    t.image = im
    mnt.links.new(t.outputs['Color'], mb.inputs['Base Color'])
    mnt.links.new(t.outputs['Alpha'], mb.inputs['Alpha'])
    mb.inputs['Roughness'].default_value = 1.0
    m.blend_method = 'CLIP'  # glTF alphaMode MASK; checked in the exported JSON
    if hasattr(m, 'alpha_threshold'):
        m.alpha_threshold = 0.5
    return m


ivy_ob = bpy.data.objects.new('great_tree_ivy', ivy_me)
out_col.objects.link(ivy_ob)

# 5. foot on z = 0, x and y as the scene has them; every variant is exported from here
lo_z = min(v.co.z for v in target.data.vertices)
shift = Matrix.Translation(Vector((0, 0, -lo_z)))
target.data.transform(shift)
ivy_me.transform(shift)
target.data.update()
ivy_me.update()
hi = Vector((max(v.co.x for v in target.data.vertices), max(v.co.y for v in target.data.vertices), max(v.co.z for v in target.data.vertices)))
lo = Vector((min(v.co.x for v in target.data.vertices), min(v.co.y for v in target.data.vertices), 0.0))
base_me = target.data.copy()
out_dir = os.path.dirname(os.path.abspath(OUT))
stem = os.path.splitext(os.path.basename(OUT))[0]


def patch_alpha_mask(path):
    """Blender 5 writes the ivy card as alphaMode BLEND whatever blend_method says: make it a cutout (MASK)."""
    b = open(path, 'rb').read()
    jl = struct.unpack_from('<I', b, 12)[0]
    j = json.loads(b[20:20 + jl].decode('utf-8'))
    for m in j['materials']:
        if 'ivy_leaf' in m.get('name', ''):
            m['alphaMode'] = 'MASK'
            m['alphaCutoff'] = 0.5
    js = json.dumps(j, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    out = bytearray(b[:12]) + struct.pack('<I', len(js)) + b'JSON' + js + b[20 + jl:]
    struct.pack_into('<I', out, 8, len(out))
    open(path, 'wb').write(out)


def export(path, solid_me, solid_mat, ivy_mat):
    target.data = solid_me
    solid_me.materials.clear()
    solid_me.materials.append(solid_mat)
    ivy_me.materials.clear()
    ivy_me.materials.append(ivy_mat)
    bpy.ops.object.select_all(action='DESELECT')
    target.select_set(True)
    ivy_ob.select_set(True)
    vl.objects.active = target
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                              export_image_format='AUTO', export_materials='EXPORT', export_normals=True, export_texcoords=True)
    patch_alpha_mask(path)
    solid_me.calc_loop_triangles()
    ivy_me.calc_loop_triangles()
    return {'out': path, 'tris': len(solid_me.loop_triangles), 'ivy_tris': len(ivy_me.loop_triangles)}


result = {}
result['lod0'] = export(OUT, target.data, mat, ivy_material('great_tree_ivy_leaf', ivy_src.size[0]))
result['lod0']['size_m'] = [round(h - l, 2) for l, h in zip(lo, hi)]
result['lod0']['x_range'] = [round(lo.x, 2), round(hi.x, 2)]
result['lod0']['y_range'] = [round(lo.y, 2), round(hi.y, 2)]
log('exported lod0', **result['lod0'])
for lod, ratio, px, ivy_px in LEVELS:
    me = base_me.copy()
    target.data = me
    mod = target.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    with bpy.context.temp_override(object=target, active_object=target):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    me.validate()
    small = img.copy()
    small.name = 'great_tree_atlas_lod%d' % lod
    small.scale(px, px)
    small.pack()
    lm = bpy.data.materials.new('great_tree')
    lm.use_nodes = True
    lnt = lm.node_tree
    lb = next(n for n in lnt.nodes if n.type == 'BSDF_PRINCIPLED')
    lt = lnt.nodes.new('ShaderNodeTexImage')
    lt.image = small
    lnt.links.new(lt.outputs['Color'], lb.inputs['Base Color'])
    lb.inputs['Roughness'].default_value = 1.0
    path = os.path.join(out_dir, '%s_lod%d.glb' % (stem, lod))
    result['lod%d' % lod] = export(path, me, lm, ivy_material('great_tree_ivy_leaf_lod%d' % lod, ivy_px))
    log('exported lod%d' % lod, **result['lod%d' % lod])
print('@@RESULT@@' + json.dumps(result), flush=True)
