"""Group 'stairs' (t10: three chunky steps, 0.7 m stringers, one block missing, one sunk; was four steps): four steps, 1.92 m wide, rows alternating two wide blocks and three narrow ones (so the seams are staggered). From the second row on the
step blocks are turned round so their ledge lies behind the riser; each stands on copies of itself so nothing floats. Two slanted cheek wedges (new
stone pieces built with the parts' stone recipe) flank the stairs, with moss on the slope. The front is -Y; the stairs climb towards +Y."""
import bmesh
import bpy
import random

from groups import gcol, place, put, rx, rz
from tcommon import chipped_block

G = "stairs"
RISE = 0.27  # t10: three chunky steps at full height (t09: four at 0.26, squashed to 0.18 by the root's z scale 0.7)
RUN = 0.45
ROWS = 3
MISSING = (2, 1)  # (row, block) fallen out of the top row (row 2 is a wide row: blocks 0 and 1)
SUNK = (1, 0)  # sunk 5 cm and tilted


def _wedge(name, seed, x):
    """A stone wedge 0.4 m thick whose top follows the stair slope (30 degrees), chiselled like the other stones."""
    plane = ((0.0, 0.8, 0.9), (0.0, -0.51, 0.86))  # t10: follows the 31 deg flight of three steps (t09: 4 steps, 0.4 x 1.95 block)
    ob = chipped_block(name, "stairs", (0.7, 1.6, 1.5), seed, tilt=1.5, facets=20, facet_tilt=4.0, facet_depth=(0.003, 0.015), corner_depth=(0.04, 0.1), edges=6,
                       edge_depth=(0.02, 0.04), edge_facets=1, extra=[plane], moss=0.3, bevel=0.012, segs=1, flat_bottom=True, top_facets=6, top_tilt=2.0,
                       moss_kw=dict(w_noise=0.45, w_up=0.6, w_prox=0.5, noise_scale=8.0))
    ob.location = (x, 0.45, 0.0)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    bpy.data.collections["G_" + G].objects.link(ob)
    return ob


def _core(x0, y0, x1, y1, z1):
    """A dark-stone box under the whole stair, so any seam between the blocks shows stone and not the background."""
    me = bpy.data.meshes.new("stair_core")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = x0 + (v.co.x + 0.5) * (x1 - x0)
        v.co.y = y0 + (v.co.y + 0.5) * (y1 - y0)
        v.co.z = (v.co.z + 0.5) * z1
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("stair_core", me)
    m = bpy.data.materials.get("M_wall_core")
    if m is not None:
        me.materials.append(m)
    bpy.data.collections["G_" + G].objects.link(ob)


def build():
    gcol(G)
    rnd = random.Random(21)
    for r in range(ROWS):
        wide = r % 2 == 0
        xs = (-0.48, 0.48) if wide else (-0.64, 0.0, 0.64)
        sc = (0.75 if wide else 0.5, 1.0, 1.0)
        for k, x in enumerate(xs):
            src = ("step_a", "step_b", "step_a")[(r + k) % 3]
            rot = rz(0) if r == 0 else rz(180)  # the ledge of the upper steps points back into the stairs
            for under in range(r + 1):
                top = under == r
                if top and (r, k) == MISSING:
                    continue
                y = r * RUN + (0.0 if top else 0.14)
                sunk = top and (r, k) == SUNK
                loc = (x + (rnd.uniform(-0.006, 0.006) if top else 0.0), y, under * RISE - (0.05 if sunk else 0.0))
                tilt = rx(4.0) if sunk else rz(0)
                place(G, src, loc, (rot @ rz(rnd.uniform(-0.8, 0.8)) @ tilt) if top else rot, sc)
    _core(-0.93, 0.3, 0.93, 1.2, 0.47)  # two boxes, both below the tread tops of the rows in front of them
    _core(-0.93, 0.75, 0.93, 1.2, 0.75)
    _wedge("cheek_l", 61, -1.28)  # 0.7 m stringers; inner faces overlap the step ends by a few cm, no gap
    _wedge("cheek_r", 62, 1.28)
    place(G, "step_b", (1.95, 0.35, 0.0), rz(118) @ rx(-14) @ rz(0), (0.5, 1.0, 1.0))  # the missing top block, fallen beside the stairs
    place(G, "rubble_b", (-1.75, -0.2, 0.0), rz(30), (1.6, 1.6, 1.6))  # rubble against the wedge toe
    place(G, "rubble_c", (-1.7, -0.6, 0.0), rz(110), (1.4, 1.4, 1.4))
