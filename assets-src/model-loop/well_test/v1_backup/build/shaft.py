"""Group 'shaft': round dry-stone well shaft from the 'stone' variants (linked duplicates).
build(seed) -> G_shaft. Stones keep their convex front (-Y local) facing outward."""
import math
import random

import bmesh
import bpy

# judge r01: joints 2x too wide, slots between courses, stones identical and too square
# judge r02: random tilts/jut overdone, slits between stones, too squat
# judge r03: course lines must run continuous (beds +-0.5 cm), tilts +-1.5, a rim stone jutted,
#            black slits -> dark-grey core behind the stones, diameter 1.75 -> 1.70
# judge r04: half bond (joints >= 35 % apart), less overlap (jagged tears), core darker and recessed
# judge r05 (group scope only; the stone is frozen): outer joints <= 1 cm (size stones at the outer face),
# one long stone ~1.3x per course, core lifted from black to dark grey
P = dict(outer_r=0.815, per_course=13, courses=3, outer_gap=0.008, course_gap=-0.01, z_scale=0.97,
         width_jit=0.05, long_stone=1.3, long_at=4, height_jit=0.02, yaw_jit=1.0, tilt_jit=1.0, radial_jit=0.006,
         mirror=0.5, core_inset=0.085, core_col=(0.06, 0.057, 0.06, 1))
VARIANTS = ("stone_a", "stone_b", "stone_c")


def _core(g, r_out, r_in, height):
    """Dark mortar tube behind the stones, so joints read as dark grey grooves, not black slits."""
    old = bpy.data.objects.get("shaft_core")
    if old:
        bpy.data.objects.remove(old)
    bm = bmesh.new()
    for r, flip in ((r_out, False), (r_in, True)):
        res = bmesh.ops.create_cone(bm, cap_ends=False, segments=48, radius1=r, radius2=r, depth=height)
        bmesh.ops.translate(bm, verts=res["verts"], vec=(0, 0, height / 2))
        if flip:
            bmesh.ops.reverse_faces(bm, faces=list({f for v in res["verts"] for f in v.link_faces}))
    me = bpy.data.meshes.new("shaft_core")
    bm.to_mesh(me)
    bm.free()
    mat = bpy.data.materials.get("M_core") or bpy.data.materials.new("M_core")
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = P["core_col"]
    bsdf.inputs["Roughness"].default_value = 0.95
    me.materials.append(mat)
    ob = bpy.data.objects.new("shaft_core", me)
    g.objects.link(ob)


def build(seed=7, col="G_shaft"):
    rnd = random.Random(seed)
    g = bpy.data.collections.get(col)
    if g is None:
        g = bpy.data.collections.new(col)
        bpy.context.scene.collection.children.link(g)
    for o in list(g.objects):
        bpy.data.objects.remove(o)
    n = P["per_course"]
    z = 0.0
    d_max = 0.0
    for c in range(P["courses"]):
        # alternate +/- so the joints don't drift: half bond holds all the way round
        weights = [1 + (1 if k % 2 else -1) * rnd.uniform(0.3, 1) * P["width_jit"] for k in range(n)]
        weights[P["long_at"]] = P["long_stone"]  # same slot every course: the half bond survives
        total = sum(weights)
        start = (c % 2) * math.pi / n  # exact half-bond stagger between courses
        course_h = 0.0
        acc = 0.0
        for i, wt in enumerate(weights):
            span = 2 * math.pi * wt / total
            ang = start + acc + span / 2
            acc += span
            src = bpy.data.objects[rnd.choice(VARIANTS)]
            w, d, h = src.dimensions
            d_max = max(d_max, d)
            r_mid = P["outer_r"] - d / 2 + rnd.uniform(-1, 1) * P["radial_jit"]
            sx = (span * P["outer_r"] - P["outer_gap"]) / w  # outer faces fill the ring: ~1 cm joints
            sz = P["z_scale"] * rnd.uniform(1 - P["height_jit"], 1 + P["height_jit"])
            o = bpy.data.objects.new(f"shaft_c{c}_{i:02d}", src.data)  # linked: fixing the stone fixes the shaft
            o.location = (r_mid * math.cos(ang), r_mid * math.sin(ang), z)
            o.rotation_euler = (math.radians(rnd.uniform(-1, 1) * P["tilt_jit"]),
                                math.radians(rnd.uniform(-1, 1) * P["tilt_jit"]),
                                ang + math.pi / 2 + math.radians(rnd.uniform(-1, 1) * P["yaw_jit"]))
            o.scale = (sx * (-1 if rnd.random() < P["mirror"] else 1), 1.0, sz)
            g.objects.link(o)
            course_h = max(course_h, h * P["z_scale"])
        z += course_h + P["course_gap"]
    _core(g, P["outer_r"] - P["core_inset"], P["outer_r"] - d_max + P["core_inset"], z - 0.02)
    return g
