# assets-src/landmarks/sunken_temple_build.py — the Sunken temple landmark, assembled from the "Temple ruins asset pack"
#
# Source: Environment_Asset_Pack.fbx (73 modular pieces: walls, archways, pillars, stairs, bridge arches, rocks, statues,
# grass and leaf cards, four trees; its materials come from the pack's PBR maps). The FBX is in centimetres at a 25 unit
# grid; at SCALE the grid is 2.5 m (a pillar 2.5 m, a tall wall 5 m, a bridge arch 5 m long). The game's prop material reads
# one base colour map (and its alpha), so the maps are folded first by sunken_temple_textures.mjs.
# The pack ("temple-ruins-asset-pack.zip", Environment_Asset_Pack.fbx + textures/, unzipped anywhere and passed as <pack dir>)
# carries no license file: check it before committing the pack, the folded maps in sunken_temple_tex/ or the baked GLBs.
# Pipeline (<tex dir> must be an ABSOLUTE path):
#   1. node assets-src/landmarks/sunken_temple_textures.mjs <pack dir> [tex dir]
#   2. the shipped model (the 'base' layout with its tree, grass and leaf cards):
#        blender -b --factory-startup --python assets-src/landmarks/sunken_temple_build.py -- <pack dir> <tex dir> <out.glb>
#          --plants [--variant base] [--blend <file.blend>] [--views <prefix>]
#        -> <out.glb> (every piece joined into one mesh with one primitive per material: stone1, stone2, wood_bark, leaves,
#           grass_plant), the temple as a blend, preview renders of the temple
#   2b. the layouts to choose from (not wired into the game, plant-free: base, collapsed, hall, shrine, drowned):
#        blender -b --factory-startup --python assets-src/landmarks/sunken_temple_build.py -- <pack dir> <tex dir>
#          [--variant all|<name>] [--blend assets-src/landmarks/sunken_temple_variants.blend] [--views <prefix>]
#        -> every variant side by side (GAP apart along x) as a collection of separate pieces, one 'ground_ref' collection
#           (the water level), a FLOATING line per variant (pieces not resting on stone or in the ground), per variant renders <prefix>_<name>_front|side|top|back.png and
#           <prefix>_overview.png. Add --plants to put the plants back. To ship one: build it with <out.glb> as in step 2.
#      --sheet <pieces.png> [--only-sheet] makes contact sheets of the pack's pieces.
#   3. node scripts/assets/bake-play-props.mjs --one public/models/landmarks/sunken_ruin.glb   (KTX2 + LOD chain)
# The front of the temple (Blender -Y, where the stairs and the bridge are) becomes glTF +Z, the facing of a landmark at
# rotY 0. Units are metres, the model's lowest point sits on z = 0 and its bounding box is centred on x, y.

import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
PACK, TEX = argv[0], argv[1]
OUT = argv[2] if len(argv) > 2 and not argv[2].startswith('--') else None  # the glb of ONE variant, else the variants blend


def opt(name):
    return argv[argv.index(name) + 1] if name in argv else None


SCALE = 10.0  # FBX centimetres at 0.01 -> temple metres
MATERIALS = {  # the pack's material -> (name in the game, base colour map, cutout)
    'M_Stone1': ('stone1', 'stone1.png', False),
    'M_Stone2': ('stone2', 'stone2.png', False),
    'M_Tree_Wood': ('wood_bark', 'wood.png', False),
    'M_Leaves': ('leaves', 'leaves.png', True),
    'M_Grass': ('grass_plant', 'grass.png', True),
}

# the stone repainted toward the game's look by sunken_temple_grade.mjs (hall_stone1.png ...): --graded, and always for 'ruin'
GRADED = '--graded' in argv or opt('--variant') == 'ruin'

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def make_materials():
    made = {}
    for src, (name, file, cutout) in MATERIALS.items():
        file = 'hall_' + file if GRADED and file.startswith('stone') else file
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        nt.nodes.clear()
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.inputs['Roughness'].default_value = 1.0
        img = nt.nodes.new('ShaderNodeTexImage')
        img.image = bpy.data.images.load(os.path.join(TEX, file), check_existing=True)
        img.image.alpha_mode = 'STRAIGHT' if cutout else 'NONE'
        nt.links.new(img.outputs['Color'], bsdf.inputs['Base Color'])
        if cutout:
            nt.links.new(img.outputs['Alpha'], bsdf.inputs['Alpha'])
            m.surface_render_method = 'DITHERED'
        nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
        m.use_backface_culling = False
        made[src] = m
    return made


def load_pieces(mats):
    """name -> mesh, each re-pivoted to its bottom centre at SCALE, with the game's materials."""
    bpy.ops.import_scene.fbx(filepath=os.path.join(PACK, 'source', 'Environment_Asset_Pack.fbx'))
    pieces = {}
    for o in [o for o in scene.objects if o.type == 'MESH']:
        mesh = o.data.copy()
        mesh.transform(Matrix.Scale(SCALE, 4) @ o.matrix_world)
        mesh.update()
        zs = [v.co for v in mesh.vertices]
        lo = Vector((min(c.x for c in zs), min(c.y for c in zs), min(c.z for c in zs)))
        hi = Vector((max(c.x for c in zs), max(c.y for c in zs), max(c.z for c in zs)))
        mesh.transform(Matrix.Translation(Vector(((lo.x + hi.x) / -2, (lo.y + hi.y) / -2, -lo.z))))
        mesh.name = o.name
        for i, slot in enumerate(o.data.materials):
            mesh.materials[i] = mats[slot.name.split('.')[0]]
        pieces[o.name] = mesh
    for o in list(scene.objects):
        bpy.data.objects.remove(o)
    return pieces


def decimated(mesh, ratio):
    """A copy of `mesh` with about `ratio` of its triangles (the pack's statues and trees are 24k-29k)."""
    ob = bpy.data.objects.new('tmp', mesh)
    scene.collection.objects.link(ob)
    mod = ob.modifiers.new('d', 'DECIMATE')
    mod.ratio = ratio
    copy = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    copy.name = mesh.name + '_d'
    bpy.data.objects.remove(ob)
    return copy


