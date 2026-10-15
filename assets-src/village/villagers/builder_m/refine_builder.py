# assets-src/village/villagers/builder_m/refine_builder.py — step 1: side view of the builder man.
#
# Reads the untouched Codex v2 model (builder_m_codex_v2.blend) and writes builder_m.blend with the depth
# (front-back) shape of every part fitted to the side view of the style sheet. Only vertex positions change:
# UVs, vertex weights, the rig and the clips stay exactly as they were, so the painted atlas still fits.
#
#   blender --background --python refine_builder.py [-- --out <blend>]
#
# The reference is the side view cut out of the sheet (532 x 812 px, feet at row 725, cap top at row 167,
# 1.782 m tall). Profiles below are read off it in reference pixels: (height z in metres, front x, back x);
# px_to_y() turns them into model depth. Facing -Y, so the front is the smaller x.
import math
import os
import sys

import bmesh
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'builder_m_codex_v2.blend')
MESH = 'Builder_MESH • textured v2'

PPM = 558 / 1.782  # reference pixels per metre
X0 = 272.0  # reference column that is model y = 0 (the rig's spine axis)


def px_to_y(x):
    return (x - X0) / PPM


# --- target profiles: (z, front px, back px), top to bottom; the part's own rings are remapped onto them -----
PROFILES = {
    # Skull under the cap: forehead, brow, lip, jaw, chin; the back is hair, nape below.
    'head': [(1.62, 205, 342), (1.54, 201, 348), (1.43, 204, 342), (1.3775, 206, 338), (1.325, 207, 322),
             (1.285, 222, 322)],
    'neck': [(1.31, 240, 322), (1.235, 238, 324)],
    'torso': [(1.27, 246, 322), (1.225, 239, 331), (1.12, 206, 342), (0.96, 190, 338), (0.815, 194, 338),
              # Below the belt the tunic skirt sits behind the apron (which bulges in front of it) so the painted
              # pocket of the torso chart does not show through the apron's curved sides.
              (0.71, 204, 338), (0.625, 204, 340)],
    # Only the front matters for the apron (it keeps its own curve round the hips): in front of the torso.
    'apron': [(0.821, 191, 0), (0.681, 190, 0), (0.55, 188, 0), (0.438, 187, 0)],
    'pelvis': [(0.785, 219, 330), (0.665, 219, 328), (0.55, 225, 324)],
    'leg': [(0.68, 226, 322), (0.55, 228, 322), (0.40, 229, 319), (0.30, 232, 321), (0.155, 246, 320)],
    'boot': [(0.335, 235, 327), (0.26, 234, 331), (0.25, 243, 330), (0.19, 243, 327), (0.12, 200, 325),
             (0.06, 198, 325), (0.018, 199, 324)],
    # Sleeve with its folded cuff, then the forearm, which slants forward as it goes down.
    'arm': [(1.24, 262, 318), (1.20, 252, 330), (1.13, 246, 333), (1.05, 246, 335), (1.00, 250, 330),
            (0.94, 258, 323), (0.88, 252, 320), (0.82, 246, 316), (0.76, 242, 316), (0.71, 240, 316)],
    'hand': [(0.78, 238, 316), (0.67, 242, 314), (0.57, 248, 310)],
}
# --- front view: half-widths in metres read off the front figure of the sheet (a 440 x 640 px crop, figure
# centre at column 225.5, feet at row 628, 566 px for 1.782 m). Rows are (z, half width[, shift outward]) at the
# part's own ring heights (before the lifts and tilt below); the part is scaled about its ring centre.
WIDTHS = {
    'head': [(1.62, 0.18), (1.54, 0.20), (1.43, 0.19), (1.3775, 0.185), (1.325, 0.17), (1.285, 0.125)],
    'cap': [(1.8, 0.065), (1.7675, 0.11), (1.735, 0.157), (1.693, 0.181), (1.651, 0.203), (1.635, 0.21),
            (1.5995, 0.222), (1.564, 0.222)],
    # Shoulder yoke: the neck base is wider, the line to the sleeve flatter and higher (see TORSO_Z_MAP).
    'torso': [(1.27, 0.145), (1.225, 0.31), (1.12, 0.285)],
    # The apron flares out to the hem.
    'apron': [(0.821, 0.27), (0.681, 0.30), (0.55, 0.32), (0.438, 0.33)],
    'leg': [(0.55, 0.16), (0.42, 0.16), (0.34, 0.155), (0.2, 0.133)],
    # Boots stand wider apart and splay outward toward the feet; (z, half width, shift outward).
    'boot': [(0.335, 0.14, 0.012), (0.26, 0.145, 0.014), (0.25, 0.115, 0.025), (0.19, 0.113, 0.03),
             (0.12, 0.15, 0.045), (0.06, 0.153, 0.048), (0.018, 0.152, 0.048)],
}
WIDTH_GAP = {'leg': 0.05}  # tilted tubes: group ring vertices over a taller band
# The shoulder line rises: collar ring up to 1.32 (the drawing's collar top is at row 214 of the back figure),
# shoulder ring to 1.252 and 0.31 half wide, so the shoulder line runs on into the sleeve (heights before -> after).
TORSO_Z_MAP = [(1.27, 1.32), (1.225, 1.252), (1.12, 1.12)]
# Arms: the Codex arms are already about the drawing's thickness (sleeve 0.23 m, forearm 0.16 m against the
# drawing's 0.21 and 0.15 to 0.18): scale about the arm axis (rest A-pose axis points) only a little. The hand
# bends in at the wrist, as drawn, and is a fifth wider.
ARM_AXIS = [(1.2, 0.265), (0.962, 0.447), (0.747, 0.586)]  # (z, x) shoulder, elbow, wrist of the left arm
ARM_SCALE = [(1.0, 0.95), (0.93, 1.0)]  # (z, scale): sleeve above 1.0, forearm below 0.93
HAND_SCALE = 1.2
# Shoulder cap: the drawing's shoulder line runs straight from the collar to the sleeve, the Codex cap leaves a
# notch. The vertices above SHOULDER_Z0 move up and out (rest pose; the clip then drops the arm).
SHOULDER_Z0 = 1.18
SHOULDER_LIFT = 0.024
SHOULDER_OUT = 0.006
WRIST_BEND_DEG = 20.0  # fingers turn toward the body about the wrist
# The drawing has short forearms and big fists: forearm 0.15 m long against the model's 0.31, fist 0.21 against
# 0.185. The forearm is compressed along its axis and the hand follows (lengthened by HAND_LENGTH).
FOREARM_K = 0.5
FOREARM_T0 = 0.03  # distance below the elbow ring where the compression starts (the sleeve cuff stays)
HAND_LENGTH = 1.13
# The drawing's elbows stand out from the body: arm and hands move outward (z, metres) in the rest pose.
ARM_SHIFT = [(1.2, 0.0), (1.05, 0.065), (0.95, 0.085), (0.84, 0.105), (0.7, 0.13)]

