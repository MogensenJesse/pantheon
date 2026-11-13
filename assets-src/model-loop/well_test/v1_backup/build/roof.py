"""Group 'roof': small gable roof from the frozen 'shingle' (3 variants) and 'timber' (2 variants), linked duplicates.
build() -> G_roof.

Axes: ridge along X, gable ends face +X / -X, the two slopes face -Y (front) and +Y (back), Z up, centred on x = y = 0.
Slope frame (side sg = -1 front, +1 back): d = up the slope, n = slope normal, X_loc = d x n.
  * underlay: a dark board under each slope (group-only), top face = the sheathing plane;
  * shingles: `rows` courses per slope, joints staggered by about half a shingle (odd courses start with a half shingle),
    each shingle placed by its TOP end on the sheathing and its eave end tilted up by `tilt` degrees, so the next course lies on it;
  * bargeboards: two timber copies per gable, bottom face on the sheathing plane beside the shingles, crossing at the
    ridge and running `ext` metres past the crossing (X-shaped finials); one copy of each pair is shifted 2 cm in X so
    the crossing is not coplanar;
  * ridge: one timber copy lying on the apex between the gables.
Round notes at the bottom of the file.
"""
import math
import random

import bmesh
import bpy
from mathutils import Matrix, Vector

P = dict(
    seed=11, theta=38.0, ye0=0.76, ze=0.04,  # slope angle, horizontal half-span of the sheathing plane at its eave edge, eave height
    rows=4, sc=1.12, wsc=1.05, tilt=5.0, gap=0.007, span=0.83, half=(0.45, 0.6), over=0.012,
    w_jit=0.07, yaw_jit=1.2, u_jit=0.008, w_lift=0.0015, sz_jit=0.02,
    barge_x=0.90, barge_dx=0.02, barge_ext=0.34, barge_cs=1.35, barge_lift=0.0,
    ridge_len=1.98, ridge_z=0.05, ridge_cs=(1.3, 1.25),  # ridge: length, centre height above the apex, (y, z) section scale
    vw=dict(shingle_a=0.45, shingle_b=0.15, shingle_c=0.40),  # variant weights: b (round eave) reads as fish scales, a is the reference step
    under_t=0.03, under_col=(0.16, 0.07, 0.02, 1),
)
SHINGLES = ("shingle_a", "shingle_b", "shingle_c")


def _basis(sg):
    t = math.radians(P["theta"])
    c, s = math.cos(t), math.sin(t)
    d = Vector((0, -sg * c, s))
    n = Vector((0, sg * s, c))
    xl = d.cross(n)
    return d, n, xl


def _m4(cols, loc):
    m = Matrix([[cols[j][i] for j in range(3)] for i in range(3)]).to_4x4()
    m.translation = loc
    return m


def _scale4(sx, sy, sz):
    return Matrix.Diagonal((sx, sy, sz, 1.0))


def _bounds(ob):
    bb = [Vector(c) for c in ob.bound_box]
    lo = Vector((min(p.x for p in bb), min(p.y for p in bb), min(p.z for p in bb)))
    hi = Vector((max(p.x for p in bb), max(p.y for p in bb), max(p.z for p in bb)))
    return lo, hi


def _link(col, name, src, m):
    ob = bpy.data.objects.new(name, src.data)  # linked duplicate: shares the frozen part's mesh
    col.objects.link(ob)
    ob.matrix_world = m
    return ob


def _row_widths(rnd, k):
    """Widths of one course across [-span, span]; odd courses start with a narrow piece (half-shingle stagger)."""
    S, g = 2 * P["span"], P["gap"]
    W = 0.232 * P["wsc"]  # nominal column width; sc only scales length and thickness
    first = W * rnd.uniform(*P["half"]) if k % 2 else None
    avail = S - ((first + g) if first else 0.0)
    n = max(1, round((avail + g) / (W + g)))
    tot = avail - (n - 1) * g
    ws = [1 + rnd.uniform(-P["w_jit"], P["w_jit"]) for _ in range(n)]
    ws = [w * tot / sum(ws) for w in ws]
    return ([first] if first else []) + ws


def _under(col, sg, mat):
    d, n, xl = _basis(sg)
    t = math.radians(P["theta"])
    E = Vector((0, sg * P["ye0"], P["ze"]))
    u_ap = P["ye0"] / math.cos(t)
    bm = bmesh.new()
    pts = {}
    for ix, x in enumerate((-P["span"], P["span"])):
        for iu, u in enumerate((0.03, u_ap + 0.04)):
            for iw, w in enumerate((-P["under_t"], 0.0)):
                pts[ix, iu, iw] = bm.verts.new(E + Vector((x, 0, 0)) + d * u + n * w)
    for quad in (((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)), ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)),
                 ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)),
                 ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)), ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0))):
        bm.faces.new([pts[q] for q in quad])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(f"roof_under_{'f' if sg < 0 else 'b'}")
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(me.name, me)
    col.objects.link(ob)


def _under_mat():
    mat = bpy.data.materials.get("M_roof_under") or bpy.data.materials.new("M_roof_under")
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = P["under_col"]
    bsdf.inputs["Roughness"].default_value = 0.95
    return mat


