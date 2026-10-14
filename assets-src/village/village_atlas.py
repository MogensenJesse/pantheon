# assets-src/village/village_atlas.py — the shared village trim sheet (temple, houses and props use the same one):
# stand-in strips painted with numpy, plus the UV pass. Run inside Blender (exec), after temple_build.py. Each surface
# type is one horizontal strip that spans the full texture width, so U repeats seamlessly (wrapS = repeat) while V
# stays inside the strip. TEXTURES.md lists what each strip is for and how big it is.
import math
import os
import random

import bmesh
import bpy
import numpy as np

W, H = 1024, 2048
PAD = 16  # edge padding per strip: survives the mip chain, so far LODs do not bleed one strip into the next
# name: strip height (px), metres per full texture width (U), metres per strip height (V; None = fit the face).
# Strips with a V value are laid in bands of that height by the roofs; the rest stretch over the face they cover.
STRIP_SPECS = [
    ('wall', 192, 6.0, None),
    ('plank', 96, 2.4, None),
    ('beam', 64, 2.0, None),
    ('trim', 64, 2.0, None),
    ('stone', 128, 4.0, 0.5),
    ('turf', 256, 8.0, 2.0),
    ('soil', 64, 3.0, None),
    ('thatch', 128, 5.0, 0.625),
    ('shingle', 128, 3.2, 0.4),
    ('carve', 96, 3.0, None),
    ('rune', 64, 2.4, None),
    ('dark', 32, 1.5, None),
    ('horn', 48, 1.0, None),
    ('rope', 32, 1.2, None),
    ('shingle_alt', 128, 3.2, 0.4),  # second painted course pattern in the previously unused space
]
# Faces whose texture runs along their longest edge (boards, beams, trim) instead of being projected.
LONG = ('plank', 'beam', 'trim', 'carve', 'horn', 'rope')
# Same strip, but stretched over the face (far LODs, where bands would only cost triangles).
FIT_ALIAS = {'shingle_far': 'shingle', 'stone_fit': 'stone'}


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


def pnoise(h, cx, cy, rng):
    """Value noise that tiles in both directions (cx divides W, cy divides h)."""
    gx, gy = W // cx, h // cy
    grid = rng.random((gy, gx))
    ys, xs = np.arange(h) / cy, np.arange(W) / cx
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    fy, fx = ys - y0, xs - x0
    fy, fx = fy * fy * (3 - 2 * fy), fx * fx * (3 - 2 * fx)
    y1, x1, y0, x0 = (y0 + 1) % gy, (x0 + 1) % gx, y0 % gy, x0 % gx
    top = grid[y0][:, x0] + (grid[y0][:, x1] - grid[y0][:, x0]) * fx
    bot = grid[y1][:, x0] + (grid[y1][:, x1] - grid[y1][:, x0]) * fx
    return top + (bot - top) * fy[:, None]


def tint(shape, colour, factor):
    return np.asarray(colour)[None, None, :] * factor[..., None]


def planks(h, rng, base=(0.30, 0.20, 0.13), boards=32):
    bw = W // boards
    col = np.arange(W) // bw
    edge = np.arange(W) % bw
    tones = 1 + (rng.random(boards) - 0.5) * 0.24
    grain = 0.55 * noise(h, W, 2, 32, rng) + 0.45 * noise(h, W, 8, 128, rng)
    img = tint(None, base, tones[col][None, :] * (0.82 + 0.34 * grain))
    img[:, (edge < 2) | (edge >= bw - 1)] = (0.05, 0.04, 0.03)
    img[:, (edge >= 2) & (edge < 4)] *= 1.18
    return img


