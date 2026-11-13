"""Group 'deck': irregular round plank deck from the frozen 'plank' variants (linked duplicates).
build() -> G_deck.
Layout = packing of oriented plank rectangles inside a ragged round outline, no two overlapping:
  1. row passes: a Voronoi split of the outline, every cell has its own plank direction and is filled with rows of
     end-to-end planks (a pinwheel of parallel groups); later passes use new, smaller cells and fill what is left;
  2. hole fill: planks leaning on a neighbour (beside it, in line, T-joint) wherever they still cover new ground.
A dark underlay (group-only piece) sits under the joints. Plank local frame: length along X, the angled cut at the
+X end on the +Y side, z = 0 at the bottom; the angled end is turned outward where a plank end meets the outline.
Round notes at the bottom of the file.
"""
import math
import random

import bmesh
import bpy
import numpy as np
from mathutils import Vector

# seed: layout seed (outline, cells, directions, lengths, flips, jitter).
P = dict(seed=3, R0=1.27, outline_n=10, outline_jit=0.06,
         passes=((4, (0.7, 0.9)),),  # (cells in the ring, ring radius range)
         min_dtheta=30.0, cell_theta_jit=28.0, narrow_p=0.5, wide_w=0.251, gap=0.012, end_gap=0.014,
         scale_len=(0.8, 1.3), fill_exact=0.7, edge_over=0.02, cand=80, max_fail=100, max_planks=70,
         p_side=0.5, p_end=0.2, p_tee=0.2, min_new=0.012, cell=0.03, offcuts_max=40, offcut_tries=14, min_piece=0.045, piece_bevel=0.007,
         yaw_jit=1.0, w_jit=0.015, t_jit=0.02, tilt_jit=0.4, lift=(0.0, 0.003, 0.006),
         under_scale=0.93, under_h=0.03, under_col=(0.20, 0.085, 0.02, 1))
VARIANTS = ("plank_a", "plank_b", "plank_c")
WIDTH_SCALE = {"plank_a": 0.97, "plank_b": 1.04, "plank_c": 1.0}  # a and b land on the same ~0.25 m width
WIDE, NARROW = ("plank_a", "plank_b"), ("plank_c",)


class Rect:
    __slots__ = ("c", "ux", "uy", "hl", "hw", "lift", "name", "yaw", "sx", "sy", "sz", "poly", "cuts")

    def corners(self):  # counter-clockwise
        hl, hw, ux, uy = self.hl, self.hw, self.ux, self.uy
        return [(self.c[0] + sa * hl * ux - sb * hw * uy, self.c[1] + sa * hl * uy + sb * hw * ux)
                for sa, sb in ((1, 1), (-1, 1), (-1, -1), (1, -1))]

    def outline(self):
        return self.poly or self.corners()


def poly_sep(A, B, d):
    """True when convex polygons A and B (counter-clockwise) are more than d apart along some edge normal."""
    for Q in (A, B):
        for i, (x0, y0) in enumerate(Q):
            x1, y1 = Q[(i + 1) % len(Q)]
            nx, ny = y1 - y0, x0 - x1
            ln = math.hypot(nx, ny)
            if ln < 1e-9:
                continue
            nx, ny = nx / ln, ny / ln
            pa = [nx * x + ny * y for x, y in A]
            pb = [nx * x + ny * y for x, y in B]
            if min(pb) - max(pa) > d or min(pa) - max(pb) > d:
                return True
    return False


def area(poly):
    return abs(sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
                   for i in range(len(poly)))) / 2


def overlap(a, b, m):
    """Two placed shapes, each grown by m. Rect/rect uses a fast SAT; clipped pieces use their polygons."""
    if a.poly or b.poly:
        return not poly_sep(a.outline(), b.outline(), 2 * m)
    dx, dy = b.c[0] - a.c[0], b.c[1] - a.c[1]
    for ux, uy in ((a.ux, a.uy), (-a.uy, a.ux), (b.ux, b.uy), (-b.uy, b.ux)):
        ra = (a.hl + m) * abs(a.ux * ux + a.uy * uy) + (a.hw + m) * abs(-a.uy * ux + a.ux * uy)
        rb = (b.hl + m) * abs(b.ux * ux + b.uy * uy) + (b.hw + m) * abs(-b.uy * ux + b.ux * uy)
        if abs(dx * ux + dy * uy) > ra + rb:
            return False
    return True


