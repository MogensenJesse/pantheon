# assets-src/village/village_atlas.py — the shared village trim sheet: painted with numpy, plus the UV pass.
# Run inside Blender (exec), after temple_build.py. Each surface type is one horizontal strip that spans the
# full texture width, so U repeats seamlessly (wrapS = repeat) while V stays inside the strip.
import math
import random

import bmesh
import bpy
import numpy as np

W = H = 1024
PAD = 4
# name: strip height (px), metres per full texture width (U), metres per strip height (V; None = fit the face)
STRIP_SPECS = [
    ('wall', 224, 4.0, None),
    ('shingle', 128, 3.2, None),
    ('stone', 112, 4.0, 0.5),
    ('trim', 56, 2.0, None),
    ('beam', 56, 2.0, None),
    ('carve', 160, 6.0, None),
    ('rune', 56, 2.4, None),
    ('dark', 32, 1.5, None),
    ('roofboard', 56, 2.4, None),
]
# Faces whose texture runs along their longest edge (boards, beams, trim) instead of being projected.
LONG = ('trim', 'beam', 'roofboard', 'inlay')


def noise(h, w, cx, cy, rng):
    """Smooth value noise, cell cx by cy pixels, seamless along x (w must be a multiple of cx)."""
    gx, gy = w // cx, int(math.ceil(h / cy)) + 2
    grid = rng.random((gy, gx))
    ys, xs = np.arange(h) / cy, np.arange(w) / cx
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    fy, fx = ys - y0, xs - x0
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    x1, x0 = (x0 + 1) % gx, x0 % gx
    top = grid[y0][:, x0] + (grid[y0][:, x1] - grid[y0][:, x0]) * fx
    bot = grid[y0 + 1][:, x0] + (grid[y0 + 1][:, x1] - grid[y0 + 1][:, x0]) * fx
    return top + (bot - top) * fy[:, None]


def tint(shape, colour, factor):
    return np.asarray(colour)[None, None, :] * factor[..., None]


def planks(h, rng, base=(0.55, 0.46, 0.38), boards=16):
    bw = W // boards
    col = np.arange(W) // bw
    edge = np.arange(W) % bw
    tones = 1 + (rng.random(boards) - 0.5) * 0.24
    grain = 0.55 * noise(h, W, 2, 32, rng) + 0.45 * noise(h, W, 8, 128, rng)
    img = tint(None, base, tones[col][None, :] * (0.82 + 0.34 * grain))
    img[:, (edge < 2) | (edge >= bw - 1)] = (0.10, 0.08, 0.07)
    img[:, (edge >= 2) & (edge < 4)] *= 1.18
    return img