# Cap: flat crown, domed back, folded roll round the head, tilted back. The outline is the reference's, as
# (z, px) polylines of its front and back edge; the tilt moves the rings, so each ring is fitted where the
# outline will cut it after the tilt (see cap_profile).
CAP_FRONT = [(1.80, 243), (1.762, 232), (1.723, 219), (1.685, 206), (1.647, 200), (1.62, 199)]
CAP_BACK = [(1.80, 301), (1.762, 319), (1.723, 336), (1.685, 345), (1.647, 349), (1.609, 353), (1.571, 352),
            (1.533, 354), (1.495, 349), (1.46, 345)]
# Lower edge: front rim rises, back rim drops (reference: front z 1.62, back z 1.46 on the beanie).
CAP_TILT = {'front_rise': 0.056, 'slope': 0.33, 'z_rim': 1.564, 'z_top': 1.80}
# The painted brows and eyes sit 4.5 cm lower than on the drawing, and the cap's front rim rises 5.6 cm: lift
# the face rings (and the nose with them) so the features keep the drawing's gap under the cap. (z -> z)
HEAD_Z_MAP = [(1.62, 1.62), (1.54, 1.585), (1.43, 1.475), (1.3775, 1.41), (1.325, 1.345), (1.285, 1.285)]
# Rings to add (between these existing ring heights) for a rounder dome and a nape step.
CAP_NEW_RINGS = [(1.8, 1.735), (1.735, 1.651), (1.635, 1.564)]
HEAD_NEW_RINGS = [(1.43, 1.325)]
# Nose: tip and base heights stay; the tip stands out of the face by about 6 cm (reference 188 vs 205 px).
# Nose, final heights (no face lift): bridge at the eyes, its top edge sunk 5 mm into the face (it floated), tip and underside as drawn (tip at row 277, underside at
# row 285 of the side figure); x is a quarter wider (the drawing's nose is 9 cm wide at the bottom).
NOSE = {'tip_px': 186, 'top_px': 204, 'bottom_px': 191, 'base_px': 208,
        'top_z': 1.535, 'tip_z': 1.452, 'bottom_z': 1.432, 'base_z': 1.425, 'x_scale': 1.25}


