"""Part 'timber': squared dark reddish-brown beam (posts, braces, tie beams, bargeboards).
build(name, seed, dims) -> object in P_timber. Length along X (wood grain follows X).

Built like the approved plank (build order: chamfer -> segment loops/grooves -> bend -> chisel):
  1. box with a flat 1-segment chamfer on the long edges, smaller on the end edges
  2. lengthwise segments; two V-grooves on each side face (three-board look), one on top and bottom
  3. slight sag and twist
  4. chisel: planar V-chips along all four long edges, one EXACT boolean (use_self: chips overlap)
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

# judge r03: dead-straight beam (no sag, tiny twist, 1.5 mm hew); chips shade soft (sharp only above 40 deg: chamfers stay crisp)
# judge r02: grooves higher (bands widen downward), 1-2 chips per edge, slower 3 mm undulation
# judge r01: flat 45 deg chamfers 1.5-2 cm also on the end edges; chips 2-4 per edge, uneven, untouched stretches;
# faces hand-hewn (1-2 mm wave); chamfer faces tagged 'edge' for a faint highlight
P = dict(chamfer=0.016, segments=12, groove_half=0.004, groove_depth=0.004,
         side_grooves=(0.45, 0.73), top_groove=0.25, sag=0.0, twist_deg=0.3, hew=0.0015,
         chips_per_edge=(1, 2), chip_gap=0.4, chip_depth=(0.005, 0.009), chip_yaw=(8.0, 14.0),
         chip_roll=(-12.0, 12.0), sharp_deg=40.0)  # 45 deg chamfers crisp, shallow chip creases soft

# v2 (user, 2026-10-31): the beams are too straight, the reference's are hand-hewn and slightly crooked. timber_a/_b stay as accepted (straight,
# not rebuilt: their seeds were not kept). timber_c..f are new variants, each with its own small deformation, in metres over the 1 m part
# (the groups stretch the length, so the same bow gets gentler on a long post):
#   bow_y / bow_z: parabolic bow sideways / up (sag < 0), s_y / s_z: S-curve (zero at both ends), twist_deg: end-to-end twist,
#   taper: section change from -x to +x (fraction), wander: slow 2-3 undulations (m), hew: faster 15 cm hand-hewn wave (m)
VARIANTS = {
    "timber_c": dict(seed=11, bow_y=0.022, bow_z=-0.008, twist_deg=2.0, taper=-0.06, wander=0.005, hew=0.003, segments=16),
    "timber_d": dict(seed=12, bow_y=-0.016, s_z=0.014, twist_deg=-1.6, taper=0.05, wander=0.004, hew=0.003, segments=16),
    "timber_e": dict(seed=13, bow_z=-0.018, bow_y=0.010, twist_deg=1.0, wander=0.007, hew=0.0025, segments=16),
    "timber_f": dict(seed=14, s_y=0.018, bow_z=-0.006, twist_deg=-2.2, taper=-0.04, wander=0.004, hew=0.003, segments=16),
}
# first pass was about 2/3 of these (c: bow_y .014, d: s_z .010, e: bow_z -.012, f: s_y .012): too subtle on the stretched posts


def _all(bm):
    return bm.verts[:] + bm.edges[:] + bm.faces[:]


def _rot(v, axis, deg):
    return Matrix.Rotation(math.radians(deg), 3, Vector(axis).normalized()) @ Vector(v)


def _groove(bm, axis, value, half, depth, keep):
    """Cut a V-groove along X: rim loops at value +- half, the middle loop pushed in by depth (only where keep(v))."""
    for off in (-half, half):
        co = [0, 0, 0]
        co[axis] = value + off
        no = [0, 0, 0]
        no[axis] = 1
        bmesh.ops.bisect_plane(bm, geom=_all(bm), plane_co=co, plane_no=no)
    co = [0, 0, 0]
    co[axis] = value
    no = [0, 0, 0]
    no[axis] = 1
    res = bmesh.ops.bisect_plane(bm, geom=_all(bm), plane_co=co, plane_no=no)
    moved = set()
    for v in [g for g in res["geom_cut"] if isinstance(g, bmesh.types.BMVert)]:
        d = keep(v)
        if d is not None:
            v.co += d * depth
            moved.add(v)
    return moved


def _chisel(ob, rnd, L, W, H):
    me = ob.data
    co = [v.co.copy() for v in me.vertices]
    cut = bmesh.new()
    for sy in (-1, 1):
        for sz in (0, 1):
            n0 = Vector((0, sy, 1 if sz else -1)).normalized()
            xs, want = [], rnd.randint(*P["chips_per_edge"])
            for _ in range(60):  # 2-4 chips per edge, spaced apart: untouched stretches between them
                x = rnd.uniform(-L / 2 + 0.05, L / 2 - 0.05)
                if all(abs(x - o) > P["chip_gap"] for o in xs):
                    xs.append(x)
                if len(xs) == want:
                    break
            for x in xs:
                p = Vector((x, sy * W / 2, H if sz else 0.0))
                n = _rot(n0, (1, 0, 0), rnd.uniform(*P["chip_roll"]))
                near = [c for c in co if (c - p).length < 0.05]
                if not near:
                    continue
                q = max(near, key=lambda c: c.dot(n)) - n * rnd.uniform(*P["chip_depth"])
                side = Vector((1, 0, 0)).cross(n)
                yaw = rnd.uniform(*P["chip_yaw"])
                res = bmesh.ops.create_cube(cut, size=0.16)
                verts = res["verts"]
                bmesh.ops.translate(cut, verts=verts, vec=p)
                for m in (_rot(n, side, yaw), _rot(n, side, -yaw)):
                    faces = list({f for v in verts if v.is_valid for f in v.link_faces})
                    geom = list({v for f in faces for v in f.verts}) + list({e for f in faces for e in f.edges}) + faces
                    res = bmesh.ops.bisect_plane(cut, geom=geom, plane_co=q, plane_no=m, clear_inner=True)
                    loop = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and e.is_valid]
                    if loop:
                        bmesh.ops.edgeloop_fill(cut, edges=loop)
                    verts = [v for v in res["geom"] if isinstance(v, bmesh.types.BMVert) and v.is_valid]
    bmesh.ops.recalc_face_normals(cut, faces=cut.faces[:])
    cme = bpy.data.meshes.new(ob.name + "_chisel")
    cut.to_mesh(cme)
    cut.free()
    cutter = bpy.data.objects.new(ob.name + "_chisel", cme)
    bpy.context.scene.collection.objects.link(cutter)
    boo = ob.modifiers.new("Chisel", "BOOLEAN")
    boo.operation, boo.solver, boo.object = "DIFFERENCE", "EXACT", cutter
    boo.use_self, boo.use_hole_tolerant = True, True
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    bpy.data.objects.remove(cutter)
    bpy.data.meshes.remove(cme)
    old = ob.data
    ob.data = new
    bpy.data.meshes.remove(old)
    new.name = ob.name
    bm = bmesh.new()
    bm.from_mesh(new)
    for e in bm.edges:
        e.smooth = not (e.is_manifold and e.calc_face_angle(0) > math.radians(P["sharp_deg"]))
    bm.to_mesh(new)
    bm.free()


def build(name="timber_a", seed=1, dims=(1.0, 0.16, 0.16), col="P_timber"):
    var = VARIANTS.get(name, {})
    seed = var.get("seed", seed)
    K = {**P, **dict(bow_y=0.0, bow_z=0.0, s_y=0.0, s_z=0.0, taper=0.0, wander=0.0), **{k: v for k, v in var.items() if k != "seed"}}
    rnd = random.Random(seed)
    L, W, H = dims
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * L, v.co.y * W, v.co.z * H + H / 2))
    # 1. flat 45 deg chamfers on all twelve edges of the simple box (tagged 'edge' for the faint highlight)
    res = bmesh.ops.bevel(bm, geom=bm.edges[:], offset=P["chamfer"], segments=1, affect="EDGES", clamp_overlap=False)
    lay = bm.faces.layers.float.get("edge") or bm.faces.layers.float.new("edge")
    for f in res["faces"]:
        if f.is_valid:
            f[lay] = 1.0
    # 2. segments and grooves
    for i in range(1, K["segments"]):
        bmesh.ops.bisect_plane(bm, geom=_all(bm), plane_co=(-L / 2 + L * i / K["segments"], 0, 0), plane_no=(1, 0, 0))
    groove = set()
    inside = lambda v: abs(v.co.x) < L / 2 - 0.02  # noqa: E731  grooves fade out before the ends
    for f in P["side_grooves"]:
        groove |= _groove(bm, 2, H * f, P["groove_half"], P["groove_depth"],
                          lambda v: Vector((0, -1 if v.co.y > 0 else 1, 0)) if abs(abs(v.co.y) - W / 2) < 1e-5 and inside(v) else None)
    groove |= _groove(bm, 1, W * P["top_groove"], P["groove_half"], P["groove_depth"],
                      lambda v: Vector((0, 0, -1 if v.co.z > H / 2 else 1)) if (abs(v.co.z - H) < 1e-5 or abs(v.co.z) < 1e-5) and inside(v) else None)
    # 3. sag, twist and a hand-hewn wave on the long faces
    ph = rnd.uniform(0, 6.28)
    ph2 = rnd.uniform(0, 6.28)
    for v in bm.verts:
        t = v.co.x / (L / 2)
        v.co.y += K["hew"] * math.sin(v.co.x * 7 + ph) * (1 if v.co.y > 0 else -1)  # slow 30-50 cm undulation
        v.co.z += K["hew"] * math.sin(v.co.x * 6 + ph * 1.3) * (1 if v.co.z > H / 2 else -1)
        if K["taper"]:  # section grows / shrinks towards +x
            s = 1 + K["taper"] * t
            v.co.y *= s
            v.co.z = (v.co.z - H / 2) * s + H / 2
        v.co.z -= K["sag"] * (1 - t * t)
        a = math.radians(K["twist_deg"]) * t
        y, z = v.co.y, v.co.z - H / 2
        v.co.y, v.co.z = y * math.cos(a) - z * math.sin(a), y * math.sin(a) + z * math.cos(a) + H / 2
        # whole-beam deformation: the centre line moves, the section keeps its shape
        v.co.y += K["bow_y"] * (1 - t * t) + K["s_y"] * math.sin(math.pi * t) + K["wander"] * math.sin(2.5 * math.pi * t + ph2)
        v.co.z += K["bow_z"] * (1 - t * t) + K["s_z"] * math.sin(math.pi * t) + K["wander"] * math.sin(2.0 * math.pi * t + ph)
    for f in bm.faces:
        f.smooth = True
    zmin = min(v.co.z for v in bm.verts)
    for v in bm.verts:
        v.co.z -= zmin
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.data.collections[col].objects.link(ob)
    # 4. chisel the long edges
    _chisel(ob, rnd, L, W, H)
    mat = bpy.data.materials.get("M_timber") or bpy.data.materials.new("M_timber")
    ob.data.materials.clear()  # the exact boolean leaves an empty first slot that the faces use (renders white)
    ob.data.materials.append(mat)
    return ob