def sheet(pieces, path):
    """Two contact sheets (stone pieces, nature) of the pack at temple scale, for choosing pieces."""
    groups = {
        'stone': [n for n in pieces if n.split('_')[0] not in ('Leaves', 'Grass', 'Tree') and not n.startswith(('Leaves', 'Grass', 'Tree'))],
        'nature': [n for n in pieces if n.startswith(('Leaves', 'Grass', 'Tree'))],
    }
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'FLAT'
    sc.display.shading.color_type = 'TEXTURE'
    sc.render.resolution_x, sc.render.resolution_y = 1800, 1100
    w = bpy.data.worlds.new('w')
    w.color = (0.5, 0.56, 0.62)
    sc.world = w
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.clip_end = 1000
    for key, names in groups.items():
        objs, x = [], 0.0
        cols = 7 if key == 'stone' else 6
        row, rowh, xs = 0, 0.0, 0.0
        for k, n in enumerate(sorted(names)):
            ob = bpy.data.objects.new(n, pieces[n])
            sc.collection.objects.link(ob)
            d = ob.dimensions
            if k and k % cols == 0:
                row, xs, rowh = row + 1, 0.0, 0.0
            ob.location = (xs + d.x / 2, -row * (7.5 if key == 'stone' else 11), 0)
            xs += max(d.x, 2.0) + 1.2
            objs.append(ob)
        bpy.context.view_layer.update()
        pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), 0))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        ctr = (lo + hi) / 2
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = max(hi.x - lo.x, (hi.y - lo.y) * 1.65) * 1.05
        cam.location = ctr + Vector((0, -60, 70))
        cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = path.replace('.png', '_%s.png' % key)
        bpy.ops.render.render(write_still=True)
        for o in objs:
            bpy.data.objects.remove(o)


mats = make_materials()
pieces = load_pieces(mats)
if opt('--sheet'):
    sheet(pieces, opt('--sheet'))
    if '--only-sheet' in argv:
        sys.exit(0)


# ---------------------------------------------------------------------------------------------------------------------
# The temple. Metres, +Z up, the front is -Y. The plinth is a hollow box of 2.5 m wall panels under a floor of flat slabs;
# the ground (the map's water) is meant to rise to GROUND, so the lower plinth and the causeway's arches are sunk: the
# manifest's surfaceLift is -GROUND. Pieces sit at their pack heights: tall wall 5 m, pillar 2.5 / 5 m, bridge arch 2.5 m.
# A layout is one dict of VARIANTS. 'base' is the shipped model (`--plants` adds its tree, grass and leaf cards back); the
# others are plant-free alternatives, not wired into the game.
# ---------------------------------------------------------------------------------------------------------------------
GROUND = 2.0
PLINTH = 2.5  # height of the plinth panels
FLOOR = PLINTH + 0.3  # top of the floor slabs
GAP = 36.0  # distance between the variants along x in the variants blend
PLANTS = '--plants' in argv
PI = math.pi

for name in list(pieces):
    if name.startswith('Stone_Statue'):
        pieces[name] = decimated(pieces[name], 0.12)
    elif name.startswith('Tree') and PLANTS:
        pieces[name] = decimated(pieces[name], 0.4)

TW, TWB = 'Tall_Stone_Wall_Window', 'Tall_Stone_Wall_Window_Broken'
TP, TPB = 'Tall_Stone_Wall_Plain', 'Tall_Stone_Wall_Plain_Broken'
SW, SWB = 'Small_Stone_Wall_Window', 'Small_Stone_Wall_Window_Broken'
PT, PTB = 'Stone_Pillar_Tall', 'Stone_Pillar_Tall_Broken'
PB, PVB = 'Stone_Pillar_Broken', 'Stone_Pillar_Very_Broken'
DP, DPB = 'Stone_Decorative_Pillar', 'Stone_Decorative_Pillar_Broken'
DOOR, POINTED = 'Tall_Stone_Archway', 'Tall_Pointed_Stone_Archway'

