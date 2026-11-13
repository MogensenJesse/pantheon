"""Root 'well_test': the whole well, assembled from the four frozen child groups as collection instances (placement only).
build() -> G_well_test. Each child is an empty with instance_type COLLECTION; per-instance position (m), yaw (deg about Z)
and uniform scale. No child, part or material is touched. Round notes at the bottom of the file.
"""
import math

import bpy

# pos = (x, y, z) of the group's origin in the well frame (deck top z = 0.088, shaft base z = 0, frame post feet z = 0,
# roof eave z = 0.035 in its own frame). Order = draw order of the empties (no meaning).
P = dict(
    deck=dict(pos=(0.1, -0.15, 0.0), yaw=210.0, s=1.15),
    shaft=dict(pos=(0.0, 0.0, 0.0), yaw=0.0, s=1.0),
    frame=dict(pos=(0.0, 0.0, 0.088), yaw=0.0, s=1.0),
    roof=dict(pos=(0.0, 0.0, 1.58), yaw=0.0, s=0.78),
)
CHILD = dict(deck="G_deck", shaft="G_shaft", frame="G_frame", roof="G_roof")

# Glue (the only new geometry): the reference shows, in each gable, the post running up to the ridge, a tie beam across the
# gable (along Y, on the post's outer face, ends sunk into the bargeboards) and two knee braces under it. The frozen frame
# stops 0.1 m under the ridge and has its tie beam along X only. All pieces are linked copies of the frozen timber meshes.
G = dict(on=True, post_sec=0.17, post_in=0.16, post_up=0.07,  # gable post section, sink into the frame post / into the ridge beam
         tie_dz=0.10, tie_h=0.11, tie_d=0.10, tie_dx=0.03, tie_sink=0.06,  # tie beam: centre above the eave tip, section, x past the post face, sink into the bargeboards
         brace=True, brace_sec=0.075, brace_dy=0.27, brace_dz=0.27)  # knee brace rise/run from the post foot to the tie underside
# the frozen roof's own numbers (own frame, metres): eave tip z, sheathing apex z, ridge beam underside z, slope, bargeboard x range
ROOF = dict(eave=0.04, ridge_bot=0.588, apex=0.634, tan=math.tan(math.radians(38.0)))
FRAME = dict(post_xc=0.5985, post_top=1.82, post_outer=0.689)


def _beam(g, name, src, a, b, sec):
    """Linked copy of a frozen timber mesh stretched along a->b (length = |b-a|, square section `sec`), centred between a and b."""
    from mathutils import Matrix, Vector
    src_o = bpy.data.objects[src]
    bb = [Vector(c) for c in src_o.bound_box]
    lo = Vector([min(p[i] for p in bb) for i in range(3)])
    hi = Vector([max(p[i] for p in bb) for i in range(3)])
    d, c = hi - lo, (hi + lo) / 2
    a, b = Vector(a), Vector(b)
    ex = (b - a).normalized()
    ey = Vector((0, 1, 0)) if abs(ex.z) > 0.99 else Vector((0, 0, 1)).cross(ex).normalized()
    ez = ex.cross(ey)
    m3 = Matrix(((ex.x, ey.x, ez.x), (ex.y, ey.y, ez.y), (ex.z, ey.z, ez.z))) @ Matrix.Diagonal(((b - a).length / d.x, sec / d.y, sec / d.z))
    m = m3.to_4x4()
    m.translation = (a + b) / 2 - m3 @ c
    o = bpy.data.objects.new(name, src_o.data)
    o.matrix_world = m
    g.objects.link(o)
    return o


def _glue(g):
    f, r = P["frame"], P["roof"]
    sf, sr = f["s"], r["s"]
    xc, ztop = FRAME["post_xc"] * sf + f["pos"][0], f["pos"][2] + FRAME["post_top"] * sf
    z_eave = r["pos"][2] + ROOF["eave"] * sr
    z_ridge = r["pos"][2] + ROOF["ridge_bot"] * sr
    z_apex = r["pos"][2] + ROOF["apex"] * sr
    out = []
    for k, sx in enumerate((-1, 1)):
        out.append(_beam(g, f"gable_post_{k}", "timber_b", (sx * xc, 0, ztop - G["post_in"]), (sx * xc, 0, z_ridge + G["post_up"]), G["post_sec"]))
        xt = sx * (FRAME["post_outer"] * sf + G["tie_dx"] + G["tie_d"] / 2)
        zt = z_eave + G["tie_dz"]
        half = (z_apex - zt) / ROOF["tan"] + G["tie_sink"]  # the sheathing line at the beam's centre height, plus a sink into the bargeboards
        out.append(_beam(g, f"gable_tie_{k}", "timber_a", (xt, -half, zt), (xt, half, zt), G["tie_h"]))
        if G["brace"]:
            for j, sy in enumerate((-1, 1)):
                zb = zt - G["tie_h"] / 2
                out.append(_beam(g, f"gable_brace_{k}{j}", "timber_a", (xt, sy * 0.05, zb - G["brace_dz"]), (xt, sy * (0.05 + G["brace_dy"]), zb + 0.02), G["brace_sec"]))
    return out


def build(col="G_well_test"):
    g = bpy.data.collections.get(col)
    if g is None:
        g = bpy.data.collections.new(col)
        bpy.context.scene.collection.children.link(g)
    for o in list(g.objects):
        bpy.data.objects.remove(o)
    out = {}
    for k, cfg in P.items():
        e = bpy.data.objects.new("well_" + k, None)
        e.instance_type = "COLLECTION"
        e.instance_collection = bpy.data.collections[CHILD[k]]
        e.empty_display_size = 0.1
        e.location = cfg["pos"]
        e.rotation_euler = (0, 0, math.radians(cfg["yaw"]))
        e.scale = (cfg["s"],) * 3
        g.objects.link(e)
        out[k] = e
    if G["on"]:
        for o in _glue(g):
            out[o.name] = o
    return out


# Round notes (judged round 1 = file tag r10, overall 6.3, stop at the review gate):
#  camera fitted to input.png: az 30, el 20, lens 50 mm (a 135 mm lens made the roof look too small and the posts too far apart),
#  ring = metric (1.674 m across = 715 px). Frame stays 1.0 (windlass coil, posts and crank land on the picture), base on the deck top.
#  Roof 0.78: silhouette width matches the picture (the frozen roof is wider against the posts than the picture's); eave z 1.58 so the ridge
#  beam sits 0.13 m above the frame post tops, bridged by the glue gable posts. Deck 1.15, yaw 210, offset (0.1, -0.15): best overlap of
#  the deck outline with the wood-coloured pixels outside the ring (build/root_deckfit2.py), yaw picked among near-equal fits by plank look.
#  Judge (round 1) group-scope fix not applied: ring 1.12-1.15x with frame and roof lifted (would move the windlass off the picture).
