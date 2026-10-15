# assets-src/village/villager_build.py — the villager kit: 12 chunky Norse figures (6 roles x 2 sexes), one GLB
#
# Run headless (writes the GLB, optional preview renders and a snapshot .blend):
#   blender --background --factory-startup --python villager_build.py -- \
#     --glb <repo>/public/models/village-kit/villagers.glb [--preview <dir>] [--blend <path>]
#
# Every figure is a node `villager_<role>_<m|f>` with one child mesh per rig part. Each part's node sits at its
# joint and carries extras `part` (a VillagerPart key) and `pivot` (figure space, metres, +Y up, facing +Z);
# the game's vertex shader swings the part about that pivot. Materials are the colours; `villager_skin`,
# `villager_hair` and `villager_tunic` are colour slots the game fills per villager (their colour here is a
# preview only). See villagerKit.ts and the kit README.
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROLES = ('builder', 'priest', 'idler', 'farmer', 'woodcutter', 'fisherman')  # index = Role id (model/types.ts)
SEXES = ('m', 'f')  # index = Sex id

# Joint pivots in figure space: keep in sync with VILLAGER_RIG in villagerFigure.ts.
HIP_Y = 0.56
HIP_X = 0.11
NECK_Y = 1.02
SHOULDER_Y = 0.99


def shoulder_x(sex):
    return 0.28 if sex == 'f' else 0.32


# sRGB colours, picked from the villager style sheets.
PALETTE = {
    'skin': 0xE0A382,  # slot
    'hair': 0x7A4A2A,  # slot
    'tunic': 0x5F7A3F,  # slot
    'eye': 0x2A2118,
    'cream': 0xD9CFB6,
    'scarf': 0xE2DDD0,
    'coif': 0xD6CBB0,
    'cap': 0x7C7A66,
    'leather': 0x7A4A2E,
    'belt': 0x4E3322,
    'buckle': 0x8A8A82,
    'trousers_blue': 0x3D5068,
    'trousers_brown': 0x5A4632,
    'trousers_dark': 0x30343C,
    'wool': 0x5B5048,
    'boots': 0x5C5844,
    'boot_cuff': 0x7E7A68,
    'boots_brown': 0x5A3D28,
    'boots_red': 0x6A3A2C,
    'apron': 0xB9A687,
    'sash': 0x7C3A30,
    'straw': 0xC9A25A,
    'straw_band': 0x6B4A2E,
    'basket': 0xA47A45,
    'basket_rim': 0x7A5630,
    'hood': 0x6E675B,
    'bark': 0x6B4A2E,
    'endgrain': 0xC8A26A,
    'rope': 0xB59B6A,
    'mitten': 0x6E5236,
    'mitten_red': 0x6A3A38,
    'coat': 0x9C7A34,
    'coat_cuff': 0x7E622A,
    'net': 0x4D4A40,
    'knit': 0xB3A58A,
    'knit_slate': 0x4F5D6C,
    'robe': 0xDDD3BC,
    'robe_trim': 0x3E5A3E,
    'cloak': 0x2C3134,
    'rune_band': 0x6E7470,
    'rune': 0x7FD6CC,
    'staff': 0x7A6248,
    'wood': 0x8A6440,
    'iron': 0x5E6266,
    'steel': 0x9AA0A6,
}


def lin(hexv):
    def ch(x):
        x /= 255.0
        return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4

    return (ch((hexv >> 16) & 255), ch((hexv >> 8) & 255), ch(hexv & 255))


# ---------------------------------------------------------------- geometry (figure space: +Y up, facing +Z)


class Figure:
    """Faces per rig part, in figure space; `tag` picks the part the next primitives belong to."""

    def __init__(self):
        self.parts = {}
        self.cur = None

    def tag(self, part, pivot):
        self.cur = self.parts.setdefault(part, {'pivot': tuple(pivot), 'v': [], 'f': [], 'm': []})
        return self

    def emit(self, bm, mat, cap=None):
        p = self.cur
        base = len(p['v'])
        bm.verts.index_update()
        p['v'].extend(v.co.copy() for v in bm.verts)
        for face in bm.faces:
            p['f'].append([base + v.index for v in face.verts])
            p['m'].append(cap if cap and face.tag else mat)
        bm.free()
        return self