def fishscales(h, rng, base=(0.21, 0.20, 0.22), sw=64):
    """Overlapping rounded scales in rows offset by half a scale; upper rows lie over lower ones. Tiles in U."""
    img = np.zeros((h, W, 3)) + np.asarray(base) * 0.3
    rh, r = sw // 2, sw / 2
    dy, dx = np.mgrid[-sw // 2:sw // 2 + 1, -sw // 2:sw // 2 + 1]
    dist = np.hypot(dx, dy) / r
    disc = dist <= 1.0
    shade = 0.75 + 0.35 * (1 - dist) + 0.12 * np.clip(-dy / r, 0, 1)  # a little lighter toward the top of each scale
    shade = np.where(dist > 0.88, shade * 0.5, shade)  # dark rim
    for row in range(h // rh + 1, -2, -1):  # bottom rows first
        cy = row * rh + rh // 2
        off = (sw // 2) * (row % 2)
        for k in range(W // sw):
            tone = 1 + (rng.random() - 0.5) * 0.3
            xs = (k * sw + off + dx[0]) % W
            for i in range(sw + 1):
                y = cy + dy[i, 0]
                if 0 <= y < h:
                    m = disc[i]
                    img[y, xs[m]] = np.asarray(base)[None, :] * tone * shade[i][m, None]
    return img


def stones(h, rng, base=(0.52, 0.52, 0.50), rows=2):
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


def carve(h, rng, slate=(0.50, 0.20, 0.13), beige=(0.86, 0.74, 0.55)):
    img = board(h, rng, slate, streak=False, bevel=0.05)
    x = np.arange(W)
    ys = np.arange(h)[:, None] / h
    n = 0.92 + 0.16 * noise(h, W, 8, 8, rng)
    for phase in (0.0, math.pi):
        centre = 0.5 + 0.27 * np.sin(2 * math.pi * x / 512 + phase)
        d = np.abs(ys - centre[None, :])
        img[(d >= 0.085) & (d < 0.115)] = (0.18, 0.12, 0.10)
        band = d < 0.085
        img[band] = np.asarray(beige) * n[band][:, None]
    for y0, y1 in ((0, 0.07), (0.93, 1.0)):
        rows = slice(int(y0 * h), int(y1 * h))
        img[rows] = np.asarray(beige) * 0.9
    return img


def rune_strip(h, rng, wood=(0.27, 0.18, 0.12), groove=(0.09, 0.07, 0.06), spacing=128):
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


def turf(h, rng, base=(0.36, 0.45, 0.14)):
    blotch = (0.6 * pnoise(h, 64, 32, rng) + 0.4 * pnoise(h, 16, 16, rng))[..., None]
    streak = np.clip((pnoise(h, 8, 16, rng) - 0.5) * 2.2, 0, 1)[..., None]
    patch = np.clip((pnoise(h, 128, 32, rng) - 0.65) * 3, 0, 1)[..., None]
    img = np.asarray(base)[None, None, :] * (0.72 + 0.5 * blotch)
    img = img * (1 - 0.7 * streak) + np.asarray((0.58, 0.60, 0.22))[None, None, :] * (0.8 + 0.4 * blotch) * 0.7 * streak
    return img * (1 - 0.45 * patch)


def thatch(h, rng, base=(0.74, 0.58, 0.28)):
    straw = pnoise(h, 4, h, rng)[..., None]
    wob = pnoise(h, 32, h // 4, rng)[..., None]
    v = (np.arange(h) / h)[:, None, None]
    shade = np.interp(v, [0, 0.12, 0.35, 0.8, 0.93, 1.0], [0.62, 0.9, 1.08, 1.0, 0.85, 0.55])
    return np.asarray(base)[None, None, :] * (0.7 + 0.45 * straw) * (0.9 + 0.2 * wob) * shade


def soil(h, rng, base=(0.20, 0.14, 0.09)):
    n = pnoise(h, 16, 16, rng)[..., None]
    v = (np.arange(h) / h)[:, None, None]
    k = np.clip((0.45 - v) * 4, 0, 1)
    roots = np.clip((pnoise(h, 4, h, rng) - 0.6) * 3, 0, 1)[..., None]
    brown = np.asarray(base)[None, None, :] * (0.7 + 0.6 * n) * (1 + 0.5 * roots)
    green = np.asarray((0.30, 0.38, 0.12))[None, None, :] * (0.8 + 0.4 * n)
    return brown * (1 - k) + green * k


# Stand-ins painted with numpy: each keeps its pixel size and metres per width (see TEXTURES.md), so a hand-painted
# strip can replace it unchanged.
MAKERS = {
    'wall': planks,
    'plank': lambda h, rng: board(h, rng, (0.36, 0.24, 0.15), streak=True, bevel=0.14),
    'beam': lambda h, rng: board(h, rng, (0.22, 0.14, 0.09)),
    'trim': lambda h, rng: board(h, rng, (0.42, 0.30, 0.19), streak=True, bevel=0.2),
    'stone': stones,
    'turf': turf,
    'soil': soil,
    'thatch': thatch,
    'shingle': fishscales,
    'shingle_alt': fishscales,
    'carve': carve,
    'rune': rune_strip,
    'dark': dark,
    'horn': lambda h, rng: board(h, rng, (0.75, 0.73, 0.66), streak=True, bevel=0.3),
    'rope': lambda h, rng: board(h, rng, (0.62, 0.48, 0.30), streak=True, bevel=0.3),
}


def load_painted_strip(directory, name, height):
    """Read one opaque albedo PNG; return top-down RGB samples or None if absent."""
    source_path = os.path.join(directory, name + '.png')
    if not os.path.isfile(source_path):
        return None
    source = bpy.data.images.load(source_path, check_existing=False)
    try:
        if tuple(source.size) != (W, height):
            raise ValueError(f'{source_path}: expected {W} x {height}, got {tuple(source.size)}')
        values = np.empty(W * height * 4, dtype=np.float32)
        source.pixels.foreach_get(values)
        return values.reshape(height, W, 4)[::-1, :, :3].copy()
    finally:
        bpy.data.images.remove(source)


def paint_atlas(path, seed=7, strips_dir=None):
    """Paint every strip into one image, save it as PNG at `path`, return (image, strips).
    strips[name] = (v_bottom, v_top, metres_per_u, metres_per_v or None) in Blender UV space."""
    strips_dir = strips_dir or os.environ.get('VILLAGE_TEXTURES_DIR') or os.path.join(os.path.dirname(os.path.abspath(path)), 'textures')
    rng = np.random.default_rng(seed)
    img = np.zeros((H, W, 3))
    strips = {}
    y = 0
    for name, sh, um, vm in STRIP_SPECS:
        y += PAD
        part = load_painted_strip(strips_dir, name, sh)
        if part is None:
            part = MAKERS[name](sh, rng)
        part = np.clip(part, 0, 1)
        img[y:y + sh] = part
        img[y - PAD:y] = part[0]
        img[y + sh:y + sh + PAD] = part[-1]
        strips[name] = (1 - (y + sh - 1.5) / H, 1 - (y + 1.5) / H, um, vm)
        y += sh + PAD
    assert y <= H, f'strips overflow the atlas: {y} px'
    rgba = np.ones((H, W, 4), dtype=np.float32)
    rgba[..., :3] = img
    old = bpy.data.images.get('village_atlas')
    if old:  # always a fresh image: an older packed copy (or another size) would survive a reuse and get saved again
        bpy.data.images.remove(old)
    image = bpy.data.images.new('village_atlas', W, H)
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

    strips = dict(strips, **{alias: (*strips[src][:3], None) for alias, src in FIT_ALIAS.items()})
    mesh = obj.data
    regions = [m.name[len('tpl_'):] for m in mesh.materials]
    rng = np.random.default_rng(seed)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    uv = bm.loops.layers.uv.verify()
    col = bm.loops.layers.float_color.get('Col') or bm.loops.layers.float_color.new('Col')
    zaxis = Vector((0, 0, 1))
    tone_layer = bm.faces.layers.float.get('tone')
    uoff_layer = bm.faces.layers.float.get('uoff')  # optional per-face U shift (texture widths), breaks up repeats
    preuv_layer = bm.faces.layers.int.get('preuv')  # faces whose builder gave the UVs (metres, 0..1): only scaled here
    bm.faces.ensure_lookup_table()
    bm.faces.index_update()
    ao = bake_ao(bm)
    for f in bm.faces:
        name = regions[f.material_index]
        shift = f[uoff_layer] if uoff_layer else 0.0
        # The source roof builder gives every band one shared U offset. Choose a
        # variant from that value so all columns in a band retain the same pattern.
        selected_name = name
        if name == 'shingle' and 'shingle_alt' in strips:
            key = int(abs(shift) * 1_000_000) if uoff_layer else f.index + seed
            if key % 2:
                selected_name = 'shingle_alt'
        v_bot, v_top, um, vm = strips[selected_name]
        n = f.normal
        given = bool(preuv_layer and f[preuv_layer])
        if given:
            u_ax = v_ax = zaxis
        elif name in LONG:
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
            if given:
                u_m, v_n = lp[uv].uv
                lp[uv].uv = (u_m / um + shift, v_bot + min(1.0, max(0.0, v_n)) * (v_top - v_bot))
            else:
                v_local = min(1.0, max(0.0, (p.dot(v_ax) - v_min) / span))
                lp[uv].uv = (p.dot(u_ax) / um + shift, v_bot + v_local * (v_top - v_bot))
            ground = 0.85 + 0.15 * smooth01(p.z / 1.4)
            s = min(1.0, tone * ground * under * ao[(f.index, k)])
            lp[col] = (s, s, s, 1.0)
        f.material_index = 0
    bm.to_mesh(mesh)
    bm.free()
    for name in ('tone', 'uoff', 'preuv'):
        if mesh.attributes.get(name):
            mesh.attributes.remove(mesh.attributes[name])
    mesh.materials.clear()
    mesh.materials.append(atlas_material(image))
    mesh.color_attributes.active_color = mesh.color_attributes['Col']