def components(bm):
    seen, comps = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            c = stack.pop()
            comp.append(c)
            for e in c.link_edges:
                o = e.other_vert(c)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        comps.append(comp)
    return comps


def classify(comps):
    """Name every connected piece of the character mesh by its size and height range."""
    parts = {}
    for comp in comps:
        n = len(comp)
        zs = [v.co.z for v in comp]
        xs = [v.co.x for v in comp]
        zmin, zmax, xm = min(zs), max(zs), sum(xs) / n
        side = 'L' if xm > 0 else 'R'
        if n == 40 and zmax > 1.78:
            name = 'cap'
        elif n == 40 and zmin < 1.3 and 1.6 < zmax < 1.65:
            name = 'head'
        elif n == 7:
            name = 'nose'
        elif n == 20:
            name = 'ear.' + side
        elif n == 16:
            name = 'neck'
        elif n == 56 and zmax > 1.2:
            name = 'torso'
        elif n == 88:
            name = 'arm.' + side
        elif n == 40 and zmax < 0.83:
            name = 'apron'
        elif n == 24:
            name = 'pelvis'
        elif n == 32:
            name = 'hand.' + side
        elif n == 18:
            name = 'thumb.' + side
        elif n == 56 and zmax > 0.6:
            name = 'leg.' + side
        elif n == 56 and zmax < 0.4:
            name = 'boot.' + side
        else:
            raise RuntimeError(f'unrecognised piece: {n} verts, z {zmin:.3f}..{zmax:.3f}')
        assert name not in parts, f'duplicate piece {name}'
        parts[name] = comp
    return parts


def interp(table, z):
    """Piecewise-linear lookup in rows of (z, a, b), z descending."""
    if z >= table[0][0]:
        return table[0][1], table[0][2]
    for (z0, a0, b0), (z1, a1, b1) in zip(table, table[1:]):
        if z <= z0 and z >= z1:
            t = (z - z1) / (z0 - z1) if z0 != z1 else 0.0
            return a1 + (a0 - a1) * t, b1 + (b0 - b1) * t
    return table[-1][1], table[-1][2]


def envelope(verts, gap=0.012):
    """(z, front y, back y) of the part's rings, found by grouping vertices of similar height."""
    pts = sorted(((v.co.z, v.co.y) for v in verts), reverse=True)
    groups, cur = [], [pts[0]]
    for p in pts[1:]:
        if cur[-1][0] - p[0] > gap:
            groups.append(cur)
            cur = [p]
        else:
            cur.append(p)
    groups.append(cur)
    return [(sum(z for z, _ in g) / len(g), min(y for _, y in g), max(y for _, y in g)) for g in groups]


def interp_rows(rows, z):
    """Linear lookup in (z, a, b, ...) rows with z descending, clamped at both ends."""
    if z >= rows[0][0]:
        return rows[0][1:]
    for r0, r1 in zip(rows, rows[1:]):
        if r0[0] >= z >= r1[0]:
            t = (z - r1[0]) / (r0[0] - r1[0])
            return tuple(b + (a - b) * t for a, b in zip(r0[1:], r1[1:]))
    return rows[-1][1:]