def _bevel(bm, bev):
    if bev > 0:
        bmesh.ops.bevel(
            bm, geom=bm.verts[:] + bm.edges[:], offset=bev, offset_type='OFFSET', segments=1,
            profile=0.5, affect='EDGES', clamp_overlap=True,
        )


def box(f, c, s, mat, bev=0.0, top=1.0, topz=None, bot=1.0, botz=None):
    """Box centred on c with size s; top/bot scale the top/bottom face (x, and z unless topz/botz)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    tz = top if topz is None else topz
    bz = bot if botz is None else botz
    for v in bm.verts:
        kx, kz = (top, tz) if v.co.y > 0 else (bot, bz)
        v.co = Vector((v.co.x * s[0] * kx, v.co.y * s[1], v.co.z * s[2] * kz))
    _bevel(bm, bev)
    bmesh.ops.translate(bm, vec=Vector(c), verts=bm.verts)
    return f.emit(bm, mat)


def beam(f, a, b, w, mat, d=None, bev=0.0):
    """Square beam from a to b, w wide (d deep)."""
    a, b = Vector(a), Vector(b)
    axis = b - a
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * w, v.co.y * axis.length, v.co.z * (d or w)))
    _bevel(bm, bev)
    rot = Vector((0, 1, 0)).rotation_difference(axis.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ rot, verts=bm.verts)
    return f.emit(bm, mat)


def cyl(f, c, r, h, mat, n=8, r2=None, axis='y', cap=None):
    """n-sided cylinder (cone when r2 is given) along the y or x axis; `cap` colours its end faces."""
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm, cap_ends=True, cap_tris=False, segments=n, radius1=r, radius2=r if r2 is None else r2, depth=h,
    )
    for face in bm.faces:
        face.normal_update()
        face.tag = abs(face.normal.z) > 0.9
    rot = Matrix.Rotation(-math.pi / 2, 4, 'X') if axis == 'y' else Matrix.Rotation(math.pi / 2, 4, 'Y')
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ rot, verts=bm.verts)
    return f.emit(bm, mat, cap)


# ---------------------------------------------------------------- body pieces


def legs(f, trousers, boots, cuff=None, tall=False):
    h = 0.3 if tall else 0.2
    for part, sx in (('LegL', -1), ('LegR', 1)):
        x = sx * HIP_X
        f.tag(part, (x, HIP_Y, 0))
        box(f, (x, 0.39, 0), (0.19, 0.42, 0.19), trousers)
        box(f, (x, h / 2, 0.03), (0.21, h, 0.29), boots, bev=0.035)
        if cuff:
            box(f, (x, h + 0.02, 0), (0.225, 0.07, 0.225), cuff, bev=0.012)


def arms(f, sex, upper, lower, hand='skin', cuff=None, mitten=False):
    sx0 = shoulder_x(sex)
    s = 0.18 if mitten else 0.155
    for part, sx in (('ArmL', -1), ('ArmR', 1)):
        f.tag(part, (sx * sx0, SHOULDER_Y, 0))
        x = sx * (sx0 + 0.01)
        box(f, (x, 0.865, 0), (0.17, 0.27, 0.18), upper, bev=0.035)
        box(f, (x, 0.62, 0.01), (0.15, 0.25, 0.16), lower, bev=0.02)
        if cuff:
            box(f, (x, 0.53, 0.01), (0.165, 0.06, 0.175), cuff)
        box(f, (sx * (sx0 + 0.02), 0.44, 0.03), (s, 0.165, s), hand, bev=0.04)


def tunic(f, hem=0.42):
    box(f, (0, (hem + 1.0) / 2, 0), (0.5, 1.0 - hem, 0.32), 'tunic', bev=0.04, top=0.92)


def dress(f):
    """Pinafore dress (tinted) over a cream shirt."""
    box(f, (0, 0.53, 0), (0.5, 0.72, 0.4), 'tunic', bev=0.04, top=0.88, topz=0.8)
    box(f, (0, 0.925, 0), (0.42, 0.17, 0.31), 'cream', bev=0.03)


def straps(f):
    for sx in (-1, 1):
        for sz in (-1, 1):
            box(f, (sx * 0.1, 0.94, sz * 0.16), (0.05, 0.13, 0.02), 'tunic')


def belt(f, y, w, d, mat='belt', h=0.055, buckle=False):
    box(f, (0, y, 0), (w, h, d), mat)
    if buckle:
        box(f, (0, y, d / 2 + 0.006), (0.07, 0.05, 0.014), 'buckle')


def back_straps(f, z, mat='belt'):
    for sx in (-1, 1):
        box(f, (sx * 0.12, 0.86, z), (0.045, 0.26, 0.02), mat)


def head(f):
    f.tag('Head', (0, NECK_Y, 0))
    box(f, (0, 1.26, 0), (0.42, 0.4, 0.4), 'skin', bev=0.06, bot=0.9)
    box(f, (0, 1.03, 0), (0.18, 0.1, 0.16), 'skin')
    box(f, (0, 1.225, 0.215), (0.075, 0.1, 0.06), 'skin', bev=0.015)
    for sx in (-1, 1):
        box(f, (sx * 0.095, 1.3, 0.203), (0.075, 0.022, 0.012), 'eye')


def fringe(f):
    box(f, (0, 1.4, 0.168), (0.42, 0.06, 0.08), 'hair')


def hair_short(f):
    box(f, (0, 1.43, -0.02), (0.45, 0.11, 0.44), 'hair', bev=0.035)
    box(f, (0, 1.28, -0.175), (0.445, 0.26, 0.095), 'hair', bev=0.02)
    fringe(f)


def hair_under_hat(f):
    box(f, (0, 1.27, -0.175), (0.445, 0.24, 0.095), 'hair', bev=0.02)


def hair_bob(f):
    box(f, (0, 1.23, -0.05), (0.47, 0.32, 0.36), 'hair', bev=0.05)
    fringe(f)


def hair_long(f):
    box(f, (0, 1.12, -0.165), (0.44, 0.42, 0.12), 'hair', bev=0.04, bot=0.9)
    for sx in (-1, 1):
        box(f, (sx * 0.205, 1.25, 0.03), (0.05, 0.3, 0.3), 'hair')
    fringe(f)


def braids(f, z=0.17, sides=True):
    """Two braids hanging in front of the shoulders."""
    if sides:
        hair_under_hat(f)
    for sx in (-1, 1):
        if sides:
            box(f, (sx * 0.205, 1.25, 0.04), (0.05, 0.28, 0.28), 'hair')
        box(f, (sx * 0.17, 1.0, z), (0.085, 0.24, 0.085), 'hair', bev=0.02)
        box(f, (sx * 0.17, 0.875, z), (0.07, 0.025, 0.07), 'belt')
        box(f, (sx * 0.17, 0.835, z), (0.06, 0.06, 0.06), 'hair', bot=0.5)
    fringe(f)


def braid_back(f):
    box(f, (0, 1.0, -0.215), (0.085, 0.26, 0.085), 'hair', bev=0.02)
    box(f, (0, 0.86, -0.215), (0.07, 0.025, 0.07), 'belt')


def beard(f, long=False):
    box(f, (0, 1.12, 0.17), (0.4, 0.15, 0.1), 'hair', bev=0.03)
    for sx in (-1, 1):
        box(f, (sx * 0.2, 1.22, 0.07), (0.045, 0.2, 0.24), 'hair')
    box(f, (0, 1.185, 0.218), (0.16, 0.035, 0.03), 'hair')
    if long:
        box(f, (0, 0.97, 0.2), (0.3, 0.2, 0.1), 'hair', bev=0.03, bot=0.55)
        for sx in (-1, 1):
            box(f, (sx * 0.055, 0.82, 0.215), (0.055, 0.1, 0.055), 'hair', bev=0.012)
            box(f, (sx * 0.055, 0.775, 0.215), (0.06, 0.02, 0.06), 'belt')


def cap(f, mat):
    box(f, (0, 1.49, -0.015), (0.46, 0.15, 0.45), mat, bev=0.05, top=0.9)
    box(f, (0, 1.425, -0.015), (0.47, 0.055, 0.46), mat, bev=0.015)


def straw_hat(f):
    cyl(f, (0, 1.45, 0), 0.4, 0.03, 'straw', n=10)
    cyl(f, (0, 1.545, 0), 0.215, 0.17, 'straw', n=10, r2=0.175)
    cyl(f, (0, 1.49, 0), 0.22, 0.05, 'straw_band', n=10)


def beanie(f, mat):
    box(f, (0, 1.5, -0.01), (0.45, 0.17, 0.44), mat, bev=0.06, top=0.85)
    box(f, (0, 1.43, -0.01), (0.465, 0.07, 0.455), mat, bev=0.02)


def hood(f, mat):
    """Box hood: the face pokes 3 cm through its front, so the front face frames it."""
    box(f, (0, 1.29, -0.075), (0.54, 0.5, 0.49), mat, bev=0.05, top=0.85, topz=1.0)
    box(f, (0, 1.57, -0.17), (0.2, 0.14, 0.22), mat, top=0.25)


def headscarf(f):
    box(f, (0, 1.42, -0.025), (0.455, 0.15, 0.45), 'scarf', bev=0.05, top=0.88)
    box(f, (0, 1.25, -0.2), (0.43, 0.24, 0.07), 'scarf', bev=0.02, bot=0.7)


def basket(f, strap_z):
    cyl(f, (0, 0.82, -0.3), 0.16, 0.34, 'basket', n=8, r2=0.195)
    cyl(f, (0, 0.985, -0.3), 0.205, 0.04, 'basket_rim', n=8)
    back_straps(f, strap_z)


def cape(f):
    box(f, (0, 0.88, 0), (0.86, 0.3, 0.48), 'hood', bev=0.04, top=0.62, topz=0.8)


def log_bundle(f):
    for y, z in ((0.78, -0.235), (0.78, -0.365), (0.905, -0.235), (0.905, -0.365), (1.03, -0.3)):
        cyl(f, (0, y, z), 0.066, 0.64, 'bark', n=6, axis='x', cap='endgrain')
    for sx in (-1, 1):
        beam(f, (sx * 0.24, 1.0, -0.44), (-sx * 0.24, 0.72, -0.44), 0.03, 'rope')


def coat(f, open_front=False):
    box(f, (0, 0.66, 0), (0.56, 0.68, 0.38), 'coat', bev=0.04, top=0.88)
    box(f, (0, 0.995, -0.01), (0.44, 0.07, 0.34), 'coat_cuff', bev=0.02)
    if open_front:
        box(f, (0, 0.62, 0.19), (0.11, 0.56, 0.012), 'tunic')


def rope_sash(f):
    beam(f, (-0.2, 0.96, 0.178), (0.21, 0.5, 0.198), 0.035, 'rope', d=0.025)
    beam(f, (-0.2, 0.96, -0.178), (0.21, 0.5, -0.198), 0.035, 'rope', d=0.025)


def net_bag(f):
    box(f, (0.05, 0.6, -0.235), (0.3, 0.44, 0.1), 'net', bev=0.04, top=1.15, bot=0.6)
    box(f, (0.05, 0.83, -0.235), (0.36, 0.035, 0.12), 'rope')


def robe(f):
    box(f, (0, 0.54, 0), (0.58, 0.96, 0.44), 'robe', bev=0.04, top=0.82)
    box(f, (0, 0.09, 0), (0.6, 0.06, 0.455), 'robe_trim')
    box(f, (0, 0.58, 0), (0.535, 0.07, 0.41), 'rune_band')
    box(f, (0.1, 0.36, 0.212), (0.085, 0.4, 0.02), 'rune_band')
    box(f, (0.1, 0.36, 0.224), (0.03, 0.34, 0.006), 'rune')
    box(f, (-0.12, 0.58, 0.208), (0.16, 0.02, 0.006), 'rune')


def mantle(f):
    box(f, (0, 0.9, 0), (0.84, 0.26, 0.5), 'cloak', bev=0.04, top=0.62, topz=0.8)
    box(f, (0, 0.785, 0), (0.855, 0.035, 0.515), 'robe_trim')
    box(f, (0, 0.5, -0.24), (0.58, 0.88, 0.05), 'cloak', bot=1.08)


def tool(f, role, sex):
    """Work tool hanging from the hand in the rest pose (the game hides it unless working)."""
    sx0 = shoulder_x(sex)
    hx = sx0 + 0.02
    f.tag('Tool', (sx0, SHOULDER_Y, 0))
    if role == 'builder':
        beam(f, (hx, 0.55, 0.07), (hx, 0.14, 0.07), 0.045, 'wood')
        box(f, (hx, 0.1, 0.07), (0.09, 0.09, 0.22), 'iron', bev=0.012)
    elif role == 'farmer':
        beam(f, (hx, 0.62, 0.06), (hx, -0.36, 0.06), 0.045, 'wood')
        # Blade toward -z: the hoeing pose swings it down and back toward the worker.
        box(f, (hx, -0.37, -0.02), (0.15, 0.035, 0.17), 'steel', botz=1.0, topz=1.0)
    elif role == 'woodcutter':
        beam(f, (hx, 0.56, 0.07), (hx, -0.08, 0.07), 0.05, 'wood')
        # Edge toward -z: the strike half of the chop swings the head that way.
        box(f, (hx, -0.04, -0.01), (0.04, 0.17, 0.16), 'steel', bot=1.0, botz=1.25)
    elif role == 'fisherman':
        beam(f, (hx, 0.52, 0.06), (hx, -0.2, 1.2), 0.035, 'wood')


def staff(f, sex):
    """The priest's forked staff, always in hand (the game hides it while praying)."""
    sx0 = shoulder_x(sex)
    hx = sx0 + 0.02
    f.tag('Staff', (sx0, SHOULDER_Y, 0))
    beam(f, (hx, 0.03, 0.05), (hx + 0.02, 1.58, 0.05), 0.05, 'staff')
    beam(f, (hx + 0.02, 1.52, 0.05), (hx - 0.05, 1.76, 0.05), 0.04, 'staff')
    beam(f, (hx + 0.02, 1.55, 0.05), (hx + 0.1, 1.72, 0.05), 0.035, 'staff')


