"""Part 'bark_limb': one gnarled root or limb of the ash, and the strand recipe every bigger piece of the tree (trunk strands, roots, limbs)
is swept with. A strand is a tube along a spline with an irregular polygon section that twists along its length; every quad is one bark
plate (flat-shaded, own value), the plate borders are thin chamfer strips painted dark (the painted seams of the reference), moss is paint on
up-facing plates. Variants lie along X on z = 0: a = S-curved root with three toes, b = straighter limb with a fork, c = short thick stub."""
import math
import random

import bmesh
from mathutils import Matrix, Vector

import tree_common as TC
from tcommon import drop, finish_mesh, set_materials

# r02 (own check of r01): the limb was twice too fat with 5 huge plates, moss covered whole plates in lime green, seen end-on
# r05 (judge r04, 5.6): plates were 15-25 cm squares -> rings 3.2 radii long and staggered per column; smooth tube -> 7 sides and a 2.8 cm
# radial step between rings; seams were never dark (see build()); S-curve halved, later taper, unequal toes, faceted end caps
# (first r05 try: ring 3.2, stagger 0.2, step 2.8 cm gave jagged shards and a straightened curve)
# r06 (judge r05, 5.3): the ring steps read as a chain of blocks -> no steps; every column has its own cross-seam offset instead, more vertex
# jitter; a taller section with a rising and falling centre line; blunt toes with a knee
# (own check of the first r06 try: 6 huge plates and no visible seams -> shorter rings; seams() below, 1.8 cm)
# r07 (judge r06, 5.1): slimmer monotonic taper, 9 sides (strips 0.4 x 0.1 m), seams on about half the strips, a real three-prong fork
P = dict(sides=9, ring=2.6, twist=0.5, jit_r=0.13, jit_s=0.1, stagger=0.4, step=0.0, col_var=0.14, seam=0.005, moss=0.77)

VARIANTS = {
    "bark_limb_a": dict(seed=3, pts=[(-1.5, 0.0, 0.2), (-1.0, 0.1, 0.2), (-0.5, 0.3, 0.15), (0.0, 0.0, 0.19), (0.45, -0.3, 0.12), (0.95, -0.18, 0.09), (1.35, 0.02, 0.04)],
                        radii=[0.19, 0.18, 0.165, 0.15, 0.13, 0.1, 0.04], tip=False,
                        toes=[(0.74, (0.5, -0.2, -0.02), 0.042), (0.88, (0.3, 0.16, -0.01), 0.04)]),  # a side rootlet with a knee, and the tip splits in two fingers
    "bark_limb_b": dict(seed=8, pts=[(-1.5, -0.15, 0.2), (-0.8, 0.12, 0.26), (-0.1, 0.0, 0.2), (0.6, -0.22, 0.16), (1.4, -0.3, 0.1)],
                        radii=[0.2, 0.185, 0.165, 0.13, 0.05], tip=False,
                        toes=[(0.55, (0.95, 0.6, 0.0), 0.09)]),
    "bark_limb_c": dict(seed=14, pts=[(-0.9, 0.05, 0.3), (-0.3, -0.14, 0.31), (0.35, 0.12, 0.26), (0.9, 0.0, 0.2)], radii=[0.29, 0.31, 0.24, 0.16], toes=[], tip=False, twist=0.9, ring=1.3),
}


def _spline(pts, n):
    """n + 1 points on a Catmull-Rom spline through pts."""
    pts = [Vector(p) for p in pts]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(n + 1):
        t = i / n * (len(pts) - 1)
        k = min(int(t), len(pts) - 2)
        u = t - k
        p0, p1, p2, p3 = ext[k], ext[k + 1], ext[k + 2], ext[k + 3]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3))
    return out