# nx x ny floor modules of 2.5 m; the lists run along x (back, facade) or y (left, right), None is a gap, a pillar stands in
# for a wall; extras are (piece, x, y, height above inner_z, put() options); causeway arches are (piece, y from the front,
# height, jitter); rocks are (piece, x, y, how deep in the ground, scale)
BASE = dict(
    nx=7, ny=4, seed=11, plants=False, broken=0.3, inner_z=FLOOR, slab_z=PLINTH, snap=False, drop=(), lean={}, tidy=False, ivy=(),
    missing={(2, 3), (5, 3), (6, 0), (0, 0), (4, 2)},
    slipped={(1, 3): -0.12, (3, 3): 0.1, (5, 1): -0.08, (0, 2): 0.1},
    back=[TW, TP, TWB, TP, TPB, TW, TPB],
    left=[PT, TWB, TPB, TW], right=[PTB, TP, SWB, TWB],
    facade=[TPB, TW, SW, DOOR, TWB, TP, TPB],  # the door is the middle one
    roof='Stone_Roof_Edge',  # the pediment over the door
    porch=[PT, PTB],  # a pillar each side of the door
    nave_x=3.75, nave_y0=-2.5, nave=[[PT, PTB, DPB], [PTB, PT, PB]],  # two rows of pillars, left then right
    extras=[(PVB, -3.75, 4.0, 0.0, dict(jitter=0.3)),
            (PB, 1.0, -1.2, 0.3, dict(rz=0.5, ry=PI / 2, jitter=0.2)),  # fallen, lying on the floor
            ('Stone_Pedestal', 0.0, 3.2, 0.0, {}),
            ('Stone_Statue_PoseB', 0.0, 3.2, 1.1, dict(rz=PI)),
            ('Stone_Pot', -2.0, 3.6, 0.0, {}), ('Stone_Pot', 2.0, 3.6, 0.0, dict(rz=1.0))],
    causeway=[('Stone_Bridge_Arch', -2.5, 0.0, 0.0), ('Stone_Bridge_Arch_Very_Broken', -5.8, -0.1, 0.5)],
    reach=6.0, rubble=34,
    rocks=[('Tall_RockA', -10.2, 5.0, 1.0, 0.6), ('Tall_RockC', 10.3, 3.8, 1.2, 0.55), ('Small_RockA', -9.9, -1.5, 1.3, 0.9),
           ('Small_RockB', 10.0, -3.5, 1.2, 1.0), ('Small_RockC', -9.6, -5.8, 1.4, 0.9), ('Small_RockE', 9.6, 6.6, 1.0, 1.0),
           ('Small_RockD', -3.0, 7.4, 1.3, 1.0), ('Small_RockF', 6.2, -7.4, 1.5, 0.8), ('Tall_RockF', 2.5, 8.2, 0.6, 0.5)],
)
VARIANTS = {
    'base': BASE,
    # the same footprint, half of it fallen: a broken door, no pediment, the altar and the statue down
    'collapsed': dict(
        BASE, snap=True, seed=23, broken=0.6,
        missing={(2, 3), (5, 3), (6, 0), (0, 0), (4, 2), (1, 1), (3, 2), (6, 2), (2, 0), (0, 3)},
        slipped={(1, 3): -0.15, (3, 3): 0.12, (4, 0): -0.1, (0, 2): 0.12, (6, 3): -0.1},
        back=[TWB, TPB, None, TWB, SWB, None, TPB],
        left=[PTB, TPB, None, TWB], right=[None, TWB, SWB, PTB],
        facade=[TPB, None, SWB, 'Stone_Archway_Broken', TWB, None, TPB],
        roof=None, porch=[PB, None],
        nave=[[PTB, PVB, None], [None, PB, DPB]],
        extras=[(PTB, 1.5, -1.0, 0.3, dict(rz=0.7, ry=PI / 2, jitter=0.2)),
                ('Stone_Roof_Edge_Broken', -3.0, -2.2, 0.3, dict(rx=PI / 2, rz=0.4, jitter=0.3)),  # the pediment, fallen
                ('Stone_Pedestal_Broken', 0.0, 3.2, 0.0, {}),
                ('Stone_Pot', 2.2, 2.4, 0.4, dict(rx=PI / 2, rz=1.0, jitter=0.5))],
        causeway=[('Stone_Bridge_Arch_Broken', -2.5, 0.0, 0.0), ('Stone_Bridge_Arch_Very_Broken', -6.3, -0.2, 0.6)],
        rubble=70),
    # a long colonnaded hall, nearly whole: five pairs of tall pillars, a pointed door, pots on the altar, no statue
    'hall': dict(
        BASE, snap=True, nx=5, ny=6, seed=5, broken=0.12,
        missing={(3, 4)}, slipped={(1, 1): 0.06, (4, 2): -0.07},
        back=[TW, TP, TW, TP, TW],
        left=[PT, TW, TP, TP, TW, PT], right=[PT, TW, TP, TWB, TP, PT],
        facade=[TP, TW, POINTED, TW, TP], porch=[PT, PT],
        drop=('Stone_Brick', 'Stone_DebrisA', 'Stone_DebrisC'),  # rubble that looked loose, deleted by hand in Blender
        nave_y0=-5.0, nave=[[PT] * 5, [PT, PT, PT, PTB, PT]],
        extras=[('Stone_Pedestal', 0.0, 5.6, 0.0, {}), ('Stone_Pot', 0.0, 5.6, 1.1, {}),
                (DP, -1.8, 6.3, 0.0, dict(jitter=0.2)), (DP, 1.8, 6.3, 0.0, dict(jitter=0.2)),
                ('Stone_Pot', -5.0, 5.8, 0.0, {}), ('Stone_Pot', 5.0, 5.8, 0.0, dict(rz=1.0))],
        causeway=[('Stone_Bridge_Arch', -2.5, 0.0, 0.0), ('Stone_Bridge_Arch_Broken', -7.5, -0.05, 0.3)],
        reach=10.0, rubble=18,
        rocks=[('Tall_RockA', -8.4, 6.8, 1.0, 0.6), ('Tall_RockC', 8.5, 5.4, 1.2, 0.55), ('Small_RockA', -8.2, -1.5, 1.3, 0.9),
               ('Small_RockB', 8.2, -4.0, 1.2, 1.0), ('Small_RockC', -8.0, -7.6, 1.4, 0.9), ('Small_RockE', 8.0, 9.0, 1.0, 1.0),
               ('Small_RockD', -3.0, 10.0, 1.3, 1.0), ('Tall_RockF', 3.0, 10.6, 0.6, 0.5), ('Small_RockF', 5.0, -11.0, 1.5, 0.8)]),
    # a small chapel: three modules deep, a pointed door, one pedestal with a pot, a one arch causeway, no statue
    'shrine': dict(
        BASE, snap=True, nx=5, ny=3, seed=3, broken=0.2,
        missing={(0, 2), (4, 0)}, slipped={(2, 1): -0.1},
        back=[TPB, TW, TP, TW, TP], left=[PT, TW, TP], right=[PTB, TWB, TP],
        facade=[TP, TW, POINTED, TWB, TPB], porch=[PT, PT], nave=[[], []],
        extras=[('Stone_Pedestal', 0.0, 2.2, 0.0, {}), ('Stone_Pot', 0.0, 2.2, 1.1, {}),
                (DP, -2.0, 2.6, 0.0, dict(jitter=0.2)), (DPB, 2.0, 2.6, 0.0, dict(jitter=0.2))],
        causeway=[('Stone_Bridge_Arch', -2.5, 0.0, 0.0)],
        reach=5.0, rubble=16,
        rocks=[('Tall_RockA', -8.4, 3.2, 1.0, 0.55), ('Tall_RockC', 8.6, 2.6, 1.2, 0.5), ('Small_RockA', -8.2, -1.8, 1.3, 0.9),
               ('Small_RockB', 8.3, -2.6, 1.2, 0.9), ('Small_RockD', -2.0, 5.6, 1.3, 1.0), ('Small_RockF', 5.0, -6.2, 1.5, 0.8)]),
    # the floor is gone: the walls stand on the plinth rim round an open court, the pillars stand at ground level and a few
    # paving slabs lie flush with the water
    'drowned': dict(
        BASE, snap=True, seed=41, broken=0.4, inner_z=GROUND - 0.3, slab_z=GROUND - 0.2,
        missing={(i, j) for i in range(7) for j in range(4)} - {(1, 1), (2, 1), (5, 2), (3, 0), (6, 3)},
        slipped={(2, 1): -0.14, (5, 2): 0.1},
        back=[TW, TWB, TP, TWB, TW, TWB, TPB],
        left=[PT, TW, TWB, TPB], right=[PTB, TWB, TW, TPB],
        facade=[TP, TW, TWB, DOOR, TW, TP, TWB], roof='Stone_Roof_Edge_Broken', porch=[PT, PT],
        extras=[('Stone_Pedestal_Broken', 0.0, 3.2, 0.0, {}), ('Stone_Pot', -2.0, 3.6, 0.0, {}),
                (PB, -1.0, -1.5, 0.3, dict(rz=1.0, ry=PI / 2, jitter=0.2)),
                ('Stone_Pot', 2.4, 1.0, 0.4, dict(rx=PI / 2, rz=2.0, jitter=0.4))],
        rubble=48),
}