def remap_width(verts, rows, gap=0.012, sign=0.0):
    """Scale a part's rings in x about their own centre onto the half widths in rows (and shift them outward)."""
    xs = sorted(((v.co.z, v.co.x) for v in verts), reverse=True)
    groups, cur = [], [xs[0]]
    for p in xs[1:]:
        if cur[-1][0] - p[0] > gap:
            groups.append(cur)
            cur = [p]
        else:
            cur.append(p)
    groups.append(cur)
    env = [(sum(z for z, _ in g) / len(g), (min(x for _, x in g) + max(x for _, x in g)) / 2,
            (max(x for _, x in g) - min(x for _, x in g)) / 2) for g in groups]  # (z, centre, half)
    table = []
    for row in rows:
        near = min(env, key=lambda e: abs(e[0] - row[0]))
        shift = row[2] if len(row) > 2 else 0.0
        table.append((row[0], row[1] / near[2], shift * sign))
    for v in verts:
        cx, _ = interp_rows(env, v.co.z)  # (z, centre, half): the centre follows the part's own axis
        scale, shift = interp_rows(table, v.co.z)
        v.co.x = cx + shift + (v.co.x - cx) * scale


def thicken_arm(verts, sign):
    """Widen the sleeve and forearm about the arm's axis (x as a function of height, rest pose)."""
    def axis_x(z):
        for (z0, x0), (z1, x1) in zip(ARM_AXIS, ARM_AXIS[1:]):
            if z >= z1:
                return (x0 + (x1 - x0) * (z0 - z) / (z0 - z1)) * sign
        (z0, x0), (z1, x1) = ARM_AXIS[-2], ARM_AXIS[-1]
        return (x0 + (x1 - x0) * (z0 - z) / (z0 - z1)) * sign

    for v in verts:
        (k,) = interp_rows([(z, k) for z, k in ARM_SCALE], v.co.z)
        ax = axis_x(v.co.z)
        v.co.x = ax + (v.co.x - ax) * k


def lift_shoulder(verts, sign):
    for v in verts:
        w = max(0.0, min(1.0, (v.co.z - SHOULDER_Z0) / (1.24 - SHOULDER_Z0)))
        w = w * w * (3 - 2 * w)
        v.co.z += SHOULDER_LIFT * w
        v.co.x += sign * SHOULDER_OUT * w


def forearm_axis(sign):
    """Unit vector and length of the forearm in the rest pose (x mirrored for the right arm), plus the elbow."""
    (ez, ex), (wz, wx) = ARM_AXIS[-2], ARM_AXIS[-1]
    length = math.hypot(wx - ex, wz - ez)
    return ((wx - ex) * sign / length, (wz - ez) / length), length, (ex * sign, ez)


def shorten_forearm(arm, hand, sign):
    """Compress the forearm along its axis and carry the hand up with it (stretched by HAND_LENGTH)."""
    (ux, uz), length, (ex, ez) = forearm_axis(sign)
    removed = (length - FOREARM_T0) * (1 - FOREARM_K)
    for v in arm:
        t = (v.co.x - ex) * ux + (v.co.z - ez) * uz
        if v.co.z < 0.955 and t > FOREARM_T0:
            dt = FOREARM_T0 + (t - FOREARM_T0) * FOREARM_K - t
            v.co.x += ux * dt
            v.co.z += uz * dt
    for v in hand:
        t = (v.co.x - ex) * ux + (v.co.z - ez) * uz
        dt = -removed + max(0.0, t - length) * (HAND_LENGTH - 1)
        v.co.x += ux * dt
        v.co.z += uz * dt


def wrist_point(sign):
    """Where the wrist ends up after the forearm is shortened and the arm moved out (x, z)."""
    (ux, uz), length, (ex, ez) = forearm_axis(sign)
    removed = (length - FOREARM_T0) * (1 - FOREARM_K)
    x, z = ex + ux * (length - removed), ez + uz * (length - removed)
    return x + sign * interp_rows(ARM_SHIFT, z)[0], z


def shift_out(verts, sign):
    for v in verts:
        v.co.x += sign * interp_rows(ARM_SHIFT, v.co.z)[0]


def keep_thumb_upright(thumb, sign, degrees):
    """After the wrist bend, turn the thumb back about its own base so it points as it did before."""
    top = sorted(thumb, key=lambda v: -v.co.z)[:4]  # the vertices nearest the hand
    px, pz = sum(v.co.x for v in top) / 4, sum(v.co.z for v in top) / 4
    a = math.radians(degrees)
    c, s_ = math.cos(a), math.sin(a)
    for v in thumb:
        x, z = (v.co.x - px) * sign, v.co.z - pz
        v.co.x = px + sign * (x * c - z * s_)
        v.co.z = pz + (x * s_ + z * c)


