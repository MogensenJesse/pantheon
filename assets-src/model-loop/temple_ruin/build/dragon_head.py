"""Part 'dragon_head': carved dragon-head finial in weathered timber (r03, judge 3.1): a compact head (~0.25 m, village HEAD_DRAGON profile) that is the
intersection of its side profile and a tapering top profile (cheek bulge, narrow snout), a notch splitting the swept-back ear into two horns, fangs in
the open mouth, small mane wedges on the neck, and a wide flat neck board (0.17 wide, 5.5 cm thick, leaning) with a raised border and a 2-strand interlace.
The profile is (t along the board, m across it) in board units; here t is the horizontal reach and m the height."""
import math

import bmesh
import bpy
from mathutils import Vector

import paint
import shapes
from tcommon import collection, drop, finish_mesh, set_materials, timber_mat

HEAD_DRAGON = [(0.22, 0.19), (0.4, 0.28), (0.52, 0.55), (0.66, 0.30), (0.95, 0.24), (1.15, 0.27), (1.38, 0.18), (1.5, 0.06),
               (1.44, -0.02), (1.05, -0.03), (1.4, -0.2), (1.36, -0.3), (1.0, -0.28), (0.7, -0.2), (0.45, -0.26), (0.2, -0.2)]
TOP = [(0.15, 0.16), (0.45, 0.24), (0.7, 0.27), (1.0, 0.2), (1.3, 0.11), (1.5, 0.07)]  # half-width of the head seen from above, in profile units
S = 0.18
VARIANTS = {"dragon_head": dict(seed=141, lean=62.0, plank_len=0.58, half=0.075, thick=0.055)}


def _obj(bm, name):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def _bool(a, b, op):
    mod = a.modifiers.new("b", "BOOLEAN")
    mod.operation, mod.solver, mod.object = op, "EXACT", b
    mod.use_hole_tolerant = True
    with bpy.context.temp_override(object=a, active_object=a, selected_objects=[a]):
        bpy.ops.object.modifier_apply(modifier="b")
    me = b.data
    bpy.data.objects.remove(b)
    bpy.data.meshes.remove(me)


def _prism_top(pts, z0, z1):
    """The outline `pts` [(x, half_width)] mirrored into a closed polygon, as a prism along Z."""
    poly = [(x * S, w * S) for x, w in pts] + [(x * S, -w * S) for x, w in pts[::-1]]
    bm = bmesh.new()
    lo = [bm.verts.new((x, y, z0)) for x, y in poly]
    hi = [bm.verts.new((x, y, z1)) for x, y in poly]
    faces = [bm.faces.new(lo[::-1]), bm.faces.new(hi)]
    for i in range(len(poly)):
        j = (i + 1) % len(poly)
        faces.append(bm.faces.new((lo[i], lo[j], hi[j], hi[i])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return bm


def build_all():
    for name, v in VARIANTS.items():
        drop(name)
        # head = side profile x top profile
        side = bmesh.new()
        shapes.extrude_profile(side, HEAD_DRAGON, 0.3, scale=S)
        head = _obj(side, name + "_head")
        _bool(head, _obj(_prism_top(TOP, -0.5, 0.5), "top"), "INTERSECT")
        # neck board (broad faces towards -Y), leaning forward, its top end buried in the head
        extra = bmesh.new()
        ang = math.radians(v["lean"])
        d, nrm = (math.cos(ang), math.sin(ang)), (-math.sin(ang), math.cos(ang))
        top, ln, w = (0.32 * S, -0.03), v["plank_len"], v["half"]
        bot = (top[0] - d[0] * ln, top[1] - d[1] * ln)
        plank = [(bot[0] + nrm[0] * w, bot[1] + nrm[1] * w), (top[0] + nrm[0] * w, top[1] + nrm[1] * w), (top[0] - nrm[0] * w, top[1] - nrm[1] * w),
                 (bot[0] - nrm[0] * w, bot[1] - nrm[1] * w)]
        shapes.extrude_profile(extra, plank, v["thick"])
        for sy in (-1, 1):  # fangs: two hanging from the upper jaw, one rising from the lower jaw, each side of the mouth
            for tri in (((1.28, -0.03), (1.38, -0.03), (1.33, -0.14)), ((1.1, -0.03), (1.18, -0.03), (1.14, -0.12)), ((1.28, -0.2), (1.36, -0.2), (1.32, -0.1))):
                shapes.extrude_profile(extra, [(x, z) for x, z in tri], 0.03, origin=(0, sy * 0.034, 0), scale=S)
        for sy in (-1, 1):  # two horns: swept-back spikes rising from the ear
            shapes.extrude_profile(extra, [(0.5, 0.4), (0.72, 0.4), (0.34, 0.78), (0.16, 0.8)], 0.03, origin=(0, sy * 0.034, 0), scale=S)
        for k in range(3):  # mane: stepped wedges down the back of the neck
            ox = 0.1 - k * 0.1
            tri = [(ox * 1.0, 0.2 - k * 0.16), (ox - 0.2, 0.0 - k * 0.2), (ox + 0.02, -0.04 - k * 0.16)]
            shapes.extrude_profile(extra, tri, 0.05, scale=S)
        ex = _obj(extra, name + "_extra")
        _bool(head, ex, "UNION")
        # two horns: a slot through the middle of the ear; the eyes: a dent on each cheek
        paint.cut_boxes(head, [((0.55 * S, 0, 0.5 * S), (0.5 * S, 0.026, 0.5 * S), (0, 0, 0))] +
                        [((1.06 * S, sy * 0.2 * S, 0.19 * S), (0.1 * S, 0.1 * S, 0.1 * S), (0, 0, 0)) for sy in (-1, 1)])
        bm = bmesh.new()
        bm.from_mesh(head.data)
        bpy.data.objects.remove(head)
        zmin = min(vv.co.z for vv in bm.verts)
        bmesh.ops.translate(bm, vec=(0, 0, -zmin), verts=bm.verts[:])
        ob = finish_mesh(bm, name, "dragon_head", bevel=0.004, segs=1, flat=True, sharp_deg=45.0)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        # raised border and two-strand interlace on the board's broad -Y face (frame: along the board, across it, outward)
        c = Vector((top[0] - d[0] * ln / 2, -v["thick"] / 2, top[1] - d[1] * ln / 2 - zmin))
        U, V, N = (d[0], 0, d[1]), (nrm[0], 0, nrm[1]), (0, -1, 0)
        run = ln * 0.78
        for b in (-w * 0.82, w * 0.82):
            shapes.ribbon(bm, [(-run / 2, b), (run / 2, b)], 0.02, c, U, V, N, depth=0.012, sink=0.008)
        for k, dep in enumerate((0.014, 0.01)):
            pts = [(-run / 2 + run * i / 60, w * 0.42 * math.sin(math.tau * (run * i / 60) / 0.16 + k * math.pi)) for i in range(61)]
            shapes.ribbon(bm, pts, 0.026, c, U, V, N, depth=dep, sink=0.004 + 0.002 * k)
        bm.to_mesh(ob.data)
        bm.free()
        set_materials(ob, timber_mat(top_flat=False))
        paint.bites(ob, v["seed"], top=2, base=1, vertical=0, size=(0.015, 0.03))
    return list(VARIANTS)
