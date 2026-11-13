"""Group 'trunk': the braided trunk of the ash. Swept bark strands (bark_limb.strand, the method chosen after build/trunk_test.py): a core
column so the braid is solid, three outer strands wound one way and three inner ones wound the other way (so they cross), each swaying
in an S as it climbs, a closed skirt of toes at the foot, and every strand leaving the column at its own height as a limb with an elbow
and a cut end. One mesh, front = -Y. The carved knotwork band is not in yet."""
import math
import random

import bmesh
from mathutils import Vector

import bark_limb as BL
import tree_common as TC
from tcommon import drop, finish_mesh, set_materials

# r01 (judge 3.8): thin twisted stalk with a hand of nine tapered fingers from one hub, tripod foot, 4.5 m wide.
# r02 (judge 4.0): fat column, limbs at staggered heights; still read as three straight bars, near-vertical stick limbs, open foot,
#   panels of 0.6-1.0 m like stone blocks. (A full turn per strand was tried first: a coiled screw. Moss weight 0.5 on up faces: all green.)
# r03: two counter-wound families with an S-sway, sampled every 0.4 m; limbs leave at about 40 degrees with an elbow; 7 toes; 12 sides
#   and shorter rings (plates about 0.22 x 0.45 m), thin seams, greyer bark, softer duller moss
P = dict(tops=(3.3, 3.9, 4.2, 3.4, 3.7, 4.4), core_z=(-0.4, 0.4, 1.2, 2.2, 3.2, 4.0, 4.6), core_r=(0.75, 0.55, 0.42, 0.4, 0.4, 0.36, 0.25),
         radius=0.42, orbit=(0.8, 0.5), turns=0.6, sway=0.35, flare=0.35, reach=0.75, height=6.0, toes=7,
         jit_r=0.07, stagger=0.15, ring=1.1, twist=0.12, seam=0.009, gain=1.55, moss=0.7)  # first r03 try (tex_sat 0.4, cool tint, gain 1.2) was cold dark stone: #666159 / #2d2821


def skeleton(seed=5):
    """[(control points, radii, sides)] of every strand."""
    rnd = random.Random(seed)
    up = Vector((0, 0, 1))
    out = [([(0.05 * math.sin(2 * z), 0.05 * math.cos(1.7 * z), z) for z in P["core_z"]], list(P["core_r"]), 11)]
    for i in range(6):
        outer = i % 2 == 0
        r0 = P["radius"] * (1.0 if outer else 0.92)
        top = P["tops"][i]
        th0 = math.tau * i / 6 + rnd.uniform(-0.12, 0.12)
        turns = (P["turns"] if outer else -P["turns"]) * top / 3.5
        phase = rnd.uniform(0, math.tau)
        pts, radii = [], []
        n = 10
        for k in range(n + 1):
            z = -0.4 + (top + 0.4) * k / n
            t = max(z, 0.0) / top
            foot = max(0.0, 1 - max(z, 0.0) / 0.7) ** 2  # the last 0.7 m: the strand swells and curls outward
            rho = P["orbit"][0 if outer else 1] + P["flare"] * foot * (1.0 if outer else 1.7) + 0.08 * math.sin(5 * t + phase)
            th = th0 + math.tau * turns * t + P["sway"] * math.sin(math.tau * 1.5 * t + phase)
            pts.append((rho * math.cos(th), rho * math.sin(th), z))
            radii.append(r0 * (1.0 + 0.3 * foot - 0.12 * t))
        o = Vector((pts[-1][0], pts[-1][1], 0)).normalized()
        side = Vector((-o.y, o.x, 0)) * rnd.choice((-1, 1))
        base = Vector(pts[-1])
        reach = P["reach"] * rnd.uniform(0.85, 1.15) * (1.0 if outer else 1.25)
        elbow = base + o * reach + up * reach * 0.9  # leaves at about 40 degrees from vertical
        rise = max(0.5, min(1.5, P["height"] - elbow.z)) * rnd.uniform(0.85, 1.0)
        pts += [tuple(base + o * reach * 0.5 + up * reach * 0.5), tuple(elbow), tuple(elbow + side * 0.12 + up * rise * 0.5), tuple(elbow + o * 0.22 + side * 0.25 + up * rise)]
        radii += [r0 * 0.82, r0 * 0.74, r0 * 0.64, r0 * 0.55]
        out.append((pts, radii, 12))
        if i in (0, 3):  # a fork: starts inside the limb, leaves the other way with its own elbow
            e2 = elbow - side * 0.7 + up * 0.25
            out.append(([tuple(elbow - o * 0.3 - up * 0.25), tuple(elbow - side * 0.35 + up * 0.05), tuple(e2), tuple(e2 - side * 0.12 + up * max(0.5, min(1.1, P["height"] - e2.z)))],
                        [r0 * 0.68, r0 * 0.62, r0 * 0.55, r0 * 0.46], 9))
    for j in range(P["toes"]):  # short root toes that close the gaps of the skirt
        th = math.tau * (j + 0.5) / P["toes"] + rnd.uniform(-0.2, 0.2)
        o = Vector((math.cos(th), math.sin(th), 0))
        reach = rnd.uniform(1.25, 1.55)
        out.append(([tuple(o * 0.45 + up * 1.0), tuple(o * 0.95 + up * 0.5), tuple(o * reach + up * 0.14)], [0.36, 0.33, 0.24], 8))
    return out


def build(name="trunk"):
    bm = bmesh.new()
    keep = dict(BL.P)
    BL.P.update(jit_r=P["jit_r"], stagger=P["stagger"])
    for i, (pts, radii, sides) in enumerate(skeleton()):
        BL.strand(bm, pts, radii, seed=60 + i, sides=sides, ring=P["ring"], twist=P["twist"], tip=False, step=0)
    BL.P.update(keep)
    for v in bm.verts:  # it stands on the ground
        v.co.z = max(v.co.z, 0.0)
    BL.seams(bm, P["seam"])
    ob = finish_mesh(bm, name, "trunk", bevel=0, flat=True)
    set_materials(ob, TC.bark_mat("M_bark_trunk", moss=P["moss"], seams=0.55, gain=P["gain"], tex_sat=0.7,
                                  moss_kw=dict(scale=1.4, stretch=(1.0, 1.0, 0.5), w_up=0.3, col=(0.085, 0.095, 0.04), breakup=0.15)))
    return ob


def build_all():
    drop("trunk")
    build()
    return ["trunk"]
