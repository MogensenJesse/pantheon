"""Carving helpers of the temple parts: relief ribbons (a meander / interlace is a polyline given width and height, as one solid), extruded
profiles and tubes. All build into a bmesh."""
import math

import bmesh
from mathutils import Vector


def ribbon(bm, pts, width, origin, u, v, n, depth=0.014, sink=0.003):
    """A relief ribbon: the 2D polyline `pts` [(a, b)] (metres in the panel plane, a along `u`, b along `v`) widened to `width` with mitred
    corners, standing `depth` proud of the plane through `origin` with outward normal `n` and sunk `sink` into it. The outline must not
    cross itself (an orthogonal spiral or a gentle curve). Returns the faces."""
    pts = [(float(a), float(b)) for a, b in pts]
    hw = width / 2
    left, right = [], []
    for i, p in enumerate(pts):
        d0 = (pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) if i > 0 else None
        d1 = (pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) if i < len(pts) - 1 else None
        n0 = (-d0[1] / math.hypot(*d0), d0[0] / math.hypot(*d0)) if d0 else None
        n1 = (-d1[1] / math.hypot(*d1), d1[0] / math.hypot(*d1)) if d1 else None
        a, b = n0 or n1, n1 or n0
        m = (a[0] + b[0], a[1] + b[1])
        ml = math.hypot(*m)
        m = (m[0] / ml, m[1] / ml)
        k = hw / max(m[0] * a[0] + m[1] * a[1], 0.25)  # miter length, capped
        left.append((p[0] + m[0] * k, p[1] + m[1] * k))
        right.append((p[0] - m[0] * k, p[1] - m[1] * k))
    outline = left + right[::-1]
    P = lambda a, b, h: Vector(origin) + Vector(u) * a + Vector(v) * b + Vector(n) * h  # noqa: E731
    lo = [bm.verts.new(P(a, b, -sink)) for a, b in outline]
    hi = [bm.verts.new(P(a, b, depth)) for a, b in outline]
    faces = [bm.faces.new(hi), bm.faces.new(lo[::-1])]
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        faces.append(bm.faces.new((lo[i], lo[j], hi[j], hi[i])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    tri = bmesh.ops.triangulate(bm, faces=faces[:2], quad_method="BEAUTY", ngon_method="EAR_CLIP")
    return faces + tri["faces"]


# an orthogonal spiral ("Greek key"), unit square, to scale and mirror
KEY = [(0, 0), (0, 1), (1, 1), (1, 0.22), (0.26, 0.22), (0.26, 0.78), (0.74, 0.78), (0.74, 0.5), (0.5, 0.5)]


def meander(bm, size, origin, u, v, n, mirror=False, width=0.035, depth=0.014, sink=0.003):
    """One spiral-key panel of `size` metres centred on `origin`."""
    pts = [((1 - x if mirror else x) * size - size / 2, y * size - size / 2) for x, y in KEY]
    return ribbon(bm, pts, width, origin, u, v, n, depth=depth, sink=sink)


def extrude_profile(bm, prof, thickness, origin=(0, 0, 0), scale=1.0):
    """Solid from a 2D profile [(x, z)] in the XZ plane, extruded along Y by `thickness` centred on y = 0."""
    ox, oy, oz = origin
    a = [bm.verts.new((ox + x * scale, oy - thickness / 2, oz + z * scale)) for x, z in prof]
    b = [bm.verts.new((ox + x * scale, oy + thickness / 2, oz + z * scale)) for x, z in prof]
    faces = [bm.faces.new(a[::-1]), bm.faces.new(b)]
    for i in range(len(prof)):
        j = (i + 1) % len(prof)
        faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    bmesh.ops.triangulate(bm, faces=faces[:2], quad_method="BEAUTY", ngon_method="EAR_CLIP")


def tube(bm, pts, radii, sides=3, cap=True):
    """Tapered tube through 3D points, one radius per point, `sides` sided (3 = a low-poly triangular stem)."""
    pts = [Vector(p) for p in pts]
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))).normalized()
        c = d.cross(a)
        rings.append([bm.verts.new(p + (a * math.cos(math.tau * k / sides) + c * math.sin(math.tau * k / sides)) * radii[i]) for k in range(sides)])
    faces = []
    for i in range(len(rings) - 1):
        for k in range(sides):
            j = (k + 1) % sides
            faces.append(bm.faces.new((rings[i][k], rings[i + 1][k], rings[i + 1][j], rings[i][j])))
    if cap:
        faces += [bm.faces.new(rings[0][::-1]), bm.faces.new(rings[-1])]
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    return faces