# ---------------------------------------------------------------- the twelve figures


def figure(role, sex):
    f = Figure()
    fem = sex == 'f'
    wool = 'wool'
    torso = (0, HIP_Y, 0)
    if role == 'builder':
        legs(f, wool if fem else 'trousers_blue', 'boots_red' if fem else 'boots', None if fem else 'boot_cuff')
        f.tag('Torso', torso)
        if fem:
            dress(f)
            belt(f, 0.63, 0.485, 0.37)
            box(f, (0, 0.8, 0.183), (0.28, 0.3, 0.025), 'leather')
            box(f, (0, 0.44, 0.197), (0.38, 0.4, 0.025), 'leather', bot=1.1)
            box(f, (0.08, 0.5, 0.213), (0.14, 0.1, 0.012), 'belt')
        else:
            tunic(f)
            belt(f, 0.56, 0.515, 0.34)
            box(f, (0, 0.79, 0.163), (0.3, 0.34, 0.025), 'leather')
            box(f, (0, 0.45, 0.172), (0.42, 0.34, 0.025), 'leather', bot=1.06)
            box(f, (0.08, 0.5, 0.19), (0.14, 0.1, 0.012), 'belt')
        arms(f, sex, 'cream' if fem else 'tunic', 'cream' if fem else 'skin')
        head(f)
        if fem:
            hair_bob(f)
            cap(f, 'coif')
        else:
            hair_under_hat(f)
            cap(f, 'cap')
        tool(f, role, sex)
    elif role == 'farmer':
        legs(f, wool if fem else 'trousers_brown', 'boots_red' if fem else 'boots', None if fem else 'boot_cuff')
        f.tag('Torso', torso)
        if fem:
            dress(f)
            belt(f, 0.63, 0.485, 0.37)
            box(f, (0, 0.42, 0.197), (0.36, 0.42, 0.025), 'apron', bot=1.1)
        else:
            tunic(f)
            belt(f, 0.565, 0.52, 0.345, 'sash', h=0.09)
            box(f, (0.13, 0.46, 0.176), (0.07, 0.14, 0.02), 'sash', bot=1.2)
        basket(f, 0.178 if fem else 0.163)
        arms(f, sex, 'cream' if fem else 'tunic', 'cream')
        head(f)
        if fem:
            hair_long(f)
        else:
            hair_under_hat(f)
        straw_hat(f)
        tool(f, role, sex)
    elif role == 'idler':
        legs(f, wool if fem else 'trousers_dark', 'boots_brown', None if fem else 'boot_cuff')
        f.tag('Torso', torso)
        if fem:
            dress(f)
            straps(f)
            belt(f, 0.63, 0.485, 0.37, buckle=True)
            box(f, (0, 0.15, 0), (0.47, 0.06, 0.37), 'cream')
        else:
            tunic(f)
            belt(f, 0.56, 0.515, 0.34, buckle=True)
            box(f, (0, 0.4, 0), (0.53, 0.06, 0.345), 'cream')
        arms(f, sex, 'cream' if fem else 'tunic', 'cream')
        head(f)
        if fem:
            headscarf(f)
            braid_back(f)
            fringe(f)
        else:
            hair_short(f)
            beard(f)
    elif role == 'woodcutter':
        legs(f, wool if fem else 'trousers_dark', 'boots_brown', None if fem else 'apron')
        f.tag('Torso', torso)
        if fem:
            dress(f)
            belt(f, 0.63, 0.485, 0.37)
            box(f, (0, 0.42, 0.197), (0.34, 0.42, 0.025), 'apron', bot=1.1)
        else:
            tunic(f, hem=0.36)
            belt(f, 0.56, 0.515, 0.34)
        cape(f)
        log_bundle(f)
        arms(f, sex, 'cream' if fem else 'tunic', 'cream', 'mitten_red' if fem else 'mitten', mitten=True)
        head(f)
        hood(f, 'hood')
        if fem:
            braids(f, z=0.24, sides=False)
        else:
            beard(f)
        tool(f, role, sex)
    elif role == 'fisherman':
        legs(f, wool if fem else 'trousers_dark', 'boots', 'boot_cuff', tall=True)
        f.tag('Torso', torso)
        if fem:
            dress(f)
        coat(f, open_front=fem)
        rope_sash(f)
        net_bag(f)
        arms(f, sex, 'coat', 'coat', 'mitten_red', cuff='coat_cuff', mitten=True)
        head(f)
        if fem:
            braids(f, z=0.215)
            beanie(f, 'knit_slate')
        else:
            hair_under_hat(f)
            beanie(f, 'knit')
            beard(f)
        tool(f, role, sex)
    elif role == 'priest':
        legs(f, wool, 'boots_brown')
        f.tag('Torso', torso)
        robe(f)
        mantle(f)
        arms(f, sex, 'robe', 'robe', cuff='robe_trim')
        head(f)
        hood(f, 'cloak')
        if fem:
            braids(f, z=0.24, sides=False)
        else:
            beard(f, long=True)
        staff(f, sex)
    return f