# the hall chosen (2026-11-18), made lopsided and more ruined: panels gone or broken at different places, three walls leaning, pillars
# down across the nave, a tipped pot, a shorter broken causeway, the rocks shifted; floating rubble is removed (tidy) and ivy grows
# thick on the shaded back and left walls and the facade, thin on the right. Graded stone textures (see GRADED).
VARIANTS['ruin'] = dict(
    VARIANTS['hall'], seed=17, broken=0.38, tidy=True, drop=(),
    missing={(3, 4), (1, 5), (4, 1)},
    slipped={(1, 1): 0.08, (4, 2): -0.1, (0, 3): 0.07, (2, 4): -0.06},
    back=[TWB, TP, None, TPB, TW],
    left=[PT, TW, TPB, None, TWB, PB], right=[PT, TWB, TP, TW, TPB, PVB],
    facade=[TPB, TW, POINTED, TWB, None], porch=[PT, PTB],
    lean={('back', 4): 0.05, ('left', 1): -0.04, ('right', 3): 0.06, ('facade', 1): 0.03},
    nave=[[PT, PTB, PT, None, PVB], [PT, None, PB, PT, PTB]],
    extras=[('Stone_Pedestal', 0.0, 5.6, 0.0, {}), ('Stone_Pot', 0.0, 5.6, 1.1, {}),
            (DP, -0.95, 6.35, 0.0, dict(jitter=0.2)), (DPB, 1.9, 6.1, 0.0, dict(jitter=0.2)),
            ('Stone_Pot', -5.0, 5.8, 0.0, {}),
            ('Stone_Pot', 4.6, 4.4, 0.4, dict(rx=PI / 2, rz=2.2, jitter=0.4)),  # tipped over
            (PTB, 1.6, -0.9, 0.3, dict(rz=-0.3, ry=PI / 2, jitter=0.2)),  # fallen across the nave
            (PB, -1.4, 3.0, 0.3, dict(rz=-0.5, ry=PI / 2, jitter=0.2)),
            ('Stone_Roof_Edge_Broken', 2.2, -3.6, 0.3, dict(rx=PI / 2, rz=0.5, jitter=0.3))],  # the pediment's twin, fallen
    causeway=[('Stone_Bridge_Arch', -2.5, 0.0, 0.0), ('Stone_Bridge_Arch_Very_Broken', -6.6, -0.1, 0.4)],
    reach=7.0, rubble=30,
    rocks=[('Tall_RockA', -8.6, 5.6, 1.0, 0.7), ('Tall_RockB', 8.9, 1.6, 1.1, 0.6), ('Small_RockA', -8.0, -2.4, 1.3, 1.0),
           ('Small_RockB', 8.3, -5.6, 1.2, 1.1), ('Tall_RockC', 5.6, 9.4, 1.2, 0.5), ('Small_RockD', -4.4, 9.6, 1.3, 1.1),
           ('Tall_RockF', 1.8, 10.4, 0.6, 0.45), ('Small_RockE', -6.2, -9.4, 1.0, 1.0), ('Small_RockF', 4.8, -9.6, 1.5, 0.9)],
    ivy=[  # back wall, inside (shaded: the most)
          (-4.6, 7.35, 0, 1, 'down', 2.4, None), (-3.9, 7.35, 0, 1, 'up', 3.0, None), (-2.9, 7.35, 0, 1, 'down', 1.5, None),
          (-1.8, 7.35, 0, 1, 'up', 2.4, None), (3.2, 7.35, 0, 1, 'down', 1.3, None), (4.5, 7.35, 0, 1, 'up', 1.9, None),
          # left wall, inside and outside (the outside climbs from the water)
          (-6.1, -3.75, -1, 0, 'down', 2.0, None), (-6.1, -1.25, -1, 0, 'up', 3.0, None), (-6.1, 3.75, -1, 0, 'up', 2.2, None),
          (-6.1, -3.75, 1, 0, 'up', 4.2, GROUND + 0.1), (-6.1, 3.9, 1, 0, 'up', 3.4, GROUND + 0.1),
          # right wall, inside (sparse)
          (6.1, -1.25, 1, 0, 'up', 1.8, None), (6.1, 1.3, 1, 0, 'down', 1.2, None),
          # facade, outside, left of the door
          (-4.6, -7.35, 0, 1, 'up', 4.4, GROUND + 0.1), (-3.0, -7.35, 0, 1, 'up', 3.4, GROUND + 0.1),
          (-5.0, -7.35, 0, 1, 'down', 1.8, None), (2.9, -7.35, 0, 1, 'up', 2.6, GROUND + 0.1),
          # nave pillars
          (-3.75, 0.0, -1, 0, 'pillar', 3.0, None), (-3.75, -5.0, -1, 0, 'pillar', 2.4, None), (3.75, 2.5, 1, 0, 'pillar', 2.0, None)],
)