def clip(poly, p, n):
    """Keep the part of the (2D) polygon where n.(x - p) >= 0."""
    out = []
    for i, a in enumerate(poly):
        b = poly[(i + 1) % len(poly)]
        da, db = n.dot(a - p), n.dot(b - p)
        if da >= 0:
            out.append(a)
        if (da >= 0) != (db >= 0):
            out.append(a + (b - a) * (da / (da - db)))
    return out


def clip2(poly, p, n):
    """clip() on plain (x, y) tuples: keep n.(x - p) >= 0."""
    out = []
    for i, a in enumerate(poly):
        b = poly[(i + 1) % len(poly)]
        da, db = n[0] * (a[0] - p[0]) + n[1] * (a[1] - p[1]), n[0] * (b[0] - p[0]) + n[1] * (b[1] - p[1])
        if da >= 0:
            out.append(a)
        if (da >= 0) != (db >= 0):
            t = da / (da - db)
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def urange(poly_uv, v):
    us = []
    for i, a in enumerate(poly_uv):
        b = poly_uv[(i + 1) % len(poly_uv)]
        if (a.y - v) * (b.y - v) <= 0 and a.y != b.y:
            us.append(a.x + (b.x - a.x) * (v - a.y) / (b.y - a.y))
    return (min(us), max(us)) if len(us) >= 2 else None


def make_outline(rnd):
    """Irregular convex polygon (counter-clockwise): the deck edge is a ring of straight board ends, not a circle."""
    n = P["outline_n"]
    for _ in range(200):
        a0 = rnd.uniform(0, 2 * math.pi)
        pts = []
        for i in range(n):
            a = a0 + 2 * math.pi * (i + rnd.uniform(-0.3, 0.3)) / n
            r = P["R0"] * (1 + rnd.uniform(-1, 1) * P["outline_jit"])
            pts.append((r * math.cos(a), r * math.sin(a)))
        if all((pts[(i + 1) % n][0] - pts[i][0]) * (pts[(i + 2) % n][1] - pts[(i + 1) % n][1])
               - (pts[(i + 1) % n][1] - pts[i][1]) * (pts[(i + 2) % n][0] - pts[(i + 1) % n][0]) > 0 for i in range(n)):
            return pts
    return pts


def outside_d(ring, x, y):
    """Signed distance to the outline polygon (>0 outside); works on floats and numpy arrays."""
    d = None
    for i, (x0, y0) in enumerate(ring):
        x1, y1 = ring[(i + 1) % len(ring)]
        ln = math.hypot(x1 - x0, y1 - y0)
        v = ((y1 - y0) * (x - x0) - (x1 - x0) * (y - y0)) / ln  # >0 on the outer side of this edge
        d = v if d is None else (np.maximum(d, v) if isinstance(v, np.ndarray) else max(d, v))
    return d


def dims(name):
    d = bpy.data.objects[name].dimensions
    return d.x, d.y


