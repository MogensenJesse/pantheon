# assets-src/village/villagers/builder_m/soften_builder.py — experiment: the ears grow out of the head.
#
# Opens the checkpoint builder_m.blend (never modified) and writes builder_m_soft.blend:
#  1. three new rows run through the head (z 1.53, 1.4533, 1.4317) and the sides are cut into three columns;
#  2. each ear is extruded from the middle side column between the ear rows, like a leaf (thicker in the middle,
#     narrow at the ends; table EAR), and the separate ear shells are deleted;
#  3. a Smooth modifier (0.25 x 1, "Soften") sits in front of the armature.
# The nose stays the separate pyramid of the checkpoint (a nose extruded from the face, and one pushed out as a ramp,
# were tried and rejected). Shading stays flat. Rig weights, UVs and the part layer are interpolated by the cuts and
# carried by the extrusion.
#
#   blender --background --python soften_builder.py
import os

import bmesh
import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'builder_m.blend')
OUT = os.path.join(HERE, 'builder_m_soft.blend')
MESH = 'Builder_MESH'
PART_NAMES = ['apron', 'arm.L', 'arm.R', 'boot.L', 'boot.R', 'cap', 'ear.L', 'ear.R', 'hand.L', 'hand.R', 'head',
              'leg.L', 'leg.R', 'neck', 'nose', 'pelvis', 'thumb.L', 'thumb.R', 'torso']

# Cuts through the head's rings (z of the ring above -> below): the new rows are the ear's top, middle and bottom rows.
BAND_CUTS = [(1.585, 1.475, 1), (1.475, 1.41, 2)]
SIDE_CUTS = 2  # two loops: the middle of the three side columns is the ear's base

# Ear: outward push and thickness scale per row (z of the base rows, top to bottom).
EAR = [(1.53, 0.010, 0.35), (1.475, 0.040, 0.85), (1.4533, 0.050, 1.0), (1.4317, 0.046, 0.9), (1.41, 0.010, 0.35)]


def rows_of(bm, layer, pid):
    rows = {}
    for v in bm.verts:
        if v[layer] == pid:
            rows.setdefault(round(v.co.z, 4), []).append(v)
    return dict(sorted(rows.items(), reverse=True))


def edge_between(a, b):
    for e in a.link_edges:
        if e.other_vert(a) is b:
            return e
    raise RuntimeError('no edge between ring vertices')


def ring_edges(rows, key, pick):
    """The ring edge on one side of each ring: pick(verts) returns the two vertices of that side."""
    return [edge_between(*pick(vs)) for z, vs in rows.items()]


def side_pair(sign):
    return lambda vs: sorted(vs, key=lambda v: -sign * v.co.x)[:2]


def set_part(layer, pid, geom):
    for g in geom:
        if isinstance(g, bmesh.types.BMVert):
            g[layer] = pid


def main():
    bpy.ops.wm.open_mainfile(filepath=SRC)
    ob = [o for o in bpy.data.objects if o.name.startswith(MESH)][0]
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    layer = bm.verts.layers.int['part']
    deform = bm.verts.layers.deform.active
    pid = {n: i + 1 for i, n in enumerate(PART_NAMES)}
    count = {n: sum(1 for v in bm.verts if v[layer] == i) for n, i in pid.items()}
    assert count['nose'] == 7 and count['ear.L'] == 20 and count['ear.R'] == 20, count
    head = pid['head']

    # 1. three new rows through the head
    # (every bmesh operation invalidates the vertices held from before it: rows are fetched again each time)
    rows = rows_of(bm, layer, head)
    assert len(rows) == 6, list(rows)
    zs = list(rows)
    for top, low, cuts in BAND_CUTS:
        rows = rows_of(bm, layer, head)
        upper = rows[min(rows, key=lambda z: abs(z - top))]
        lower = rows[min(rows, key=lambda z: abs(z - low))]
        edges = [e for v in upper for e in v.link_edges if e.other_vert(v) in lower]
        assert len(edges) == 8
        res = bmesh.ops.subdivide_edges(bm, edges=edges, cuts=cuts, use_grid_fill=True)
        set_part(layer, head, res['geom'])
    rows = rows_of(bm, layer, head)
    assert len(rows) == 9, list(rows)

    # 2. vertical loops through both sides
    for sign in (1, -1):
        rows = rows_of(bm, layer, head)
        res = bmesh.ops.subdivide_edges(bm, edges=ring_edges(rows, 'side', side_pair(sign)), cuts=SIDE_CUTS,
                                        use_grid_fill=True)
        set_part(layer, head, res['geom'])
    rows = rows_of(bm, layer, head)

    # 3. ears: extrude the middle side column between the ear rows
    for sign in (1, -1):
        rows = rows_of(bm, layer, head)
        ear_rows = [min(rows, key=lambda z: abs(z - e[0])) for e in EAR]
        chains = []
        for z in ear_rows:
            xmax = max(sign * v.co.x for v in rows[z])
            chain = sorted((v for v in rows[z] if abs(sign * v.co.x - xmax) < 1e-4), key=lambda v: v.co.y)
            assert len(chain) == SIDE_CUTS + 2, (z, len(chain))
            chains.append(chain[1:3])
        faces = []
        for upper, lower in zip(chains, chains[1:]):
            quad = set(upper + lower)
            f = next(f for f in upper[0].link_faces if set(f.verts) == quad)
            faces.append(f)
        ycenter = sum(v.co.y for ch in chains for v in ch) / (2 * len(chains))
        base = {}  # original vertex -> row index, matched by position after the extrusion
        for k, ch in enumerate(chains):
            for v in ch:
                base[v.index] = (k, v.co.copy())
        res = bmesh.ops.extrude_face_region(bm, geom=faces)
        new_verts = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
        set_part(layer, head, new_verts)
        for v in new_verts:
            k = min(base.values(), key=lambda kv: (kv[1] - v.co).length)[0]  # same position as its original
            _, out, thick = EAR[k]
            v.co.x += sign * out
            v.co.y = ycenter + (v.co.y - ycenter) * thick
        # the extruded faces replace the originals; keep the interior of the head closed
    bm.verts.ensure_lookup_table()

    # 4. the separate ear shells go (the nose stays)
    drop = [v for v in bm.verts if v[layer] in (pid['ear.L'], pid['ear.R'])]
    bmesh.ops.delete(bm, geom=drop, context='VERTS')
    for f in bm.faces:
        f.smooth = False  # flat shading, as before
    unweighted = [v for v in bm.verts if v[layer] == head and not v[deform]]
    print('NEW HEAD verts', sum(1 for v in bm.verts if v[layer] == head), 'unweighted', len(unweighted))
    bm.to_mesh(me)
    bm.free()
    me.update()

    mod = ob.modifiers.new('Soften', 'SMOOTH')
    mod.factor, mod.iterations = 0.25, 1
    ob.modifiers.move(len(ob.modifiers) - 1, 0)  # before the armature
    print('TRIS', sum(len(p.vertices) - 2 for p in me.polygons))
    bpy.ops.wm.save_as_mainfile(filepath=OUT)
    print('SOFTENED', OUT)


if __name__ == '__main__':
    main()