# ---------------------------------------------------------------- Blender objects, export, preview


def gb(v):
    """Figure space (+Y up, facing +Z) to Blender (+Z up, facing -Y); glTF export maps it back."""
    return Vector((v[0], -v[2], v[1]))


def materials():
    out = {}
    for name, hexv in PALETTE.items():
        mname = 'villager_' + name
        m = bpy.data.materials.get(mname) or bpy.data.materials.new(mname)
        col = (*lin(hexv), 1.0)
        m.diffuse_color = col
        if not m.node_tree:
            m.use_nodes = True
        nodes = m.node_tree.nodes
        bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if bsdf is None:
            bsdf = nodes.new('ShaderNodeBsdfPrincipled')
            out_node = next(n for n in nodes if n.type == 'OUTPUT_MATERIAL')
            m.node_tree.links.new(bsdf.outputs[0], out_node.inputs[0])
        bsdf.inputs['Base Color'].default_value = col
        bsdf.inputs['Roughness'].default_value = 1.0
        out[name] = m
    return out


def to_blender(fig, name, at, mats, coll):
    root = bpy.data.objects.new(name, None)
    root.location = at
    coll.objects.link(root)
    for part, p in fig.parts.items():
        piv = gb(p['pivot'])
        used = sorted(set(p['m']), key=p['m'].index)
        index = {n: i for i, n in enumerate(used)}
        me = bpy.data.meshes.new(f'{name}_{part}')
        me.from_pydata([gb(v) - piv for v in p['v']], [], p['f'])
        for n in used:
            me.materials.append(mats[n])
        for poly, m in zip(me.polygons, p['m']):
            poly.material_index = index[m]
        me.update()
        ob = bpy.data.objects.new(f'{name}_{part}', me)
        ob.parent = root
        ob.location = piv
        ob['part'] = part
        ob['pivot'] = [round(x, 4) for x in p['pivot']]
        coll.objects.link(ob)
    return root