def build(col="G_deck"):
    rnd = random.Random(P["seed"])
    nrnd = np.random.default_rng(P["seed"])
    ring_pts = make_outline(rnd)

    g = bpy.data.collections.get(col)
    if g is None:
        g = bpy.data.collections.new(col)
        bpy.context.scene.collection.children.link(g)
    for o in list(g.objects):
        bpy.data.objects.remove(o)
    cs = P["cell"]
    xs = np.arange(-1.6, 1.6, cs) + cs / 2
    GX, GY = [a.ravel() for a in np.meshgrid(xs, xs)]
    inside = outside_d(ring_pts, GX, GY) <= 0
    covered = np.zeros_like(inside)
    placed = []
    m = P["gap"] / 2 - 0.002  # abutting candidates sit exactly gap apart: leave a 4 mm tolerance
    lo, hi = P["scale_len"]

    def free(r):
        for x, y in r.outline():
            if outside_d(ring_pts, x, y) > P["edge_over"]:
                return False
        return not any(overlap(r, q, m) for q in placed)

    def mk(name, yaw, sx, lift):
        r = Rect()
        L, W = dims(name)
        r.name, r.sx = name, sx
        r.sy = WIDTH_SCALE[name] * (1 + rnd.uniform(-1, 1) * P["w_jit"])
        r.sz = 1 + rnd.uniform(-1, 1) * P["t_jit"]
        r.hl, r.hw = L * sx / 2, W * abs(r.sy) / 2
        r.c = [0.0, 0.0]
        r.yaw = yaw + math.radians(rnd.uniform(-1, 1) * P["yaw_jit"])
        r.ux, r.uy = math.cos(r.yaw), math.sin(r.yaw)
        r.lift = lift
        r.poly, r.cuts = None, []
        return r

    def cover_mask(r):
        if r.poly:
            m_ = np.ones_like(inside)
            for i, (x0, y0) in enumerate(r.poly):
                x1, y1 = r.poly[(i + 1) % len(r.poly)]
                m_ &= (x1 - x0) * (GY - y0) - (y1 - y0) * (GX - x0) >= 0
            return m_
        dx, dy = GX - r.c[0], GY - r.c[1]
        return (np.abs(dx * r.ux + dy * r.uy) <= r.hl) & (np.abs(-dx * r.uy + dy * r.ux) <= r.hw)

    def fit(r, put):
        """Try r at its length, then shorter, until it is free; put(r) sets r.c for the current length."""
        L, _ = dims(r.name)
        s0 = r.sx
        for s in list(np.arange(s0, lo, -0.04)) + [lo]:
            if s > s0:
                continue
            r.sx = float(s)
            r.hl = L * r.sx / 2
            put(r)
            if free(r):
                return r
        return None

    def add(r):
        covered[:] |= cover_mask(r) & inside
        placed.append(r)

    def pick(rem, narrow):
        """Variant and length scale for a row with `rem` metres left (None: nothing fits)."""
        names = NARROW if narrow else WIDE
        opts = [n for n in names if lo <= rem / dims(n)[0] <= hi]
        if opts:
            n = rnd.choice(opts)
            s = rem / dims(n)[0]
            return n, (s if rnd.random() < P["fill_exact"] else rnd.uniform(lo, s))
        n = max(names, key=lambda k: dims(k)[0])
        if rem > dims(n)[0] * hi:
            return n, rnd.uniform(1.0, hi)
        return None

    def row_pass(n_cells, r_rng):
        seeds = [Vector((0.0, 0.0))] if r_rng[0] > 0.3 else []
        a0 = rnd.uniform(0, 2 * math.pi)
        for i in range(n_cells):
            ang = a0 + 2 * math.pi * (i + rnd.uniform(-0.18, 0.18)) / n_cells
            rr = rnd.uniform(*r_rng)
            seeds.append(Vector((rr * math.cos(ang), rr * math.sin(ang))))
        ring = [Vector(p) for p in ring_pts]
        thetas = []
        for sd in seeds:
            for _ in range(60):
                th = (math.atan2(sd.y, sd.x) + rnd.choice((0.0, math.pi / 2))
                      + math.radians(rnd.uniform(-1, 1) * P["cell_theta_jit"])) % math.pi
                if all(min(abs(th - t), math.pi - abs(th - t)) >= math.radians(P["min_dtheta"]) for t in thetas):
                    break
            thetas.append(th)
        order = list(range(len(seeds)))
        rnd.shuffle(order)
        wc = dims("plank_c")[1]
        for ci in order:
            sd, th = seeds[ci], thetas[ci]
            poly = ring[:]
            for j, t in enumerate(seeds):
                if j != ci:
                    poly = clip(poly, (sd + t) / 2, sd - t)
            if len(poly) < 3:
                continue
            c, sn = math.cos(th), math.sin(th)
            uv = [Vector((p.x * c + p.y * sn, -p.x * sn + p.y * c)) for p in poly]
            vlo, vhi = min(p.y for p in uv), max(p.y for p in uv)
            v = vlo + rnd.uniform(0.0, 0.1)
            lift = rnd.choice(P["lift"])
            while v < vhi - 0.1:
                narrow = rnd.random() < P["narrow_p"]
                for _try in (0, 1):
                    w = wc if narrow else P["wide_w"]
                    vc = v + w / 2
                    rng = urange(uv, min(max(vc, vlo + 1e-4), vhi - 1e-4))
                    if rng and narrow and rng[1] + 0.06 - rng[0] < 0.95:  # too short for the long plank: wide row
                        narrow = False
                        continue
                    break
                v += w + P["gap"]
                if not rng:
                    continue
                a, b = rng
                pos = a + rnd.uniform(-0.03, 0.04)
                for _ in range(14):
                    if b + 0.06 - pos < 0.45:
                        break
                    pk = pick(b + 0.06 - pos, narrow)
                    if pk is None:
                        break
                    r = mk(pk[0], th, pk[1], lift)

                    def put(r):
                        uc = pos + r.hl
                        r.c = [uc * c - vc * sn, uc * sn + vc * c]
                    if fit(r, put):
                        add(r)
                        pos += 2 * r.hl + P["end_gap"] + rnd.uniform(0, 0.03)
                    else:
                        pos += 0.06

    def abut(q):
        """A plank leaning on parent q: beside it (parallel), in line with it, or as a T / end cap."""
        k = rnd.random()
        sg = rnd.choice((-1, 1))
        qu, qv = (q.ux, q.uy), (-q.uy, q.ux)
        lift = q.lift if rnd.random() < 0.8 else rnd.choice(P["lift"])
        g_ = P["gap"]
        name = rnd.choice(VARIANTS)
        sx = rnd.uniform(lo, hi)
        if k < P["p_side"]:
            r = mk(name, q.yaw, sx, lift)
            al = rnd.choice((-1, 1, rnd.uniform(-1, 1)))

            def put(r):
                t = (q.hl - r.hl) * al
                d_v = sg * (q.hw + r.hw + g_)
                r.c = [q.c[0] + qv[0] * d_v + qu[0] * t, q.c[1] + qv[1] * d_v + qu[1] * t]
        elif k < P["p_side"] + P["p_end"]:
            r = mk(name, q.yaw, sx, lift)
            off = rnd.uniform(-0.04, 0.04)

            def put(r):
                d_u = sg * (q.hl + r.hl + g_)
                r.c = [q.c[0] + qu[0] * d_u + qv[0] * off, q.c[1] + qu[1] * d_u + qv[1] * off]
        elif k < P["p_side"] + P["p_end"] + P["p_tee"]:
            r = mk(name, q.yaw + math.pi / 2, sx, lift)
            tt = rnd.uniform(-0.8, 0.8)

            def put(r):
                d_v = sg * (q.hw + r.hl + g_)
                t = tt * q.hl
                r.c = [q.c[0] + qv[0] * d_v + qu[0] * t, q.c[1] + qv[1] * d_v + qu[1] * t]
        else:
            r = mk(name, q.yaw + math.pi / 2, sx, lift)
            tt = rnd.uniform(-0.8, 0.8)

            def put(r):
                d_u = sg * (q.hl + r.hw + g_)
                t = tt * (q.hw + r.hl)
                r.c = [q.c[0] + qu[0] * d_u + qv[0] * t, q.c[1] + qu[1] * d_u + qv[1] * t]
        return fit(r, put)

    stats = []
    for n_cells, r_rng in P["passes"]:
        row_pass(n_cells, r_rng)
        stats.append(len(placed))
    fails = 0
    while fails < P["max_fail"] and len(placed) < P["max_planks"]:
        best, best_score = None, 0.0
        for _ in range(P["cand"]):
            r = abut(rnd.choice(placed))
            if r is None:
                continue
            sc = float((cover_mask(r) & inside & ~covered).sum()) * cs * cs
            if sc > best_score:
                best, best_score = r, sc
        if best is None or best_score < P["min_new"]:
            fails += 1
            continue
        fails = 0
        add(best)
    stats.append(len(placed))

    # off-cuts: group-only pieces. A plank-shaped rectangle parallel (or at right angles) to its neighbour is clipped by
    # the neighbours' edges and the outline, so it fills a wedge gap like the cut-down boards of the reference.
    def clip_free(poly, p):
        cuts = []
        n = len(ring_pts)
        for i in range(n):
            a, b = ring_pts[i], ring_pts[(i + 1) % n]
            ln = math.hypot(b[0] - a[0], b[1] - a[1])
            nin = (-(b[1] - a[1]) / ln, (b[0] - a[0]) / ln)
            pt = (a[0] - nin[0] * P["edge_over"], a[1] - nin[1] * P["edge_over"])
            if all(nin[0] * (x - pt[0]) + nin[1] * (y - pt[1]) >= 0 for x, y in poly):
                continue
            poly = clip2(poly, pt, nin)
            if len(poly) < 3:
                return None
            cuts.append((nin, pt))
        for it in sorted(placed, key=lambda q: (q.c[0] - p[0]) ** 2 + (q.c[1] - p[1]) ** 2):
            if poly_sep(poly, it.outline(), 2 * m):
                continue
            ip = it.outline()
            best = None
            for i, (x0, y0) in enumerate(ip):
                x1, y1 = ip[(i + 1) % len(ip)]
                ln = math.hypot(x1 - x0, y1 - y0)
                if ln < 1e-9:
                    continue
                nn = ((y1 - y0) / ln, -(x1 - x0) / ln)  # outward of the neighbour
                pt = (x0 + nn[0] * P["gap"], y0 + nn[1] * P["gap"])
                if nn[0] * (p[0] - pt[0]) + nn[1] * (p[1] - pt[1]) < 0:
                    continue
                new = clip2(poly, pt, nn)
                if len(new) >= 3 and (best is None or area(new) > best[0]):
                    best = (area(new), new, (nn, pt))
            if best is None:
                return None
            poly = best[1]
            cuts.append(best[2])
        return poly, cuts

    dead = np.zeros_like(inside)
    for _ in range(P["offcuts_max"]):
        idx = np.flatnonzero(inside & ~covered & ~dead)
        if len(idx) < 10:
            break
        blocked = np.flatnonzero(covered | ~inside)
        smp = nrnd.choice(idx, size=min(60, len(idx)), replace=False)
        clear = [float(np.min((GX[blocked] - GX[i]) ** 2 + (GY[blocked] - GY[i]) ** 2)) for i in smp]
        k = int(smp[int(np.argmax(clear))])
        p = (float(GX[k]), float(GY[k]))
        q = min(placed, key=lambda q_: (q_.c[0] - p[0]) ** 2 + (q_.c[1] - p[1]) ** 2)
        best = None
        for _t in range(P["offcut_tries"]):
            u = rnd.random()
            yaw = q.yaw if u < 0.75 else (q.yaw + math.pi / 2 if u < 0.95 else rnd.uniform(0, math.pi))
            r = mk(rnd.choice(VARIANTS), yaw, rnd.uniform(1.0, hi), q.lift)
            a_, b_ = rnd.uniform(-0.6, 0.6) * r.hl, rnd.uniform(-0.6, 0.6) * r.hw
            r.c = [p[0] - a_ * r.ux + b_ * r.uy, p[1] - a_ * r.uy - b_ * r.ux]
            res = clip_free(r.corners(), p)
            if res is None:
                continue
            poly, cuts = res
            if area(poly) < P["min_piece"]:
                continue
            r.poly, r.cuts = poly, cuts
            sc = float((cover_mask(r) & inside & ~covered).sum()) * cs * cs
            if best is None or sc > best[0]:
                best = (sc, r)
        if best is None or best[0] < P["min_piece"]:
            dead |= np.hypot(GX - p[0], GY - p[1]) < 0.12
            continue
        add(best[1])
    stats.append(len(placed))
    # turn the angled end outward where it meets the outline, then create the objects
    for i, r in enumerate(placed, 1):
        ends = [(r.c[0] + s * r.hl * r.ux, r.c[1] + s * r.hl * r.uy) for s in (1, -1)]
        out = [outside_d(ring_pts, e[0], e[1]) for e in ends]
        flip = out[1] > out[0] if abs(out[0] - out[1]) > 0.03 and max(out) > -0.3 else rnd.random() < 0.5
        o = bpy.data.objects.new(f"deck_{i:02d}", bpy.data.objects[r.name].data)  # linked duplicate
        o.rotation_euler = (math.radians(rnd.uniform(-1, 1) * P["tilt_jit"]),
                            math.radians(rnd.uniform(-1, 1) * P["tilt_jit"]),
                            r.yaw + (math.pi if flip else 0.0))
        o.scale = (r.sx, r.sy * (-1 if rnd.random() < 0.5 else 1), r.sz)
        o.location = (r.c[0], r.c[1], 0.0)
        g.objects.link(o)
        bpy.context.view_layer.update()
        if r.cuts:  # off-cut: its own mesh, the plank cut by the clip planes (still the frozen plank's look)
            o.data = clip_mesh(bpy.data.objects[r.name].data, f"deck_piece_{i:02d}", o.matrix_world, r.cuts)
        zmin = min((o.matrix_world @ Vector(cn)).z for cn in o.bound_box)
        o.location.z = r.lift - zmin  # lowest corner sits on the lift: nothing pokes under z = 0
    _under(g, [Vector(p) for p in ring_pts])
    bpy.context.view_layer.update()
    var = {}
    for r in placed:
        var[r.name] = var.get(r.name, 0) + 1
    return {"planks": len(placed), "variants": var, "after_passes": stats,
            "coverage": round(float((covered & inside).sum() / inside.sum()), 3)}