def build(vname, v, ox=0.0):
    """One layout: its pieces, linked into a collection called vname and shifted ox along x."""
    nx, ny, rng = v['nx'], v['ny'], random.Random(v['seed'])
    HX, HY = nx * 1.25, ny * 1.25  # half extents
    x0, y0 = -(nx - 1) * 1.25, -(ny - 1) * 1.25  # centre of the first floor module
    zin = v['inner_z']
    col = bpy.data.collections.new(vname)
    scene.collection.children.link(col)
    placed = []

    def put(name, x, y, z=0.0, rz=0.0, s=1.0, rx=0.0, ry=0.0, sz=None, jitter=0.0):
        ob = bpy.data.objects.new('%s.%s' % (vname, name), pieces[name].copy())
        col.objects.link(ob)
        ob.location = (x + ox, y, z)
        j = lambda a: rng.uniform(-a, a) * jitter
        ob.rotation_euler = (rx + j(0.02), ry + j(0.02), rz + j(0.03))
        ob.scale = (s, s, s if sz is None else sz)
        placed.append(ob)
        return ob

    def slab(x, y, z, tilt=0.0):
        """A floor slab (a plain wall panel lying flat) with its bottom face centred on (x, y, z)."""
        return put('Small_Stone_Wall_Plain', x, y + 1.25, z + 0.15, rx=PI / 2 + tilt, jitter=1.0)

    def rim(i, j):
        """Where a wall over floor module (i, j) stands: on its slab, or with snap on the plinth rim when the slab is gone."""
        return PLINTH if v['snap'] and (i, j) in v['missing'] else FLOOR

    def wall(name, x, y, z, side=0, tilt=0.0):
        """A wall along x at (x, y), or along y when side is set (a quarter turn), leaning by tilt about its foot."""
        return put(name, x, y, z, rz=PI / 2 if side else 0.0, rx=tilt, jitter=0.4)

    # the plinth: panels on the four sides, the front centre left open for the causeway
    sides = {
        'front': [(x0 + 2.5 * k, -HY + 0.15) for k in range(nx) if k != nx // 2],
        'back': [(x0 + 2.5 * k, HY - 0.15) for k in range(nx)],
    }
    for spots in sides.values():
        for x, y in spots:
            broken = rng.random() < v['broken']
            put('Small_Stone_Wall_Plain_Broken' if broken else 'Small_Stone_Wall_Plain', x, y, 0.0, jitter=0.5)
    for sx in (-1, 1):
        for k in range(ny):
            broken = rng.random() < v['broken']
            put('Small_Stone_Wall_Plain_Broken' if broken else 'Small_Stone_Wall_Plain', sx * (HX - 0.15), y0 + 2.5 * k, 0.0,
                rz=PI / 2, jitter=0.5)

    # the floor: a few slabs are missing or have slipped
    for i in range(nx):
        for j in range(ny):
            if (i, j) in v['missing']:
                continue
            slab(x0 + 2.5 * i, y0 + 2.5 * j, v['slab_z'], tilt=v['slipped'].get((i, j), 0.0))
            if (i, j) in v['slipped']:
                placed[-1].location.z -= 0.08

    # the back wall, the side walls and the facade
    for k, n in enumerate(v['back']):
        if n:
            wall(n, x0 + 2.5 * k, HY - 0.15, rim(k, ny - 1), tilt=v['lean'].get(('back', k), 0.0))
    for sx, col_names in ((-1, v['left']), (1, v['right'])):
        for k, n in enumerate(col_names):
            if n is None:
                continue
            z = rim(0 if sx < 0 else nx - 1, k)
            if n.startswith('Stone_Pillar'):
                put(n, sx * (HX - 0.3), y0 + 2.5 * k, z, jitter=0.3)
            else:
                wall(n, sx * (HX - 0.15), y0 + 2.5 * k, z, side=1, tilt=v['lean'].get(('left' if sx < 0 else 'right', k), 0.0))
    for k, n in enumerate(v['facade']):
        if n:
            wall(n, x0 + 2.5 * k, -HY + 0.15, rim(k, 0), tilt=v['lean'].get(('facade', k), 0.0))
    if v['roof']:
        put(v['roof'], 0.0, -HY + 0.15, rim(nx // 2, 0) + 5.0)
    for sx, n in ((-1, v['porch'][0]), (1, v['porch'][1])):
        if n:
            put(n, sx * 1.55, -HY - 0.15, rim(nx // 2, 0), jitter=0.3)

    # the nave: two rows of pillars, then the altar, fallen stone and pots
    for sx, names in ((-1, v['nave'][0]), (1, v['nave'][1])):
        for k, n in enumerate(names):
            if n:
                put(n, sx * v['nave_x'], v['nave_y0'] + 2.5 * k, zin, jitter=0.3)
    for n, x, y, dz, kw in v['extras']:
        put(n, x, y, zin + dz, **kw)

    # the causeway: arches at floor height running out from the door
    for n, dy, dz, jit in v['causeway']:
        put(n, 0.0, -HY + dy, FLOOR - 2.5 + dz, rz=PI / 2, jitter=jit)

    # rubble: debris and bricks at the foot of broken walls and over the floor
    for k in range(v['rubble']):
        zone = rng.random()
        if zone < 0.5:  # on the floor
            x, y, z = rng.uniform(-(HX - 1.25), HX - 1.25), rng.uniform(-(HY - 1.0), HY - 1.0), zin
        elif zone < 0.8:  # round the plinth, in the water
            a = rng.uniform(0, 2 * math.pi)
            x, y, z = math.cos(a) * (HX + 1.5), math.sin(a) * (HY + 1.5), GROUND - 0.3
        else:  # on the causeway
            x, y, z = rng.uniform(-1.0, 1.0), rng.uniform(-HY - v['reach'], -HY - 0.5), FLOOR
        put(rng.choice(['Stone_DebrisA', 'Stone_DebrisB', 'Stone_DebrisC', 'Stone_Brick', 'Stone_Brick_Broken']), x, y, z,
            rz=rng.uniform(0, 6.28), s=rng.uniform(0.7, 1.3), jitter=0.8)

    # rocks round the plinth, half in the water
    for n, x, y, z, s in v['rocks']:
        put(n, x, y, max(0.0, GROUND - z - 0.4), rz=rng.uniform(0, 6.28), s=s)

    if v['plants']:  # a tree in the back right corner, grass on the floor and along the plinth, leaf cards on the walls
        put('TreeC', 5.6, 2.2, FLOOR, rz=2.0, s=0.9)
        for k in range(46):
            if rng.random() < 0.55:
                x, y, z = rng.uniform(-8, 8), rng.uniform(-4.2, 4.2), FLOOR
            else:
                a = rng.uniform(0, 2 * math.pi)
                x, y, z = math.cos(a) * (HX + 0.6), math.sin(a) * (HY + 0.6), GROUND - 0.15
            put(rng.choice(['GrassA', 'GrassB', 'GrassC', 'GrassD', 'GrassE', 'GrassF']), x, y, z, rz=rng.uniform(0, 6.28),
                s=rng.uniform(0.9, 1.6), jitter=1.0)
        for k in range(14):
            side = rng.choice([-1, 1])
            put(rng.choice(['LeavesA', 'LeavesB', 'LeavesC']), side * rng.uniform(2, 8), HY - 0.5 + rng.uniform(-0.1, 0.1),
                FLOOR + rng.uniform(0.2, 3.0), rz=rng.uniform(-0.4, 0.4), rx=PI / 2 - 0.3, s=rng.uniform(1.0, 2.0))
    gone = {'%s.%s' % (vname, n) for n in v['drop']}  # removed after placing, so the random stream and the names stay put
    for ob in [o for o in placed if o.name in gone]:
        placed.remove(ob)
        bpy.data.objects.remove(ob)
    if v['tidy']:  # rubble that hangs in the air goes; a structural piece that does is reported by the FLOATING line
        loose = {n for n, _ in floaters(placed) if n.split('.', 1)[1].startswith(('Stone_Debris', 'Stone_Brick'))}
        for ob in [o for o in placed if o.name in loose]:
            placed.remove(ob)
            bpy.data.objects.remove(ob)
    if v['ivy']:
        placed.append(grow_ivy(vname, v, ox, list(placed), col))
    return placed


# ---------------------------------------------------------------------------------------------------------------------
# Ivy: the old model-loop temple's recipe (assets-src/model-loop/temple_ruin/build/ivy.py, 'love the new ivy'): every vine is traced
# across the real faces (rays against the pieces) so its stem and leaves lie on the stone, wrap pillars and drape from crests.
# The leaf outline is the old one cut to 8 points; stem and leaves share one small texture (hall_ivy.png, sunken_temple_grade.mjs).
# ---------------------------------------------------------------------------------------------------------------------
LEAF8 = [(0.0, 0.0), (0.2, -0.62), (0.5, -0.2), (0.82, -0.08), (1.0, 0.0), (0.82, 0.08), (0.5, 0.2), (0.2, 0.62)]
STEM_UV = (0.2, 0.5)


def ivy_material():
    m = bpy.data.materials.get('ivy')
    if m:
        return m
    m = bpy.data.materials.new('ivy')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Roughness'].default_value = 1.0
    img = nt.nodes.new('ShaderNodeTexImage')
    img.image = bpy.data.images.load(os.path.join(TEX, 'hall_ivy.png'), check_existing=True)
    img.image.alpha_mode = 'NONE'
    nt.links.new(img.outputs['Color'], bsdf.inputs['Base Color'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    m.use_backface_culling = False
    return m


def ivy_targets(objs):
    """(object, world box centre, radius) for every piece the ivy can grow on."""
    out = []
    for ob in objs:
        corners = [ob.matrix_world @ Vector(v) for v in ob.bound_box]
        c = sum(corners, Vector()) / 8
        out.append((ob, c, max((q - c).length for q in corners)))
    return out


def surface_hit(targets, p, d, reach=1.0):
    """Nearest hit of a ray from p - d * reach along d on the targets (ivy_targets): (point, normal) or None. Pieces whose
    bounding sphere the ray misses by more than 0.3 m are skipped (the old temple's blocks were small; these panels are 5 m)."""
    o = p - d * reach
    best = None
    for ob, c, r in targets:
        off = c - p
        if (off - d * off.dot(d)).length > r + 0.3:
            continue
        mi = ob.matrix_world.inverted()
        ok, loc, nrm, _ = ob.ray_cast(mi @ o, (mi.to_3x3() @ d).normalized(), distance=reach * 4)
        if ok:
            w = ob.matrix_world @ loc
            dist = (w - o).length
            if best is None or dist < best[0]:
                best = (dist, w, (mi.to_3x3().transposed() @ nrm).normalized())
    return None if best is None else (best[1], best[2])


def tube(bm, pts, radii, sides=3):
    """A tapered tube through pts, one radius per point; its faces are returned."""
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
        c = d.cross(a)
        rings.append([bm.verts.new(p + (a * math.cos(math.tau * k / sides) + c * math.sin(math.tau * k / sides)) * radii[i]) for k in range(sides)])
    faces = []
    for i in range(len(rings) - 1):
        for k in range(sides):
            j = (k + 1) % sides
            faces.append(bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][j], rings[i][j])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces


class Ivy:
    """Frame of a face: O origin, U horizontal tangent, Z up, D direction into the surface (the vine grows on the side the
    rays start from)."""

    def __init__(self, seed):
        self.rnd = random.Random(seed)
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.verify()

    def _trace(self, objs, O, U, Z, D, u, v, heading, length, step=0.08, wander=0.3, hug=0.0, centre=None):
        """Points (P, n) of a stem growing from (u, v) of the face, heading = angle from straight up (0 up, pi down). `hug` pulls it
        back to its start column (pillar corners); a ray that misses is retried straight up/down from the last good spot, and the
        stem ends after three misses."""
        pts, u0, up = [], u, math.cos(heading) > 0
        last, misses = (u, v), 0
        for _ in range(int(length / step)):
            hit = surface_hit(objs, O + U * u + Z * v, D)
            if hit is None:
                misses += 1
                if misses > 2:
                    break
                u, v = last
                if centre is not None:  # slid off a narrower shaft: nudge towards its middle
                    u += math.copysign(min(0.05, abs(u - centre)), centre - u)
                heading = 0.0 if up else math.pi
            else:
                pts.append(hit)
                last = (u, v)
            heading += self.rnd.gauss(0.0, wander) - 0.12 * math.sin(heading) - hug * (u - u0) * (1 if math.cos(heading) > 0 else -1)
            u += math.sin(heading) * step
            v += math.cos(heading) * step
        return pts

    def vine(self, objs, O, U, Z, D, u, v, up=True, length=1.5, wander=0.3, leaf=0.15, branches=2, hug=0.0, centre=None):
        main = self._trace(objs, O, U, Z, D, u, v, 0.0 if up else math.pi, length, wander=wander, hug=hug, centre=centre)
        paths = [main]
        for _ in range(branches):
            if len(main) < 8:
                break
            i = int(len(main) * self.rnd.uniform(0.3, 0.7))
            side = self.rnd.choice((-1, 1))
            uu = (main[i][0] - O).dot(U)
            vv = (main[i][0] - O).dot(Z)
            paths.append([main[i]] + self._trace(objs, O, U, Z, D, uu, vv, (0.0 if up else math.pi) + side * self.rnd.uniform(0.7, 1.1),
                                                 length * self.rnd.uniform(0.25, 0.4), wander=wander, hug=hug * 0.3, centre=centre)[1:])
        for pts in paths:
            if len(pts) > 2:
                self._build(pts, leaf)

    def _build(self, pts, leaf):
        bm, rnd, uv = self.bm, self.rnd, self.uv
        stem = [p + n * 0.01 for p, n in pts]
        for f in tube(bm, stem, [0.011 - 0.005 * i / len(stem) for i in range(len(stem))], sides=3):
            for lp in f.loops:
                lp[uv].uv = STEM_UV
        for i in range(1, len(pts) - 1):
            p, n = pts[i]
            t = pts[i + 1][0] - pts[i - 1][0]
            t = (t - n * t.dot(n)).normalized()
            sgn = 1 if i % 2 else -1
            a = rnd.uniform(0.5, 1.1)
            out = (t * math.cos(a) + n.cross(t) * math.sin(a) * sgn).normalized()
            perp = n.cross(out)
            s = leaf * rnd.uniform(0.75, 1.25) * (0.7 + 0.5 * i / len(pts))
            lift = rnd.uniform(0.15, 0.5)
            base = p + n * 0.012
            verts = [bm.verts.new(base + out * (x * s + 0.02) + perp * (y * s * 0.75) + n * (0.012 + 0.1 * s * (1 - abs(y)) * 0.5 + x * s * lift * 0.35)) for x, y in LEAF8]
            cen = bm.verts.new(base + out * (0.4 * s + 0.02) + n * (0.012 + 0.07 * s))
            for k in range(len(verts)):
                j = (k + 1) % len(verts)
                f = bm.faces.new((cen, verts[k], verts[j]))
                f.smooth = False
                for lp, (x, y) in zip(f.loops, ((0.4, 0.0), LEAF8[k], LEAF8[j])):
                    lp[uv].uv = (0.45 + 0.5 * x, 0.5 + 0.55 * y)

    def finish(self, name, col):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        ob = bpy.data.objects.new(name, me)
        for f in me.polygons:
            f.use_smooth = False
        me.materials.append(ivy_material())
        col.objects.link(ob)
        return ob


def grow_ivy(vname, v, ox, objs, col):
    """The variant's ivy list -> one mesh <vname>.ivy. An entry is (x, y, dx, dy, mode, length, z0): a spot on a wall's centre line,
    the direction into the wall from the side the ivy grows on, 'up' (from z0, or the floor in front of the spot, climbing),
    'down' (from the wall's crest, draping) or 'pillar' (up, hugging a shaft)."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    iv, Z = Ivy(81), Vector((0, 0, 1))
    objs = ivy_targets(objs)

    def top(x, y):
        hit, loc, *_ = scene.ray_cast(dg, Vector((x + ox, y, 14.0)), Vector((0, 0, -1)))
        return loc.z if hit else None

    for x, y, dx, dy, mode, length, z0 in v['ivy']:
        D = Vector((dx, dy, 0.0))
        U = D.cross(Z)
        if mode == 'down':
            crest = top(x, y)
            if crest is not None:  # no wall left at the spot: no vine
                iv.vine(objs, Vector((x + ox, y, crest - 0.06)), U, Z, D, 0.0, 0.0, up=False, length=length, leaf=0.2)
        else:
            f = z0 if z0 is not None else (top(x - dx * 0.6, y - dy * 0.6) or FLOOR)
            pillar = mode == 'pillar'
            iv.vine(objs, Vector((x + ox, y, f)), U, Z, D, 0.0, 0.05, up=True, length=length, leaf=0.2, hug=0.5 if pillar else 0.0,
                    centre=0.0 if pillar else None)
    return iv.finish(vname + '.ivy', col)


def bounds(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def floaters(objs, tol=0.03):
    """The pieces that hang in the air: [(name, share of the lowest points held)]. A point is held when it is in the ground
    (z <= GROUND) or within tol of a piece that is held itself; a piece is held when half its lowest points are."""
    from mathutils.bvhtree import BVHTree
    objs = [o for o in objs if not o.name.endswith('.ivy')]
    bpy.context.view_layer.update()
    low, tree, box = {}, {}, {}
    for ob in objs:
        pts = [ob.matrix_world @ v.co for v in ob.data.vertices]
        zmin = min(p.z for p in pts)
        pick = [p for p in pts if p.z < zmin + 0.1]
        low[ob] = pick[::max(1, len(pick) // 40)]
        ob.data.calc_loop_triangles()
        tree[ob] = BVHTree.FromPolygons(pts, [tuple(t.vertices) for t in ob.data.loop_triangles])
        box[ob] = (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
                   Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))
    near = {a: [b for b in objs if b is not a and all(box[b][0][i] - tol <= box[a][1][i] and box[a][0][i] - tol <= box[b][1][i]
                                                         for i in range(3))] for a in objs}
    share = {ob: sum(p.z <= GROUND + tol for p in low[ob]) / len(low[ob]) for ob in objs}
    held = {ob for ob in objs if share[ob] >= 0.5}
    grew = True
    while grew:
        grew = False
        for ob in objs:
            if ob in held:
                continue
            on = [b for b in near[ob] if b in held]
            share[ob] = sum(p.z <= GROUND + tol or any(tree[b].find_nearest(p, tol) for b in on) for p in low[ob]) / len(low[ob])
            if share[ob] >= 0.5:
                held.add(ob)
                grew = True
    return [(ob.name, round(share[ob], 2)) for ob in objs if ob not in held]


def studio():
    """Workbench render setup with a camera: (scene, camera)."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'TEXTURE'
    w = bpy.data.worlds.new('w2')
    w.color = (0.5, 0.56, 0.62)
    sc.world = w
    cam = bpy.data.objects.new('cam2', bpy.data.cameras.new('cam2'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.clip_end = 2000
    return sc, cam


def shoot(sc, cam, ctr, az, el, dist, path):
    a, e = math.radians(az), math.radians(el)
    cam.location = ctr + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (ctr - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def views(sc, cam, prefix, ctr, dist):
    """Preview renders of one temple: front three quarters, the side, from above, the back."""
    sc.render.resolution_x, sc.render.resolution_y = 1500, 1000
    for key, (az, el) in {'front': (25, 14), 'side': (100, 10), 'top': (20, 62), 'back': (200, 18)}.items():
        shoot(sc, cam, ctr, az, el, dist, prefix + '_%s.png' % key)


def solo(only, names):
    """Show one variant's collection, or all of them when only is None."""
    for lc in bpy.context.view_layer.layer_collection.children:
        lc.exclude = only is not None and lc.name in names and lc.name != only


def finish(save_blend):
    if save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=save_blend)
        bpy.ops.file.make_paths_relative()
        bpy.ops.wm.save_mainfile()


which = opt('--variant') or ('base' if OUT else 'all')
names = list(VARIANTS) if which == 'all' else [which]
if OUT and len(names) != 1:
    sys.exit('an output glb needs one --variant')

if OUT:
    # ---- one variant joined into one mesh, one primitive per material, foot on z = 0 and centred on x, y; exported
    placed = build(names[0], dict(VARIANTS[names[0]], plants=PLANTS), 0.0)
    print('FLOATING', names[0], floaters(placed))
    for ob in placed:  # flat leaf triangles share no vertices, so the bake's simplify could not touch the ivy: smooth it for the game
        if ob.name.endswith('.ivy'):
            for f in ob.data.polygons:
                f.use_smooth = True
    bpy.context.view_layer.update()
    for ob in bpy.context.view_layer.objects:
        ob.select_set(False)
    for ob in placed:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = placed[0]
    bpy.ops.object.join()
    temple = bpy.context.view_layer.objects.active
    temple.name = 'sunken_temple'
    temple.data.name = 'sunken_temple'
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lo, hi = bounds([temple])
    temple.data.transform(Matrix.Translation(Vector(((lo.x + hi.x) / -2, (lo.y + hi.y) / -2, -lo.z))))
    temple.data.update()
    print('TEMPLE', {'size': [round(hi[i] - lo[i], 2) for i in range(3)],
                     'tris': sum(len(p.vertices) - 2 for p in temple.data.polygons), 'ground': GROUND - lo.z})
    if opt('--views'):
        sc, cam = studio()
        views(sc, cam, opt('--views'), Vector((0, 0, 4)), 45)
    finish(opt('--blend'))
    for ob in bpy.context.view_layer.objects:
        ob.select_set(ob == temple)
    bpy.context.view_layer.objects.active = temple
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_materials='EXPORT', export_image_format='AUTO')
else:
    # ---- the variants side by side, every piece a separate object in a collection per variant
    sizes = {}
    for k, vname in enumerate(names):
        ox = (k - (len(names) - 1) / 2) * GAP
        objs = build(vname, dict(VARIANTS[vname], plants=PLANTS), ox)
        lo, hi = bounds(objs)
        tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
        sizes[vname] = (ox, max(hi.x - lo.x, hi.y - lo.y))
        print('VARIANT', vname, {'objects': len(objs), 'tris': tris, 'size': [round(hi[i] - lo[i], 1) for i in range(3)]})
        print('FLOATING', vname, floaters(objs))
    # the water level, one plane per variant in a collection of its own (on: without it the rocks and the rubble in the water
    # look like they hang in the air; delete or hide the collection when editing under it)
    ref = bpy.data.collections.new('ground_ref')
    scene.collection.children.link(ref)
    gm = bpy.data.materials.new('ground_ref')
    gm.diffuse_color = (0.16, 0.27, 0.31, 1.0)
    for vname, (ox, _) in sizes.items():
        me = bpy.data.meshes.new('ground_ref.' + vname)
        me.from_pydata([(-24, -24, 0), (24, -24, 0), (24, 24, 0), (-24, 24, 0)], [], [(0, 1, 2, 3)])
        me.materials.append(gm)
        pl = bpy.data.objects.new('ground_ref.' + vname, me)
        pl.location = (ox, 0, GROUND)
        ref.objects.link(pl)
    if opt('--views'):
        sc, cam = studio()
        for vname, (ox, span) in sizes.items():
            solo(vname, names)
            views(sc, cam, opt('--views') + '_' + vname, Vector((ox, 0, 4)), span * 2.0)
        solo(None, names)
        sc.render.resolution_x, sc.render.resolution_y = 2800, 1100
        cam.data.type = 'ORTHO'
        cam.data.ortho_scale = GAP * len(names) + 24
        shoot(sc, cam, Vector((0, 0, 2)), 0, 52, 300, opt('--views') + '_overview.png')
        bpy.data.objects.remove(cam)
    solo(None, names)
    bpy.data.orphans_purge(do_recursive=True)  # the FBX import's own materials and its (missing) pack images
    finish(opt('--blend'))
