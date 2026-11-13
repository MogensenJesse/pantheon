# assets-src/landmarks/birch_rune_build.py — step 1 of the Tree landmark model: a bind rune as an emissive ribbon
#
# The landmark tree is the shipped birch 1 (public/models/birch1/autumn_birch_web.glb) with a glowing bind rune on its
# trunk. Only the rune is made here; add_rune.mjs then merges it into the untouched birch, so the birch's meshes,
# textures and vertex colours stay as they are. Pipeline:
#   1. blender --background --python this file   (or exec it in the MCP bridge, then call build())
#        -> writes the ribbon GLB (RIBBON_OUT, default the temp folder)
#   2. node assets-src/landmarks/add_rune.mjs <ribbon.glb>   -> public/models/landmarks/birch_rune.glb
#   3. node scripts/assets/bake-play-props.mjs --one public/models/landmarks/birch_rune.glb   (KTX2 + LOD chain)
# The ribbon's material is named `rune_glow`: createMapPropNodeMaterial adds its emissive to the shaded colour,
# times the HDR bloom scale, for materials with that name only. Units: the model keeps the birch's 10.6 m.

import math
import os
import tempfile

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = globals().get('ROOT', r'D:\pantheon')
SRC = os.path.join(ROOT, 'public', 'models', 'birch1', 'autumn_birch_web.glb')
RIBBON_OUT = globals().get('RIBBON_OUT', os.path.join(tempfile.gettempdir(), 'birch_rune_ribbon.glb'))
TRUNK = 'Watertight low-poly birch trunk'

GLOW = (0.7, 0.43, 0.1)  # linear amber gold; the game multiplies it by the HDR bloom scale
THETA = -math.pi / 2  # the side of the trunk facing glTF +Z (Blender -Y)
RUNE_Z, RUNE_H, RUNE_W = 2.0, 1.2, 0.42  # centre height, height and width of the rune (m)
STROKE_M, STEP_M, LIFT_M = 0.06, 0.03, 0.015  # ribbon width, sample spacing, height over the bark
# Bind rune: a twin-bump Berkanan (the birch rune) over a Gebo cross. Strokes in a box x -0.25..0.25, y 0..1.
RUNE = [
    ((0, 0), (0, 1)),
    ((0, 1), (0.22, 0.84)), ((0.22, 0.84), (0, 0.68)), ((0, 0.68), (0.22, 0.52)), ((0.22, 0.52), (0, 0.36)),
    ((0, 1), (-0.22, 0.84)), ((-0.22, 0.84), (0, 0.68)),
    ((-0.22, 0.3), (0.22, 0)), ((0.22, 0.3), (-0.22, 0)),
]


def trunk_axis(obj):
    """The trunk's centre line below the first branches: (z samples, x, y), smoothed."""
    me = obj.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    zs, xs, ys = [], [], []
    c = np.array([0.2, 0.2])
    for z0 in np.arange(0.0, 3.5, 0.25):
        pts = co[(co[:, 2] >= z0) & (co[:, 2] < z0 + 0.25)][:, :2]
        for _ in range(4):
            sel = pts[np.hypot(pts[:, 0] - c[0], pts[:, 1] - c[1]) < 0.9]
            if len(sel):
                c = sel.mean(axis=0)
        zs.append(z0 + 0.125)
        xs.append(c[0])
        ys.append(c[1])
    k = np.ones(3) / 3.0
    pad = lambda a: np.concatenate([[a[0]], a, [a[-1]]])
    return np.array(zs), np.convolve(pad(xs), k, 'valid'), np.convolve(pad(ys), k, 'valid')


def surface_point(bvh, axis, s, h, ref_r, lift):
    """The bark point (and normal) `s` m along and `h` m up from the rune's centre, lifted off the surface."""
    theta = THETA + s / ref_r
    z = RUNE_Z + h
    cx, cy = float(np.interp(z, axis[0], axis[1])), float(np.interp(z, axis[0], axis[2]))
    d = Vector((math.cos(theta), math.sin(theta), 0.0))
    hit = bvh.ray_cast(Vector((cx, cy, z)) + d * 3.0, -d, 6.0)  # from outside in
    return None if hit[0] is None else (hit[0] + hit[1] * lift, hit[1], math.hypot(hit[0].x - cx, hit[0].y - cy))


def ribbons(bvh, axis):
    ref_r = surface_point(bvh, axis, 0, 0, 1.0, 0.0)[2]
    verts, faces = [], []
    for (x0, y0), (x1, y1) in RUNE:
        dx, dy = (x1 - x0) * RUNE_W / 0.5, (y1 - y0) * RUNE_H
        length = math.hypot(dx, dy)
        ux, uy = dx / length, dy / length
        e = STROKE_M * 0.5  # grow both ends by half a stroke so strokes that meet join up
        sx, sy = x0 * RUNE_W / 0.5 - ux * e, y0 * RUNE_H - uy * e
        length += 2 * e
        n = max(1, math.ceil(length / STEP_M))
        pts = [surface_point(bvh, axis, sx + ux * length * i / n, sy + uy * length * i / n - RUNE_H / 2, ref_r, LIFT_M) for i in range(n + 1)]
        if None in pts:
            continue
        base = len(verts)
        for i, (p, nrm, _) in enumerate(pts):
            a, b = pts[max(i - 1, 0)][0], pts[min(i + 1, len(pts) - 1)][0]
            side = nrm.cross((b - a).normalized()).normalized() * (STROKE_M * 0.5)
            verts += [tuple(p - side), tuple(p + side)]
            if i:
                k = base + 2 * (i - 1)
                faces.append((k, k + 1, k + 3, k + 2))
    return verts, faces, ref_r


def build():
    for o in [o for o in bpy.data.objects if o.name.startswith(('Watertight', 'Simplified', 'Autumn', 'rune_glow'))]:
        bpy.data.objects.remove(o, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for item in [b for b in block if b.users == 0]:
            block.remove(item)
    bpy.ops.import_scene.gltf(filepath=SRC)
    trunk = bpy.data.objects[TRUNK]
    axis = trunk_axis(trunk)
    bvh = BVHTree.FromObject(trunk, bpy.context.evaluated_depsgraph_get())
    verts, faces, ref_r = ribbons(bvh, axis)
    me = bpy.data.meshes.new('rune_glow')
    me.from_pydata(verts, [], faces)
    me.update()
    mat = bpy.data.materials.new('rune_glow')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0, 0, 0, 1)
    bsdf.inputs['Emission Color'].default_value = (*GLOW, 1)
    bsdf.inputs['Emission Strength'].default_value = 1.0
    me.materials.append(mat)
    rune = bpy.data.objects.new('rune_glow', me)
    bpy.context.scene.collection.objects.link(rune)
    bpy.ops.object.select_all(action='DESELECT')
    rune.select_set(True)
    bpy.context.view_layer.objects.active = rune
    bpy.ops.export_scene.gltf(filepath=RIBBON_OUT, export_format='GLB', use_selection=True, export_yup=True)
    return {'ribbon_quads': len(faces), 'trunk_radius_at_rune': round(ref_r, 3), 'out': RIBBON_OUT}