SPACING = 1.3


def make():
    """Build all twelve figures in one row (role-major, man then woman) in collection `villagers`."""
    for name in ('Cube', 'Light', 'Camera'):  # factory-startup scene
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    coll = bpy.data.collections.get('villagers')
    if coll:
        for o in list(coll.all_objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        coll = bpy.data.collections.new('villagers')
        bpy.context.scene.collection.children.link(coll)
    mats = materials()
    roots, tris = [], {}
    for r, role in enumerate(ROLES):
        for s, sex in enumerate(SEXES):
            name = f'villager_{role}_{sex}'
            fig = figure(role, sex)
            tris[name] = sum(len(face) - 2 for p in fig.parts.values() for face in p['f'])
            roots.append(to_blender(fig, name, ((r * 2 + s) * SPACING, 0, 0), mats, coll))
    return coll, roots, tris


def export(coll, path):
    bpy.ops.object.select_all(action='DESELECT')
    for o in coll.all_objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True, export_extras=True, export_yup=True,
        export_texcoords=False, export_normals=True, export_materials='EXPORT', export_cameras=False,
        export_lights=False, export_animations=False,
    )


def preview(path, views=('front', 'back', 'side')):
    """EEVEE renders of the row in two halves: front (as in the sheets), back, and a three-quarter view."""
    sc = bpy.context.scene
    width = 6 * SPACING
    sun = bpy.data.objects.new('prev_sun', bpy.data.lights.new('prev_sun', 'SUN'))
    sc.collection.objects.link(sun)
    sun.data.energy = 3.5
    sun.data.angle = math.radians(6)
    sun.rotation_euler = (math.radians(50), 0, math.radians(-25))
    if not sc.world:
        sc.world = bpy.data.worlds.new('prev_world')
    if not sc.world.node_tree:
        sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1.0)
    bg.inputs['Strength'].default_value = 0.9
    me = bpy.data.meshes.new('prev_ground')
    me.from_pydata([(-20, -20, 0), (40, -20, 0), (40, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
    ground = bpy.data.objects.new('prev_ground', me)
    sc.collection.objects.link(ground)
    gm = bpy.data.materials.new('prev_ground')
    gm.diffuse_color = (0.55, 0.55, 0.52, 1)
    me.materials.append(gm)
    cam = bpy.data.objects.new('prev_cam', bpy.data.cameras.new('prev_cam'))
    sc.collection.objects.link(cam)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = width + 0.2
    sc.camera = cam
    sc.render.engine = 'BLENDER_EEVEE'
    sc.view_settings.view_transform = 'Standard'
    sc.render.resolution_x = 2400
    sc.render.resolution_y = 600
    for half in (0, 1):
        target = Vector(((half * 6 + 2.5) * SPACING, 0, 0.9))
        for view in views:
            az = {'front': 0.0, 'back': 180.0, 'side': 35.0}[view]
            g = math.radians(az)
            fwd = Vector((-math.sin(g), math.cos(g), 0))
            cam.location = target - fwd * 12
            cam.rotation_euler = (math.radians(90), 0, g)
            sc.render.filepath = os.path.join(path, f'villagers_{view}_{half}.png')
            bpy.ops.render.render(write_still=True)


def main(argv):
    args = argv[argv.index('--') + 1:] if '--' in argv else []
    opts = dict(zip(args[::2], args[1::2]))
    coll, roots, tris = make()
    for name, n in tris.items():
        print('TRIS', name, n)
    if '--glb' in opts:
        export(coll, opts['--glb'])
        print('EXPORTED', opts['--glb'])
    if '--blend' in opts:
        bpy.ops.wm.save_as_mainfile(filepath=opts['--blend'])
    if '--preview' in opts:
        preview(opts['--preview'])


if __name__ == '__main__':
    main(sys.argv)