def strand(bm, pts, radii, seed=0, sides=None, ring=None, twist=None, tip=True, cap=True, step=None):
    """Sweep one strand into bm. pts: spline control points; radii: one per control point. `ring` is the plate length as a multiple of the
    mean radius, `twist` in radians per metre. The far end closes to a point (tip) or a faceted cap.
    `step` (metres): alternate ring segments sit that much further out, with a narrow step band between them (thick parts only). Returns the path samples (for toes)."""
    rnd = random.Random(seed)
    sides = sides or P["sides"]
    twist = P["twist"] if twist is None else twist
    step = P["step"] if step is None else step
    fine = _spline(pts, 200)
    length = sum((b - a).length for a, b in zip(fine, fine[1:]))
    rmean = sum(radii) / len(radii)
    n = max(3, round(length / ((ring or P["ring"]) * rmean)))
    path = _spline(pts, n)
    col_r = [1 + P["col_var"] * rnd.uniform(-1, 1) for _ in range(sides)]  # an irregular polygon section: flat planes of different width
    col_o = [P["stagger"] * rnd.uniform(-1, 1) for _ in range(sides)]  # where each column's cross seams sit: no seam runs round the limb
    col_a = [math.tau * (j + rnd.uniform(-0.22, 0.22)) / sides for j in range(sides)]
    tan0 = (path[1] - path[0]).normalized()
    nrm = tan0.cross(Vector((0, 0, 1)) if abs(tan0.z) < 0.9 else Vector((1, 0, 0))).normalized()
    rings, s = [], 0.0
    for k, c in enumerate(path):
        tan = (path[min(k + 1, n)] - path[max(k - 1, 0)]).normalized()
        nrm = (nrm - tan * nrm.dot(tan)).normalized()  # parallel transport
        bi = tan.cross(nrm)
        if k:
            s += (c - path[k - 1]).length
        t = k / n * (len(radii) - 1)
        i = min(int(t), len(radii) - 2)
        r = radii[i] + (radii[i + 1] - radii[i]) * (t - i)
        if tip and k == n:
            rings.append(bm.verts.new(c + tan * r * 0.6))
            break
        pos = []
        for j in range(sides):
            a = col_a[j] + twist * s
            rr = r * col_r[j] * (1 + P["jit_r"] * rnd.uniform(-1, 1))
            along = 0.0 if k in (0, n) else (col_o[j] + P["jit_s"] * rnd.uniform(-1, 1)) * (length / n)
            pos.append((c + tan * along, nrm * math.cos(a) + bi * math.sin(a), rr))
        off = lambda seg: (step / 2 if seg % 2 else -step / 2) if step and r > 0.1 else 0.0  # noqa: E731
        shut = [bm.verts.new(p + u * (rr + off(max(k - 1, 0)))) for p, u, rr in pos]  # closes segment k - 1
        if step and r > 0.1 and 0 < k < n:
            open_ = [bm.verts.new(p + u * (rr + off(k))) for p, u, rr in pos]  # opens segment k
            for j in range(sides):
                bm.faces.new((shut[j], shut[(j + 1) % sides], open_[(j + 1) % sides], open_[j]))
        else:
            open_ = shut
        rings.append((shut, open_, c, tan, r))
    apex = rings.pop() if tip else None
    for (_, a, *_x), (b, *_y) in zip(rings, rings[1:]):
        for j in range(sides):
            j2 = (j + 1) % sides
            bm.faces.new((a[j], a[j2], b[j2], b[j]))
    if tip:
        a = rings[-1][1]
        for j in range(sides):
            bm.faces.new((a[j], a[(j + 1) % sides], apex))

    def blunt(ring_v, c, out, r):  # a cut end: one inset ring pushed out, then the flat middle
        inner = [bm.verts.new(c + (v.co - c) * 0.62 + out * r * 0.38) for v in ring_v]
        for j in range(sides):
            bm.faces.new((ring_v[j], ring_v[(j + 1) % sides], inner[(j + 1) % sides], inner[j]))
        bm.faces.new(inner)

    if cap:
        blunt(rings[0][0], rings[0][2], -rings[0][3], rings[0][4])
    if not tip:
        blunt(rings[-1][1], rings[-1][2], rings[-1][3], rings[-1][4])
    return path


def seams(bm, width=None):
    """Bevel every crease into a strip tagged 'edge' (painted dark by bark_mat). finish_mesh's own bevel clamps to the shortest edge of the
    mesh (the toes: seams of a millimetre) and loses its tags when it has to create the layer, so the strand meshes do it here."""
    lay = bm.faces.layers.float.get("edge") or bm.faces.layers.float.new("edge")
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0015)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    creases = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > math.radians(3.0)]
    res = bmesh.ops.bevel(bm, geom=creases, offset=P["seam"] if width is None else width, segments=1, profile=0.5, affect="EDGES", clamp_overlap=False)
    rnd = random.Random(len(bm.faces))
    for f in res["faces"]:
        f[lay] = rnd.choice((1.0, 1.0, 0.6, 0.0, 0.0))  # r07: broken lines on about half the borders, not an ink outline


def build(name, seed, pts, radii, toes=(), tip=True, twist=None, moss=None, ring=None):
    bm = bmesh.new()
    strand(bm, pts, radii, seed=seed, tip=tip, twist=twist, ring=ring)
    fine = _spline(pts, 100)
    for i, (at, d, r) in enumerate(toes):  # a toe leaves the strand at fraction `at` of its length and runs along d (metres)
        p0 = fine[int(at * 100)]
        back = (fine[int(at * 100) - 6] - p0) * 0.6  # it starts inside the strand, so no gap shows at the joint
        d = Vector(d)
        mid = p0 + d * 0.6 + Vector((-d.y, d.x, 0)).normalized() * 0.09 + Vector((0, 0, 0.06))  # the knee
        strand(bm, [p0 + back, p0 + d * 0.15, mid, p0 + d], [r * 1.5, r * 1.25, r * 0.95, r * 0.6], seed=seed * 13 + i, sides=5, ring=2.0, twist=0.3, cap=False, step=0, tip=False)
    for v in bm.verts:  # it lies on the ground: nothing below z = 0
        v.co.z = max(v.co.z, 0.0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    seams(bm)
    ob = finish_mesh(bm, name, "bark_limb", bevel=0, flat=True)
    ob.data.transform(Matrix.Rotation(math.pi, 4, "Z"))  # thick end at +X: the reference shows the toes nearest the camera
    set_materials(ob, TC.bark_mat(moss=P["moss"] if moss is None else moss))
    return ob


def build_all():
    for name, v in VARIANTS.items():
        drop(name)
        build(name, v["seed"], v["pts"], v["radii"], toes=v["toes"], tip=v.get("tip", True), twist=v.get("twist"), ring=v.get("ring"))
    return list(VARIANTS)
