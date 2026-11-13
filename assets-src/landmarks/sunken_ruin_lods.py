# assets-src/landmarks/sunken_ruin_lods.py — LOD1 and LOD2 of the Sunken ruin, decimated in Blender
#
# The play baker's own LODs (gltf-transform simplify) can't reduce this model: its stones are flat-shaded and every facet is
# its own UV island, so no vertex is shared and the simplifier has nothing to collapse (lod1/lod2 came out as big as lod0).
# Blender's collapse decimator keeps the UV seams and the baked atlas still fits, so the LODs are made here and baked with
# --no-lod. Pipeline (after sunken_ruin_build.py and the lod0 bake):
#   1. gltf-transform ktxdecompress public/models/landmarks/sunken_ruin.glb <tmp>/lod0_png.glb
#   2. blender -b --factory-startup --python this file -- <tmp>/lod0_png.glb assets-src/landmarks/sunken_ruin_atlas.png public/models/landmarks
#        -> sunken_ruin_lod1.gltf (35 % of the triangles, 1024 atlas) and sunken_ruin_lod2.gltf (10 %, 512 atlas)
#   3. node scripts/assets/bake-play-props.mjs --one public/models/landmarks/sunken_ruin_lod1.gltf --no-lod   (and _lod2)
# Each LOD has one mesh and one material, like lod0 (the play instancing needs aligned primitive counts).

import json
import os
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:]
SRC, ATLAS, OUT_DIR = args[0], args[1], args[2]
LEVELS = ((1, 0.35, 1024), (2, 0.10, 512))

bpy.ops.wm.read_homefile(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ob = next(o for o in bpy.context.scene.objects if o.type == 'MESH')
base = ob.data.copy()
atlas = bpy.data.images.load(ATLAS)
result = {}
for lod, ratio, px in LEVELS:
    me = base.copy()
    ob.data = me
    mod = ob.modifiers.new('decimate', 'DECIMATE')
    mod.decimate_type = 'COLLAPSE'
    mod.ratio = ratio
    with bpy.context.temp_override(object=ob, active_object=ob):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    img = atlas.copy()
    img.scale(px, px)
    img.filepath_raw = os.path.join(OUT_DIR, 'sunken_ruin_lod%d_atlas.png' % lod)
    img.file_format = 'PNG'
    img.save()
    mat = bpy.data.materials.new('sunken_ruin')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 1.0
    me.materials.clear()
    me.materials.append(mat)
    ob.name = 'sunken_ruin'
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    out = os.path.join(OUT_DIR, 'sunken_ruin_lod%d.gltf' % lod)
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLTF_SEPARATE', use_selection=True, export_yup=True,
                              export_image_format='AUTO', export_materials='EXPORT', export_normals=True, export_texcoords=True)
    me.calc_loop_triangles()
    result['lod%d' % lod] = {'out': out, 'tris': len(me.loop_triangles)}
print('@@RESULT@@' + json.dumps(result), flush=True)
