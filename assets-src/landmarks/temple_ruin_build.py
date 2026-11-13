# assets-src/landmarks/temple_ruin_build.py — the Temple ruin landmark model, exported from the artist's blend
#
# Source: medival_ruins.blend, one object `Ruin_Retopolo` (2126 tris): a stepped round platform with a checkered altar and
# two curved broken pillars behind it, painted on one 2048 diffuse atlas. The blend keeps the object turned and scaled
# (0.3) with the mesh off its origin, so the transform is baked into the mesh here and the GLB root is the identity.
# Pipeline:
#   1. blender --background --disable-autoexec <medival_ruins.blend> --python this file -- <out.glb>
#        -> public/models/landmarks/temple_ruin.glb (PNG texture)
#   2. node scripts/assets/bake-play-props.mjs --one public/models/landmarks/temple_ruin.glb   (KTX2 + LOD chain)
# The game's prop material reads only the base colour map (it lights the props itself), so the normal and roughness
# maps of the blend are left out; the material is rebuilt with the diffuse alone. The front (the side the pillars
# open to, Blender -Y) becomes glTF +Z, the facing of a landmark at rotY 0. Units stay metres as the blend has them
# (about 5.1 x 2.7 x 4.9 m); the manifest's targetHeightM sizes it in the game.

import sys

import bpy
from mathutils import Matrix, Vector

OUT = sys.argv[sys.argv.index('--') + 1]
OBJECT = 'Ruin_Retopolo'
DIFFUSE = 'Ruin_Diffuse.png.002'

ob = bpy.data.objects[OBJECT]
me = ob.data
me.transform(ob.matrix_world)
ob.parent = None
ob.matrix_world = Matrix.Identity(4)

# Foot on z = 0, centred on its bounding box (the game's registry recentres the same way).
lo = Vector((min(v.co.x for v in me.vertices), min(v.co.y for v in me.vertices), min(v.co.z for v in me.vertices)))
hi = Vector((max(v.co.x for v in me.vertices), max(v.co.y for v in me.vertices), max(v.co.z for v in me.vertices)))
me.transform(Matrix.Translation(Vector((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z))))
me.update()

mat = bpy.data.materials.new('ruin_stone')
mat.use_nodes = True
tree = mat.node_tree
bsdf = tree.nodes['Principled BSDF']
tex = tree.nodes.new('ShaderNodeTexImage')
tex.image = bpy.data.images[DIFFUSE]
tree.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 1.0
bsdf.inputs['Metallic'].default_value = 0.0
me.materials.clear()
me.materials.append(mat)
ob.name = 'temple_ruin'

bpy.ops.object.select_all(action='DESELECT')
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=False,
    export_image_format='AUTO',
    export_materials='EXPORT',
    export_normals=True,
    export_texcoords=True,
    export_cameras=False,
    export_lights=False,
)
print('wrote', OUT, 'size', tuple(round(hi[i] - lo[i], 3) for i in range(3)))