def scale_hand(verts, k):
    c = sum(v.co.x for v in verts) / len(verts)
    for v in verts:
        v.co.x = c + (v.co.x - c) * k


def bend_wrist(verts, sign, degrees, ramp=0.1):
    """Bend the hand about the wrist (rest pose, y axis) so the fingers turn toward the body. The bend grows
    smoothly over the first `ramp` metres of the hand, so the wrist does not open a gap."""
    wx, wz = wrist_point(sign)
    axis = forearm_axis(1.0)[0]  # forearm direction, mirrored onto the left arm below
    for v in verts:
        x, z = (v.co.x - wx) * sign, v.co.z - wz  # mirror the right arm onto the left
        t = max(0.0, min(1.0, (x * axis[0] + z * axis[1]) / ramp))
        a = math.radians(-degrees) * (t * t * (3 - 2 * t))
        c, s_ = math.cos(a), math.sin(a)
        v.co.x = wx + sign * (x * c - z * s_)
        v.co.z = wz + (x * s_ + z * c)


def remap_z(verts, table):
    for v in verts:
        z = v.co.z
        for (z0, m0), (z1, m1) in zip(table, table[1:]):
            if z0 >= z >= z1:
                v.co.z = m1 + (m0 - m1) * (z - z1) / (z0 - z1)
                break


def remap_depth(verts, profile_px, shift_only=False):
    """Move vertices along y so each ring's front and back land on the profile at that height.
    shift_only keeps the part's own depth and only moves its front onto the profile (the apron's curve)."""
    env = envelope(verts)
    target = [(z, px_to_y(f), px_to_y(b)) for z, f, b in profile_px]
    for v in verts:
        f0, b0 = interp(env, v.co.z)
        f1, b1 = interp(target, v.co.z)
        if shift_only:
            v.co.y += f1 - f0
            continue
        t = (v.co.y - f0) / (b0 - f0) if b0 - f0 > 1e-6 else 0.5
        v.co.y = f1 + t * (b1 - f1)


def polyline(points, z):
    """Linear lookup in (z, px) rows, z descending, clamped."""
    if z >= points[0][0]:
        return points[0][1]
    for (z0, a0), (z1, a1) in zip(points, points[1:]):
        if z0 >= z >= z1:
            return a1 + (a0 - a1) * (z - z1) / (z0 - z1)
    return points[-1][1]


def cap_profile(ring_zs):
    """Fit rows for the cap's rings: where the tilted ring's front and back land on the reference outline."""
    t = CAP_TILT
    rows = []
    for z in ring_zs:
        w = max(0.0, (t['z_top'] - z) / (t['z_top'] - t['z_rim']))
        depth = 0.3
        for _ in range(3):  # the back drops by the ring's own depth, which the fit changes
            zf = z + w * t['front_rise']
            zb = z + w * (t['front_rise'] - t['slope'] * depth)
            f, b = polyline(CAP_FRONT, zf), polyline(CAP_BACK, zb)
            depth = (b - f) / PPM
        rows.append((z, f, b))
    return rows


def tag_parts(bm, parts):
    """Mark every vertex with its part (an int layer), so the parts survive operations that rebuild vertices."""
    ids = {name: [v.index for v in comp] for name, comp in parts.items()}
    layer = bm.verts.layers.int.new('part')  # adding a layer rebuilds the vertices: go by index from here
    bm.verts.ensure_lookup_table()
    names = sorted(ids)
    for pid, name in enumerate(names):
        for i in ids[name]:
            bm.verts[i][layer] = pid + 1
    return names


def part_verts(bm, names):
    layer = bm.verts.layers.int['part']
    out = {name: [] for name in names}
    for v in bm.verts:
        out[names[v[layer] - 1]].append(v)
    return out


