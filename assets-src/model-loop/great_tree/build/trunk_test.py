"""Method test for the trunk (not a judged node): the same braided skeleton built three ways, to choose how trunk and roots get made.
a = swept strands only (the bark_limb recipe; strands pass through each other)
b = sculpt-style: strands fused into one skin (voxel remesh), relaxed, collapsed to triangles, triangles paired into plates
c = sculpt-style with the plates following the strands: fused and relaxed like b, then QuadriFlow lays quads along the flow
All three get the same finish: flat plates, dark seam strips, bark material."""
import math
import random

import bmesh
import bpy
from mathutils import Vector

import bark_limb as BL
import tree_common as TC
from tcommon import collection, drop, finish_mesh, set_materials

COL = "trunk_test"
P = dict(voxel=0.05, relax=3, tris=2400, quads=1400, jitter=0.025, seam=0.012, moss=0.76)  # t02: less relaxing (t01's 8 passes melted the braid)


def skeleton(seed=5):
    """[(control points, radii)]: four strands braiding up to 3.6 m, each leaving as a limb with a cut end; two limbs fork."""
    rnd = random.Random(seed)
    out = []
    for i in range(6):  # t02: t01's four fat strands (r 0.5 on a 0.45 m helix) read as one column; now thinner, and wound both ways so they cross
        thick = i % 2 == 0
        th0 = math.tau * i / 6 + rnd.uniform(-0.2, 0.2)
        turns = (0.7 if thick else -0.6) + rnd.uniform(-0.08, 0.08)
        k = 1.0 if thick else 0.72
        pts, radii = [], []
        for z in (-0.4, 0.25, 0.9, 1.6, 2.3, 3.0, 3.6):
            t = max(z, 0.0) / 3.6
            rho = 1.25 - 0.75 * min(1.0, t * 2.2) + 0.15 * t + 0.1 * math.sin(3.1 * z + i) + (0.0 if thick else 0.16)  # wide at the foot, tight in the braid
            th = th0 + math.tau * turns * t
            pts.append((rho * math.cos(th), rho * math.sin(th), z))
            radii.append((0.44 - 0.14 * t) * k)
        th = th0 + math.tau * turns + rnd.uniform(-0.3, 0.3)
        o, up, base = Vector((math.cos(th), math.sin(th), 0)), Vector((0, 0, 1)), Vector(pts[-1])
        knee = base + o * 0.55 + up * 0.6
        pts += [tuple(knee), tuple(base + o * 1.2 + up * 1.1), tuple(base + o * 1.4 + up * 2.2)]
        radii += [0.27 * k, 0.22 * k, 0.17 * k]
        out.append((pts, radii))
        if i % 4 == 0:  # a fork: starts inside the limb, leaves sideways
            s = Vector((-o.y, o.x, 0)) * rnd.choice((-1, 1))
            out.append(([tuple(knee - o * 0.25 - up * 0.3), tuple(knee + s * 0.4 + up * 0.35), tuple(knee + s * 1.0 + up * 0.75), tuple(knee + s * 1.2 + up * 1.7)],
                        [0.26, 0.22, 0.18, 0.14]))
    return out


def _tubes(bm, smooth):
    """Sweep every strand into bm; `smooth` = round, unjittered tubes (the volume to fuse) instead of plated strands."""
    keep = dict(BL.P)
    if smooth:
        BL.P.update(jit_r=0.0, jit_s=0.0, col_var=0.0, stagger=0.0, step=0.0)
    for i, (pts, radii) in enumerate(skeleton()):
        BL.strand(bm, pts, radii, seed=40 + i, sides=12 if smooth else 8, tip=False)
    BL.P.update(keep)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def _mod(ob, kind, **props):
    m = ob.modifiers.new(kind, kind)
    for k, v in props.items():
        setattr(m, k, v)
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.modifier_apply(modifier=m.name)


def _fused():
    """The strands as one relaxed skin (temporary object)."""
    bm = bmesh.new()
    _tubes(bm, smooth=True)
    me = bpy.data.meshes.new("fuse")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("fuse", me)
    collection(COL).objects.link(ob)
    _mod(ob, "REMESH", mode="VOXEL", voxel_size=P["voxel"])
    _mod(ob, "SMOOTH", factor=0.5, iterations=P["relax"])  # melts the hard creases where strands meet into saddles
    return ob


def _finish(ob_or_bm, name, fill=True):
    if isinstance(ob_or_bm, bmesh.types.BMesh):
        bm = ob_or_bm
    else:
        bm = bmesh.new()
        bm.from_mesh(ob_or_bm.data)
        bpy.data.objects.remove(ob_or_bm)
    cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, -1), clear_outer=True)
    if fill:
        bmesh.ops.holes_fill(bm, edges=[e for e in cut["geom_cut"] if isinstance(e, bmesh.types.BMEdge)], sides=0)
    BL.seams(bm, P["seam"])
    ob = finish_mesh(bm, name, COL, bevel=0, flat=True)
    set_materials(ob, TC.bark_mat(moss=P["moss"]))
    return ob


def build_a(name):
    bm = bmesh.new()
    _tubes(bm, smooth=False)
    return _finish(bm, name, fill=False)


def build_b(name):
    ob = _fused()
    _mod(ob, "DECIMATE", decimate_type="COLLAPSE", ratio=P["tris"] / max(1, sum(len(p.vertices) - 2 for p in ob.data.polygons)))
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bpy.data.objects.remove(ob)
    bmesh.ops.join_triangles(bm, faces=bm.faces[:], angle_face_threshold=math.radians(30), angle_shape_threshold=math.radians(50))
    return _finish(bm, name)


def build_c(name):
    ob = _fused()
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob]):
        bpy.ops.object.quadriflow_remesh(mode="FACES", target_faces=P["quads"], use_mesh_symmetry=False, use_preserve_sharp=False, use_preserve_boundary=False, smooth_normals=False)
    rnd = random.Random(9)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bpy.data.objects.remove(ob)
    bm.normal_update()
    for v in bm.verts:  # uneven plates: every corner moves a little, mostly in and out
        v.co += v.normal * rnd.uniform(-1, 1) * P["jitter"] + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))) * P["jitter"] * 0.6
    return _finish(bm, name)


def build_all():
    out = []
    for key, fn in (("a", build_a), ("b", build_b), ("c", build_c)):
        name = "trunktest_" + key
        drop(name)
        ob = fn(name)
        print("@@TEST@@", name, len(ob.data.polygons), "faces")
        out.append(name)
    return out