def build(col="G_roof"):
    rnd = random.Random(P["seed"])
    g = bpy.data.collections.get(col)
    if g is None:
        g = bpy.data.collections.new(col)
        bpy.context.scene.collection.children.link(g)
    for o in list(g.objects):
        me = o.data
        bpy.data.objects.remove(o)
        if me and me.users == 0 and me.name.startswith("roof_"):
            bpy.data.meshes.remove(me)
    t = math.radians(P["theta"])
    c, s = math.cos(t), math.sin(t)
    u_ap = P["ye0"] / c
    mat_u = _under_mat()
    info = {"shingles": 0, "variants": {}, "rows": []}
    sh = {n: bpy.data.objects[n] for n in SHINGLES}
    sh_b = {n: _bounds(o) for n, o in sh.items()}
    L_mean = sum(b[1].y for b in sh_b.values()) / 3 * 2 * P["sc"]
    rows = P["rows"]
    e = (u_ap + P["over"] - L_mean) / (rows - 1)
    for sg in (-1, 1):
        d, n, xl = _basis(sg)
        E = Vector((0, sg * P["ye0"], P["ze"]))
        _under(g, sg, mat_u)
        for k in range(rows):
            ws = _row_widths(rnd, k)
            x = -P["span"]
            prev = None
            u_top = u_ap + P["over"] - (rows - 1 - k) * e
            for i, w in enumerate(ws):
                opts = [v for v in SHINGLES if v != prev]
                name = rnd.choices(opts, [P["vw"][v] for v in opts])[0]
                prev = name
                lo, hi = sh_b[name]
                sx = w / (hi.x - lo.x)
                sy = P["sc"] * (1 + rnd.uniform(-0.03, 0.03))
                sz = P["sc"] * (1 + rnd.uniform(-P["sz_jit"], P["sz_jit"]))
                xc = x + w / 2
                x += w + P["gap"]
                du = rnd.uniform(-P["u_jit"], P["u_jit"])
                tilt = math.radians(P["tilt"] + rnd.uniform(-0.8, 0.8))
                yaw = math.radians(rnd.uniform(-1, 1) * P["yaw_jit"])
                top = E + d * (u_top + du) + n * (P["w_lift"] * rnd.uniform(0.5, 1.5)) + Vector((xc, 0, 0))
                rot = Matrix.Rotation(-tilt, 4, "X") @ Matrix.Rotation(yaw, 4, "Z")
                m = _m4((xl, d, n), top) @ rot @ _scale4(sx, sy, sz) @ Matrix.Translation((-(lo.x + hi.x) / 2, -hi.y, 0))
                _link(g, f"roof_sh_{'f' if sg < 0 else 'b'}{k}_{i:02d}", sh[name], m)
                info["shingles"] += 1
                info["variants"][name] = info["variants"].get(name, 0) + 1
            info["rows"].append(len(ws))
    # bargeboards: axis offset by half the section from the sheathing plane; both axes cross at y = 0
    tb = {"timber_a": bpy.data.objects["timber_a"], "timber_b": bpy.data.objects["timber_b"]}
    for gi, xg in enumerate((-P["barge_x"], P["barge_x"])):
        for sg in (-1, 1):
            d, n, xl = _basis(sg)
            name = "timber_b" if (gi + (sg > 0)) % 2 == 0 else "timber_a"
            src = tb[name]
            lo, hi = _bounds(src)
            H = (hi.z - lo.z) * P["barge_cs"]
            Ls = hi.x - lo.x
            u_x = (P["ye0"] + (H / 2) * s) / c  # axis parameter where the axis meets y = 0
            Lb = u_x + P["barge_ext"]
            E = Vector((0, sg * P["ye0"], P["ze"]))
            xo = xg + math.copysign(P["barge_dx"], xg) * (1 if sg < 0 else -1)
            ctr = E + d * (Lb / 2) + n * (H / 2 + P["barge_lift"]) + Vector((xo, 0, 0))
            cols = (d, Vector((sg, 0, 0)), n)
            m = _m4(cols, ctr) @ _scale4(Lb / Ls, P["barge_cs"], P["barge_cs"]) @ Matrix.Translation(
                (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -(lo.z + hi.z) / 2))
            _link(g, f"roof_barge_{'L' if xg < 0 else 'R'}{'f' if sg < 0 else 'b'}", src, m)
    # ridge: along X, centred on the apex
    src = tb["timber_b"]
    lo, hi = _bounds(src)
    zc = P["ze"] + P["ye0"] * s / c + P["ridge_z"]
    m = Matrix.Translation((0, 0, zc)) @ _scale4(P["ridge_len"] / (hi.x - lo.x), *P["ridge_cs"]) @ Matrix.Translation(
        (-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -(lo.z + hi.z) / 2))
    _link(g, "roof_ridge", src, m)
    bpy.context.view_layer.update()
    info["e"] = round(e, 4)
    return info

# Round notes (render tags r01..r03; r03 is judged round 1 = 6.6, the best and the one shown to the user):
# r01 own check: 5 rows, sc 1.0, tilt 5, ext 0.2, theta 45 -> plaid shingles (the frozen M_shingle blends box/flat projection by the WORLD
#   normal z over 0.6..0.8, a 40 deg shingle sits at 0.77 = half blended), finials too short, camera guess az 35 / el 25 off.
# r02 own check: theta 38, ye0 0.80, 4 rows, shingle length/thickness x1.12, wsc 1.05, beams x1.2, tilt 5 (shingle pitch 33 deg, nz 0.84 > 0.8:
#   pure flat projection, no plaid), ext 0.34, camera az 32 / el 26 (line slopes of the ref give az ~30, el ~22).
# r03 (judged 1): ye0 0.76 (depth back near the planned 1.7), beams x1.35, ridge section (1.3, 1.25), variant weights a .45 / c .40 / b .15
#   (b's round eave reads as fish scales), camera az 36 / el 26.
# Judge r03 group defects to try next: ridge bow 3-4 cm + a little roll; finial arms +0.1 m; mixed shingle widths (x scale 0.75-1.4 per course,
#   renormalised); darker underlay at the eave. Part defects (scalloped/cupped shingle eave, beam grooves, end rings, colours) are logged only.