def shingles(h, rng, base=(0.42, 0.46, 0.55), rows=4, sw=64):
    img = np.zeros((h, W, 3))
    rh = h // rows
    n = noise(h, W, 4, 4, rng)
    for r in range(rows):
        y0 = r * rh
        xs = (np.arange(W) + (sw // 2) * (r % 2)) % W
        tones = 1 + (rng.random(W // sw) - 0.5) * 0.3
        shade = 0.68 + 0.42 * (np.arange(rh) / rh)
        img[y0:y0 + rh] = tint(None, base, tones[xs // sw][None, :] * shade[:, None] * (0.9 + 0.2 * n[y0:y0 + rh]))
        img[y0:y0 + rh, (xs % sw) < 2] *= 0.35
        img[y0 + rh - 3:y0 + rh] *= 0.45
        img[y0 + rh - 5:y0 + rh - 3] *= 1.25
    return img


def stones(h, rng, base=(0.56, 0.55, 0.52), rows=2):
    img = np.zeros((h, W, 3))
    rh = h // rows
    n = 0.6 * noise(h, W, 8, 8, rng) + 0.4 * noise(h, W, 32, 32, rng)
    for r in range(rows):
        start = int(rng.integers(0, W))
        cuts = [0]
        while cuts[-1] + 260 < W:
            cuts.append(cuts[-1] + int(rng.integers(100, 190)))
        rel = (np.arange(W) - start) % W
        block = np.searchsorted(np.array(cuts), rel, side='right') - 1
        tones = 1 + (rng.random(len(cuts)) - 0.5) * 0.25
        y0 = r * rh
        img[y0:y0 + rh] = tint(None, base, tones[block][None, :] * (0.85 + 0.3 * n[y0:y0 + rh]))
        for c in cuts:
            img[y0:y0 + rh, [(start + c + d) % W for d in range(-2, 2)]] = (0.16, 0.16, 0.15)
        img[y0:y0 + 3] = (0.16, 0.16, 0.15)
    return img


def board(h, rng, base, streak=True, bevel=0.2):
    n = noise(h, W, 64, 2, rng) if streak else noise(h, W, 16, 16, rng)
    shade = np.ones(h)
    k = max(2, int(h * bevel))
    shade[:k] = 1.18
    shade[-k:] = 0.72
    return tint(None, base, shade[:, None] * (0.88 + 0.24 * n))


def carve(h, rng, slate=(0.44, 0.48, 0.54), beige=(0.80, 0.70, 0.52)):
    img = board(h, rng, slate, streak=False, bevel=0.05)
    x = np.arange(W)
    ys = np.arange(h)[:, None] / h
    n = 0.92 + 0.16 * noise(h, W, 8, 8, rng)
    for phase in (0.0, math.pi):
        centre = 0.5 + 0.27 * np.sin(2 * math.pi * x / 512 + phase)
        d = np.abs(ys - centre[None, :])
        img[(d >= 0.085) & (d < 0.115)] = (0.18, 0.18, 0.19)
        band = d < 0.085
        img[band] = np.asarray(beige) * n[band][:, None]
    for y0, y1 in ((0, 0.07), (0.93, 1.0)):
        rows = slice(int(y0 * h), int(y1 * h))
        img[rows] = np.asarray(beige) * 0.9
    return img


def rune_strip(h, rng, wood=(0.40, 0.32, 0.26), groove=(0.12, 0.17, 0.17), spacing=128):
    img = board(h, rng, wood, streak=True, bevel=0.1)
    for k in range(W // spacing):
        cx = k * spacing + spacing // 2
        img[int(h * 0.2):int(h * 0.8), cx - 2:cx + 2] = groove
        for j in range(int(h * 0.3)):
            y = int(h * 0.25) + j
            img[y, cx + j // 1 - 1:cx + j // 1 + 2] = groove
            img[int(h * 0.5) + j // 2, cx + j - 1:cx + j + 2] = groove
    return img


def dark(h, rng):
    img = board(h, rng, (0.055, 0.06, 0.065), streak=True, bevel=0.0)
    img[:, (np.arange(W) % 64) < 2] *= 0.5
    return img


MAKERS = {
    'wall': planks,
    'shingle': shingles,
    'stone': stones,
    'trim': lambda h, rng: board(h, rng, (0.80, 0.82, 0.85), streak=False, bevel=0.22),
    'beam': lambda h, rng: board(h, rng, (0.34, 0.27, 0.21)),
    'carve': carve,
    'rune': rune_strip,
    'dark': dark,
    'roofboard': lambda h, rng: board(h, rng, (0.50, 0.53, 0.58), streak=True, bevel=0.12),
}


def paint_atlas(path, seed=7):
    """Paint every strip into one image, save it as PNG at `path`, return (image, strips).
    strips[name] = (v_bottom, v_top, metres_per_u, metres_per_v or None) in Blender UV space."""
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 3))
    strips = {}
    y = 0
    for name, sh, um, vm in STRIP_SPECS:
        y += PAD
        part = np.clip(MAKERS[name](sh, rng), 0, 1)
        img[y:y + sh] = part
        img[y - PAD:y] = part[0]
        img[y + sh:y + sh + PAD] = part[-1]
        strips[name] = (1 - (y + sh - 1.5) / H, 1 - (y + 1.5) / H, um, vm)
        y += sh + PAD
    assert y <= H, f'strips overflow the atlas: {y} px'
    rgba = np.ones((H, W, 4), dtype=np.float32)
    rgba[..., :3] = img
    image = bpy.data.images.get('village_atlas') or bpy.data.images.new('village_atlas', W, H)
    image.pixels.foreach_set(rgba[::-1].ravel())
    image.filepath_raw = path
    image.file_format = 'PNG'
    image.save()
    return image, strips


def atlas_material(image):
    mat = bpy.data.materials.get('village_atlas') or bpy.data.materials.new('village_atlas')
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get('Principled BSDF')
    tex = nodes.get('atlas') or nodes.new('ShaderNodeTexImage')
    tex.name = 'atlas'
    tex.image = image
    links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    nodes.active = tex
    mat.use_backface_culling = True
    vc = nodes.get('vcol') or nodes.new('ShaderNodeVertexColor')
    vc.name = 'vcol'
    vc.layer_name = 'Col'
    mul = nodes.get('mul') or nodes.new('ShaderNodeMix')
    mul.name = 'mul'
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    mul.inputs['Factor'].default_value = 1.0
    links.new(tex.outputs['Color'], mul.inputs['A'])
    links.new(vc.outputs['Color'], mul.inputs['B'])
    links.new(mul.outputs['Result'], bsdf.inputs['Base Color'])
    return mat


def smooth01(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def bake_ao(bm, rays=14, dist=1.2, strength=0.5, seed=1):
    """Per-corner ambient occlusion by ray casting (crevices between planks, under eaves, stair corners).
    Returns {(face index, corner order): 0..1 light factor}."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree

    tree = BVHTree.FromBMesh(bm)
    rng = random.Random(seed)
    samples = []
    for _ in range(rays):
        u, phi = rng.random(), rng.random() * math.tau
        r = math.sqrt(u)
        samples.append((r * math.cos(phi), r * math.sin(phi), math.sqrt(1 - u)))
    out = {}
    for f in bm.faces:
        n = f.normal
        t1 = n.cross(Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))).normalized()
        t2 = n.cross(t1)
        for k, lp in enumerate(f.loops):
            origin = lp.vert.co + n * 0.02
            hits = 0
            for x, y, z in samples:
                if tree.ray_cast(origin, t1 * x + t2 * y + n * z, dist)[0] is not None:
                    hits += 1
            out[(f.index, k)] = 1.0 - strength * hits / rays
    return out


def apply_atlas(obj, image, strips, seed=3):
    """Project every face onto its strip (by its current material), bake simple vertex shading,
    then switch the mesh to the single atlas material."""
    from mathutils import Vector

    strips = dict(strips, inlay=strips['carve'])
    mesh = obj.data
    regions = [m.name[len('tpl_'):] for m in mesh.materials]
    rng = np.random.default_rng(seed)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv = bm.loops.layers.uv.verify()
    col = bm.loops.layers.float_color.get('Col') or bm.loops.layers.float_color.new('Col')
    zaxis = Vector((0, 0, 1))
    tone_layer = bm.faces.layers.float.get('tone')
    bm.faces.ensure_lookup_table()
    bm.faces.index_update()
    ao = bake_ao(bm)
    for f in bm.faces:
        name = regions[f.material_index]
        v_bot, v_top, um, vm = strips[name]
        n = f.normal
        if name in LONG:
            edge = max(f.edges, key=lambda e: e.calc_length())
            u_ax = (edge.verts[1].co - edge.verts[0].co).normalized()
            v_ax = n.cross(u_ax).normalized()
        elif abs(n.z) < 0.97:
            u_ax = zaxis.cross(n).normalized()
            v_ax = n.cross(u_ax).normalized()
        else:
            u_ax, v_ax = Vector((1, 0, 0)), Vector((0, 1, 0))
        vs = [lp.vert.co.dot(v_ax) for lp in f.loops]
        v_min, extent = min(vs), max(vs) - min(vs)
        span = vm if vm else max(extent, 1e-4)
        tone = f[tone_layer] if tone_layer else 1 + (rng.random() - 0.5) * 0.1
        under = 0.62 if n.z < -0.3 else 1.0
        for k, lp in enumerate(f.loops):
            p = lp.vert.co
            v_local = min(1.0, max(0.0, (p.dot(v_ax) - v_min) / span))
            lp[uv].uv = (p.dot(u_ax) / um, v_bot + v_local * (v_top - v_bot))
            ground = 0.85 + 0.15 * smooth01(p.z / 1.4)
            s = min(1.0, tone * ground * under * ao[(f.index, k)])
            lp[col] = (s, s, s, 1.0)
        f.material_index = 0
    bm.to_mesh(mesh)
    bm.free()
    if mesh.attributes.get('tone'):
        mesh.attributes.remove(mesh.attributes['tone'])
    mesh.materials.clear()
    mesh.materials.append(atlas_material(image))
    mesh.color_attributes.active_color = mesh.color_attributes['Col']