def insert_rings(bm, names, name, pairs):
    """Add a ring halfway between each pair of ring heights; UVs and weights are interpolated by the cut."""
    layer = bm.verts.layers.int['part']
    pid = names.index(name) + 1
    for hi, lo in pairs:
        bm.verts.ensure_lookup_table()
        edges = []
        for e in bm.edges:
            a, b = e.verts
            if a[layer] == pid and b[layer] == pid:
                if (abs(a.co.z - hi) < 0.003 and abs(b.co.z - lo) < 0.003) or (
                        abs(b.co.z - hi) < 0.003 and abs(a.co.z - lo) < 0.003):
                    edges.append(e)
        res = bmesh.ops.subdivide_edges(bm, edges=edges, cuts=1, use_grid_fill=True)
        for g in res['geom']:
            if isinstance(g, bmesh.types.BMVert):
                g[layer] = pid


def lift_face(verts):
    for v in verts:
        z = v.co.z
        for (z0, m0), (z1, m1) in zip(HEAD_Z_MAP, HEAD_Z_MAP[1:]):
            if z0 >= z >= z1:
                v.co.z = m1 + (m0 - m1) * (z - z1) / (z0 - z1)
                break


def tilt_cap(verts):
    t = CAP_TILT
    front = min(v.co.y for v in verts)
    for v in verts:
        w = max(0.0, (t['z_top'] - v.co.z) / (t['z_top'] - t['z_rim']))
        v.co.z += w * (t['front_rise'] - t['slope'] * (v.co.y - front))


def fit_nose(verts):
    """Rebuild the nose on the new face: bridge level with the eyes, tip forward, base back on the face."""
    for v in verts:
        z = v.co.z  # the original heights tell the nose's four edges apart
        for z0, key in ((1.49, 'top'), (1.47, 'tip'), (1.415, 'bottom'), (1.403, 'base')):
            if abs(z - z0) < 0.006:
                v.co.y = px_to_y(NOSE[key + '_px'])
                v.co.z = NOSE[key + '_z']
                v.co.x *= NOSE['x_scale']
                break


def main(argv):
    args = argv[argv.index('--') + 1:] if '--' in argv else []
    opts = dict(zip(args[::2], args[1::2]))
    out = opts.get('--out', os.path.join(HERE, 'builder_m.blend'))
    bpy.ops.wm.open_mainfile(filepath=SRC)
    ob = bpy.data.objects[MESH]
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    names = tag_parts(bm, classify(components(bm)))
    insert_rings(bm, names, 'cap', CAP_NEW_RINGS)
    insert_rings(bm, names, 'head', HEAD_NEW_RINGS)
    parts = part_verts(bm, names)
    for name, comp in parts.items():
        kind, _, side = name.partition('.')
        sign = 1.0 if side == 'L' else -1.0  # +x is the figure's left
        if kind == 'cap':
            remap_depth(comp, cap_profile([row[0] for row in envelope(comp)]))
            remap_width(comp, WIDTHS['cap'])
            tilt_cap(comp)
        elif kind == 'nose':
            fit_nose(comp)
        elif kind == 'arm':  # sleeve and forearm, with the hand and thumb of the same side
            thumb = parts['thumb.' + side]
            hand = parts['hand.' + side] + thumb
            remap_depth(comp, PROFILES['arm'])
            remap_depth(hand, PROFILES['hand'])
            thicken_arm(comp, sign)
            lift_shoulder(comp, sign)
            scale_hand(hand, HAND_SCALE)
            shorten_forearm(comp, hand, sign)
            shift_out(comp, sign)
            shift_out(hand, sign)
            bend_wrist(hand, sign, WRIST_BEND_DEG)
            keep_thumb_upright(thumb, sign, WRIST_BEND_DEG)
        elif kind in ('hand', 'thumb'):
            pass  # done with the arm
        elif kind in PROFILES and kind != 'hand':
            remap_depth(comp, PROFILES[kind], shift_only=(kind == 'apron'))
            if kind in WIDTHS:
                remap_width(comp, WIDTHS[kind], WIDTH_GAP.get(kind, 0.012), sign)
            if kind == 'head':
                lift_face(comp)
            if kind == 'torso':
                remap_z(comp, TORSO_Z_MAP)
    if '--keep' in opts:  # debugging aid: keep only these parts (kinds, comma separated) in the saved file
        keep = opts['--keep'].split(',')
        bmesh.ops.delete(bm, geom=[v for n, c in parts.items() if n.split('.')[0] not in keep for v in c],
                         context='VERTS')
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    bpy.ops.wm.save_as_mainfile(filepath=out)
    print('REFINED', out)


if __name__ == '__main__':
    main(sys.argv)
