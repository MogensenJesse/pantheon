"""Shared helpers of the temple parts: paths, collections, the three materials, moss patches on facets, the well's stone recipe.
Moss is a second material slot on chosen facets (flat green patches that follow the facets, like the references), not a texture."""
import math
import random
import sys

import bmesh
import bpy

R = "D:/pantheon/assets-src/model-loop/temple_ruin"
S = "D:/pantheon/.claude/skills/model-loop/scripts"
WELL = "D:/pantheon/assets-src/model-loop/well_test/build"
for _p in (S, R + "/build", WELL):
    if _p not in sys.path:
        sys.path.insert(0, _p)
import loop_mat  # noqa: E402


def collection(part):
    """P_<part>, created under the scene if missing."""
    c = bpy.data.collections.get("P_" + part)
    if c is None:
        c = bpy.data.collections.new("P_" + part)
        bpy.context.scene.collection.children.link(c)
    return c


def drop(name):
    for o in [o for o in bpy.data.objects if o.name == name or o.name.startswith(name + ".")]:
        bpy.data.objects.remove(o)


def _rel(path):
    return bpy.path.relpath(R + "/" + path)


# Material knobs. Colours are tuned by measuring the render against the reference (see notes in scores.jsonl).
STONE = dict(tile_m=0.9, rough=1.0, mask="edge", ridge=0.18, ridge_col=(0.86, 0.85, 0.82, 1), obj_var=0.06, top_light=0.8, ao=0.3,
             tex_contrast=0.45, tex_sat=0.2, tint=(0.99, 0.99, 1.0), gain=0.46, face_var=0.17)
MOSS = dict(tile_m=0.35, rough=1.0, mask="edge", ridge=0.0, obj_var=0.05, top_light=0.2, ao=0.25, tex_contrast=0.5, tex_sat=0.8, tint=(1.0, 1.0, 1.0), gain=0.8, face_var=0.12)
TIMBER = dict(tile_m=1.0, rough=0.9, mask="edge", ridge=0.1, ridge_col=(0.7, 0.66, 0.6, 1), obj_var=0.06, top_light=0.1, ao=0.3, top_flat=True,
              tex_contrast=0.45, tex_sat=0.55, tint=(1.0, 1.0, 1.0), gain=0.92, end_dark=0.15)


def _spec(m):
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0  # painted, matte (judge: no sheen)
    return m


def spin(m, rz=0.55):
    """Turn the box-projected texture about Z, so the four sides of a symmetric part do not show the same patch (the pillar's white blob on every face)."""
    for n in m.node_tree.nodes:
        if n.type == "MAPPING":
            n.inputs["Rotation"].default_value = (0.0, 0.0, rz)
    return m


def stone_mat(**over):
    return spin(_spec(loop_mat.material("M_stone_cut", _rel("textures/stone_paint_hi.png"), **dict(STONE, **over))))


def moss_mat(**over):
    return _spec(loop_mat.material("M_moss", _rel("textures/moss.png"), **dict(MOSS, **over)))


def timber_mat(**over):
    return spin(_spec(loop_mat.material("M_timber_old", _rel("textures/timber_paint.png"), **dict(TIMBER, **over))), 0.3)


def set_materials(ob, *mats):
    ob.data.materials.clear()
    for m in mats:
        ob.data.materials.append(m)


def add_moss(ob, seed, cover=0.2, up=2.0, seeds=2, splits=5):
    """Moss as paint, not geometry (user 2026-10-31: keep the moss a texture). The moss material (slot 1) goes on a group of facets: `splits`
    random vertical planes first cut the facets (no material removed, no visible change) so a big top face can hold a partial patch; the patch
    starts at `seeds` big up-facing facets and grows over neighbours until `cover` (share of the surface area), favouring up-facing facets
    (weight (0.15 + max(nz, 0)) ** up), never facets that face down. The stone mesh keeps its shape. Needs two material slots (stone, moss)."""
    from mathutils import Vector
    rnd = random.Random(seed * 7 + 3)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    xs, ys = [v.co.x for v in bm.verts], [v.co.y for v in bm.verts]
    for _ in range(splits):
        ang = rnd.uniform(0, math.pi)
        co = Vector((rnd.uniform(-0.3, 0.3) * (max(xs) - min(xs)), rnd.uniform(-0.3, 0.3) * (max(ys) - min(ys)), 0))
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=Vector((math.cos(ang), math.sin(ang), 0)), dist=1e-5)
    bm.faces.ensure_lookup_table()
    bm.normal_update()
    wt = lambda f: (0.15 + max(f.normal.z, 0.0)) ** up if f.normal.z > -0.05 else 0.0  # noqa: E731
    total = sum(f.calc_area() for f in bm.faces)
    cand = sorted(bm.faces, key=lambda f: -wt(f) * f.calc_area() ** 0.5 * rnd.uniform(0.8, 1.2))  # big up-facing facets first
    chosen = set(cand[:seeds])
    area = sum(f.calc_area() for f in chosen)
    frontier = {nf for f in chosen for e in f.edges for nf in e.link_faces if nf not in chosen and wt(nf) > 0}
    while area < cover * total and frontier:
        pool = list(frontier)
        f = rnd.choices(pool, [wt(p) + 1e-4 for p in pool])[0]
        frontier.discard(f)
        chosen.add(f)
        area += f.calc_area()
        frontier |= {nf for e in f.edges for nf in e.link_faces if nf not in chosen and wt(nf) > 0}
    for f in bm.faces:
        f.material_index = 1 if f in chosen else 0
    n = len(chosen)
    bm.to_mesh(ob.data)
    bm.free()
    return n