def clip_mesh(src, name, M, cuts):
    """Copy of the plank mesh keeping the side of every world-space cut plane (n . (x - pt) >= 0), cut faces
    filled and their edges chamfered a little so the cut ends read like the plank's own rim."""
    old = bpy.data.meshes.get(name)
    if old:
        bpy.data.meshes.remove(old)
    inv, m3t = M.inverted(), M.to_3x3().transposed()
    bm = bmesh.new()
    bm.from_mesh(src)
    new_faces = []
    for n, pt in cuts:
        nl = (m3t @ Vector((n[0], n[1], 0.0))).normalized()
        pl = inv @ Vector((pt[0], pt[1], 0.0))
        res = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=pl, plane_no=nl,
                                     clear_inner=True)
        loop = [e for e in res["geom_cut"] if isinstance(e, bmesh.types.BMEdge) and e.is_valid]
        if loop:
            new_faces += bmesh.ops.edgeloop_fill(bm, edges=loop)["faces"]
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    edges = list({e for f in new_faces if f.is_valid for e in f.edges})
    if edges and P["piece_bevel"] > 0:
        try:
            bmesh.ops.bevel(bm, geom=edges, offset=P["piece_bevel"], segments=1, affect="EDGES", clamp_overlap=True)
        except Exception:
            pass
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for mat in src.materials:
        me.materials.append(mat)
    return me


def _under(g, ring):
    """Dark backing under the joints, inset so it never sticks out past the ragged plank outline."""
    old = bpy.data.objects.get("deck_under")
    if old:
        bpy.data.objects.remove(old)
    bm = bmesh.new()
    verts = [bm.verts.new((p.x * P["under_scale"], p.y * P["under_scale"], 0.0)) for p in ring]
    f = bm.faces.new(verts)
    bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z < 0:
        f.normal_flip()
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [v for v in res["geom"] if isinstance(v, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=(0, 0, P["under_h"]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new("deck_under")
    bm.to_mesh(me)
    bm.free()
    mat = bpy.data.materials.get("M_deck_under") or bpy.data.materials.new("M_deck_under")
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = P["under_col"]
    bsdf.inputs["Roughness"].default_value = 0.95
    me.materials.append(mat)
    ob = bpy.data.objects.new("deck_under", me)
    g.objects.link(ob)

# r01 (own check, before the first judge): 16-20 planks, 0.6 coverage, brown underlay too bright.