def finish_mesh(bm, name, col, bevel=0.01, segs=2, crease_deg=4.0, sharp_deg=40.0, flat=True):
    """Clean a cut polyhedron, bevel its creases into strips tagged 'edge' (for the ridge highlight), smooth-shade with steep creases sharp,
    and link it as object `name` in P_<col>. Same finish as the well's stone."""
    import math as m
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0015)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=0.0015)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if bevel:
        creases = [e for e in bm.edges if e.is_manifold and e.calc_face_angle(0) > m.radians(crease_deg)]
        res = bmesh.ops.bevel(bm, geom=creases, offset=bevel, segments=segs, profile=0.5, affect="EDGES", clamp_overlap=True)
        lay = bm.faces.layers.float.get("edge") or bm.faces.layers.float.new("edge")
        for f in res["faces"]:
            if f.is_valid:
                f[lay] = 1.0
    fv = bm.faces.layers.float.get("fvar") or bm.faces.layers.float.new("fvar")
    rnd = random.Random(len(bm.faces) * 31 + 7)
    for f in bm.faces:
        f.smooth = not flat
        f[fv] = rnd.random()  # per-facet value shift for the material (face_var)
    for e in bm.edges:
        e.smooth = (not flat) and not (e.is_manifold and e.calc_face_angle(0) > m.radians(sharp_deg))
    drop(name)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    collection(col).objects.link(ob)
    return ob


def chipped_block(name, col, dims, seed, tilt=3.0, face_cut=(0.0, 0.006), corners=0.6, corner_depth=(0.02, 0.06), edges=5, edge_depth=(0.006, 0.02),
                  bevel=0.01, segs=2, extra=(), mats=None, moss=0.0, facets=0, facet_tilt=9.0, facet_depth=(0.004, 0.012), moss_kw=None, bite_kw=None, texture_moss=True, moss_spots=None, flat_bottom=False, top_facets=0, top_tilt=6.0, edge_facets=0):
    """Squared block (w, d, h), foot on z = 0, as a convex polyhedron: six slightly tilted face planes, then a chip off each corner with
    probability `corners` (top corners twice as likely) and a chamfer on `edges` random edges, then `extra` planes [(point, normal)] and
    a bevel strip on every crease. Every facet is planar, every crease hard before the bevel. `edge_facets` adds that many more tilted chamfer
    planes to each chamfered edge (a chiselled band of 2+ facets whose width wanders along the edge)."""
    import numpy as np
    from mathutils import Vector
    import stone

    rnd = random.Random(seed)
    w, d, h = dims
    half = np.array([w / 2, d / 2, h / 2])
    ctr = np.array([0.0, 0.0, h / 2])
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * (w + 0.1), v.co.y * (d + 0.1), v.co.z * (h + 0.1) + h / 2))
    cuts = []
    for ax in range(3):
        for s in (-1, 1):
            n = np.zeros(3)
            n[ax] = s
            n = stone._rot(n, np.cross(n, [rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1)]), rnd.uniform(-tilt, tilt))
            if ax == 2 and s == -1:
                n = np.array([0.0, 0.0, -1.0])  # bed stays flat
            cuts.append((ctr + n * (half[ax] - rnd.uniform(*face_cut) * (0 if (ax == 2 and s == -1) else 1)), n / np.linalg.norm(n)))
    corner_list = [(sx, sy, sz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
    for sx, sy, sz in corner_list:
        if flat_bottom and sz < 0:
            continue  # no undercut chip under the block: it shows as a black band at the foot
        if rnd.random() < corners * (1.0 if sz > 0 else 0.5):
            n = np.array([sx, sy, sz], float) + np.array([rnd.uniform(-0.5, 0.5) for _ in range(3)])
            n /= np.linalg.norm(n)
            c = ctr + np.array([sx, sy, sz]) * half
            cuts.append((c - n * rnd.uniform(*corner_depth), n))
    all_edges = [(ax, a, b) for ax in range(3) for a in (-1, 1) for b in (-1, 1)]  # the edge runs along ax; (a, b) pick its side on the other two axes
    if flat_bottom:  # drop the edges along the bottom face
        all_edges = [(ax, a, b) for ax, a, b in all_edges if dict(zip([k for k in range(3) if k != ax], (a, b))).get(2) != -1]
    for ax, a, b in rnd.sample(all_edges, min(edges, len(all_edges))):
        o = [i for i in range(3) if i != ax]
        n = np.zeros(3)
        n[o[0]], n[o[1]] = a, b
        n = n / np.linalg.norm(n)
        c = ctr + n * 0  # edge midpoint: the two other axes at +-half
        c = ctr.copy()
        c[o[0]] += a * half[o[0]]
        c[o[1]] += b * half[o[1]]
        c[ax] += rnd.uniform(-0.3, 0.3) * half[ax]
        cuts.append((c - n * rnd.uniform(*edge_depth), n))
        e = np.zeros(3)
        e[ax] = 1.0
        for _ in range(edge_facets):
            n2 = stone._rot(n, e, rnd.uniform(9, 22) * rnd.choice((-1, 1))) + e * rnd.uniform(-0.2, 0.2)
            n2 /= np.linalg.norm(n2)
            cuts.append((c - n2 * rnd.uniform(*edge_depth) * rnd.uniform(0.8, 1.1), n2))
    for _ in range(facets):  # shallow tilted planes on the faces: the broad facets of the hand-painted low-poly look
        ax = rnd.randrange(2) if rnd.random() < 0.8 else rnd.randrange(3)  # mostly on the sides; the top stays nearly flat
        s_ = rnd.choice((-1, 1)) if ax < 2 else 1
        n = np.zeros(3)
        n[ax] = s_
        n = stone._rot(n, np.cross(n, [rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1)]), rnd.uniform(0.4, 1.0) * facet_tilt * (0.35 if ax == 2 else 1.0))
        c = ctr.copy()
        c[ax] += s_ * half[ax]
        o = [i for i in range(3) if i != ax]
        c[o[0]] += rnd.uniform(-0.8, 0.8) * half[o[0]]
        c[o[1]] += rnd.uniform(-0.8, 0.8) * half[o[1]]
        cuts.append((c - n / np.linalg.norm(n) * rnd.uniform(*facet_depth), n / np.linalg.norm(n)))
    for _ in range(top_facets):  # shallow tilted planes over the top: a faceted skin, not one sheet
        n = stone._rot(np.array([0.0, 0.0, 1.0]), np.cross([0, 0, 1], [rnd.gauss(0, 1), rnd.gauss(0, 1), 0.0]), rnd.uniform(0.35, 1.0) * top_tilt)
        c = ctr.copy()
        c[2] += half[2]
        c[0] += rnd.uniform(-0.85, 0.85) * half[0]
        c[1] += rnd.uniform(-0.85, 0.85) * half[1]
        cuts.append((c - n / np.linalg.norm(n) * rnd.uniform(0.003, 0.009), n / np.linalg.norm(n)))
    cuts += [(np.array(p, float), np.array(n, float) / np.linalg.norm(n)) for p, n in extra]
    stone._cut(bm, (0, 0, 0), (0, 0, -1))
    rnd.shuffle(cuts)
    for p, n in cuts:
        stone._cut(bm, p, n)
    ob = finish_mesh(bm, name, col, bevel=bevel, segs=segs)
    if bite_kw is not None:
        import paint
        paint.bites(ob, seed, **bite_kw)
    if texture_moss:
        import paint
        spec = paint.moss_spec(seed, dims, moss)
        if moss_spots:
            spec["spots"] = moss_spots
        set_materials(ob, paint.stone_moss_mat("M_" + name, spec, **(moss_kw or {})))
    else:
        set_materials(ob, *(mats or (stone_mat(), moss_mat())))
        if moss:
            add_moss(ob, seed, cover=moss)
    return ob


def well_stone(name, col, seed, dims, over=None, moss=0.0, moss_seed=None, mats=None):
    """The well's convex-polyhedron stone (well_test/build/stone.py, frozen) with this part's knobs, built into P_<col>."""
    import stone  # noqa: E402

    drop(name)
    saved = dict(stone.P)
    stone.P.update(over or {})
    try:
        ob = stone.build(name, seed, dims, col=collection(col).name)
    finally:
        stone.P.clear()
        stone.P.update(saved)
    set_materials(ob, *(mats or (stone_mat(), moss_mat())))
    if moss:
        add_moss(ob, seed if moss_seed is None else moss_seed, cover=moss)
    return ob


def round_edge(axis_pt, out_a, out_b, r, steps=3):
    """Planes that round an edge: the edge's inner axis point `axis_pt` (radius r inside the corner), the two outward face normals out_a and
    out_b; returns [(point, normal)] tangent to the rounded edge at evenly spread angles (feed to chipped_block extra)."""
    import numpy as np
    a, b = np.array(out_a, float), np.array(out_b, float)
    out = []
    for i in range(steps):
        t = (i + 1) / (steps + 1)
        n = a * (1 - t) + b * t
        n /= np.linalg.norm(n)
        out.append((np.array(axis_pt, float) + n * r, n))
    return out


def join(objs, name, col):
    """Join objects (same material slots) into one named object in P_<col>."""
    me_objs = list(objs)
    with bpy.context.temp_override(active_object=me_objs[0], selected_editable_objects=me_objs, selected_objects=me_objs):
        bpy.ops.object.join()
    o = me_objs[0]
    drop(name)  # an older build of this part must not keep the name
    o.name = name
    o.data.name = name
    return o


def convex_rock(name, col, dims, seed, npts=18, lumps=2, flat=0.12, jit=0.28, bevel=0.012, segs=2, mats=None, moss=0.0, moss_up=3.0, moss_seeds=2):
    """Angular boulder: convex hull of jittered points on a squashed ellipsoid (flat bed on z = 0) plus `lumps` smaller hulls at its foot
    overlapping the main one. dims = (w, d, h). Triangle facets stay large and flat, like the low-poly reference boulders."""
    import numpy as np
    from mathutils import Vector

    rnd = random.Random(seed)
    w, d, h = dims
    bm = bmesh.new()

    def hull(cx, cy, sx, sy, sz, n, z0=0.0):
        verts = []
        for _ in range(n):
            u = np.array([rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1)])
            u /= np.linalg.norm(u)
            r = 1 + rnd.uniform(-jit, jit)
            verts.append(bm.verts.new(Vector((cx + u[0] * r * sx, cy + u[1] * r * sy, z0 + max(u[2], 0.0) ** 0.55 * r * sz))))  # ^0.55: a broad top, not a peak
        for k in range(6):  # a few foot points: the bed is a polygon, not a point
            ang = k * math.pi / 3 + rnd.uniform(-0.3, 0.3)
            verts.append(bm.verts.new(Vector((cx + math.cos(ang) * sx * 0.9, cy + math.sin(ang) * sy * 0.9, z0))))
        res = bmesh.ops.convex_hull(bm, input=verts, use_existing_faces=False)
        bmesh.ops.delete(bm, geom=list(set(res["geom_interior"] + res["geom_unused"])), context="VERTS")

    hull(0, 0, w / 2, d / 2, h, npts)
    for i in range(lumps):
        ang = rnd.uniform(0, 6.28)
        hull(math.cos(ang) * w * 0.32, math.sin(ang) * d * 0.32, w * rnd.uniform(0.22, 0.34), d * rnd.uniform(0.22, 0.34), h * rnd.uniform(0.3, 0.55), 12, z0=-0.012 * (i + 1))
    ob = finish_mesh(bm, name, col, bevel=bevel, segs=segs)
    import paint
    spec = paint.moss_spec(seed, dims, moss)
    spec.update(p0=(0.0, 0.0, h), radius=max(w, d) * 0.9, thresh=1.25 - 1.1 * moss)  # moss caps the upper facets of a rock
    set_materials(ob, paint.stone_moss_mat("M_" + name, spec, w_noise=0.35, w_up=0.7, w_prox=0.45, noise_scale=3.5))
    return ob


def union(base, others, name):
    """Boolean union (exact) of `others` into `base`, one solid; the objects in `others` are removed. Returns base renamed `name`."""
    from mathutils import Matrix
    bpy.context.view_layer.update()
    base.data.transform(base.matrix_world)  # bake the base's placement so the result sits at the world origin
    base.matrix_world = Matrix.Identity(4)
    bpy.context.view_layer.update()
    for o in others:
        mod = base.modifiers.new("u", "BOOLEAN")
        mod.operation, mod.solver, mod.object = "UNION", "EXACT", o
        with bpy.context.temp_override(object=base, active_object=base, selected_objects=[base]):
            bpy.ops.object.modifier_apply(modifier="u")
        bpy.data.objects.remove(o)
    drop(name)
    base.name = name
    base.data.name = name
    return base
