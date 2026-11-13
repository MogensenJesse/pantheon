"""Group 'frame': the well's timber frame, all from frozen parts (no new geometry except placement).
build() -> G_frame (centred on x = 0, y = 0, post feet on z = 0, windlass axle along X, crank on the +X post, +X = right).

Placement only (group rules): two square posts (linked copies of the frozen timber beams, stretched along their length and
slightly fattened), a tie beam between the post tops, two 45 deg knee braces from the post inner faces up to the beam
(their ends sink into post and beam, so the intersection line acts as the mitre), the windlass between the posts, the
crank outside the +X post, the bucket hanging from the strand end. Timber copies share the frozen mesh; windlass,
crank and bucket are collection instances (P_windlass, P_crank, P_bucket) so their several objects move rigidly.
All proportions were measured from refs/frame.png (post section 0.17 against the 0.44 m rope coil, camera az 35 / el 24).
Round notes at the bottom of the file.
"""
import math
import random

import bpy
from mathutils import Euler, Vector

P = dict(seed=1,
         gap=1.02,            # clear distance between the post inner faces
         post_s=0.18,         # post section (frozen timber is 0.153-0.163 square: fattened a little)
         post_h=1.82,         # post height (timber_a stretched ~1.8x, timber_b ~1.3x)
         beam_h=0.16, beam_d=0.15, beam_top_off=0.11, beam_embed=0.035,  # tie beam: top this far below the post tops
         axle_off=0.64,       # windlass axis this far below the post tops
         brace_w=0.135, brace_gap=0.04, brace_e=0.08,  # brace section; lower end this far above the log top; embed along the axis
         win_s=0.85,          # windlass log + rope, uniform scale (the reference's coil is smaller against the posts)
         log_embed=0.03, rope_dx=-0.04, log_fat=1.12,  # the log alone is stretched along X to span the gap; the coil sits a little left of centre
         crank_s=1.22, crank_x=1.3, crank_sink=0.004,
         bucket_s=1.0, bucket_yaw=12.0, bucket_overlap=0.07,
         jit_deg=0.35, jit_pos=0.003)

COLS = ("P_windlass", "P_crank", "P_bucket")


def _bbox(o):
    M = o.matrix_basis
    pts = [M @ Vector(c) for c in o.bound_box]
    return (Vector((min(p[i] for p in pts) for i in range(3))), Vector((max(p[i] for p in pts) for i in range(3))))


def _put(o, rot_deg, scale, center=None, zmin=None):
    """Rotation, scale, then translate so the world bbox centre sits at `center` (None entries keep 0) / its bottom at zmin."""
    o.rotation_euler = Euler([math.radians(a) for a in rot_deg], "XYZ")
    o.scale = scale
    o.location = (0, 0, 0)
    lo, hi = _bbox(o)
    c = (lo + hi) / 2
    loc = Vector((0, 0, 0))
    if center is not None:
        for i in range(3):
            if center[i] is not None:
                loc[i] = center[i] - c[i]
    if zmin is not None:
        loc.z = zmin - lo.z
    o.location = loc


def _inst(g, name, col):
    e = bpy.data.objects.new(name, None)
    e.instance_type = "COLLECTION"
    e.instance_collection = bpy.data.collections[col]
    e.empty_display_size = 0.05
    g.objects.link(e)
    return e


def _copy(g, name, src):
    o = bpy.data.objects.new(name, bpy.data.objects[src].data)  # linked duplicate: shares the frozen mesh
    g.objects.link(o)
    return o


def build(col="G_frame"):
    rnd = random.Random(P["seed"])
    J = lambda: rnd.uniform(-1, 1)  # noqa: E731
    g = bpy.data.collections.get(col)
    if g is None:
        g = bpy.data.collections.new(col)
        bpy.context.scene.collection.children.link(g)
    for o in list(g.objects):
        bpy.data.objects.remove(o)

    jd, jp = P["jit_deg"], P["jit_pos"]
    s, gap, H = P["post_s"], P["gap"], P["post_h"]
    xin = gap / 2            # |x| of the post inner faces
    xc = xin + s / 2         # |x| of the post axes
    xout = xin + s
    z_beam_top = H - P["beam_top_off"]
    z_beam_bot = z_beam_top - P["beam_h"]
    z_axle = H - P["axle_off"]

    # ---- frozen part measurements (never edited) ----
    log = bpy.data.objects["windlass"]
    lo_l, hi_l = _bbox(log)
    log_r = (hi_l.z - lo_l.z) / 2
    log_cz = (hi_l.z + lo_l.z) / 2
    rope = bpy.data.objects["windlass_rope"]
    tip_z = min(v.co.z for v in rope.data.vertices)
    tip_pts = [v.co for v in rope.data.vertices if v.co.z < tip_z + 0.02]
    tip_x = sum(p.x for p in tip_pts) / len(tip_pts)
    tip_y = sum(p.y for p in tip_pts) / len(tip_pts)
    cap_z = sum(_bbox(bpy.data.objects["crank_cap"])[i].z for i in (0, 1)) / 2
    bucket_top = max(_bbox(bpy.data.objects[n])[1].z for n in ("bucket", "bucket_bail", "bucket_grip", "bucket_band"))

    out = {}
    # ---- posts: timber length along X -> stood up along Z (rotation about Y by -90 deg) ----
    for nm, src, sx_, x in (("post_l", "timber_a", None, -xc), ("post_r", "timber_b", None, xc)):
        d = bpy.data.objects[src].dimensions
        o = _copy(g, nm, src)
        _put(o, (J() * 1.5, -90 + J() * jd, J() * jd), (H / d.x, s / d.y, s / d.z),
             center=(x + J() * jp, J() * jp, None), zmin=0.0)
        out[nm] = o
    # ---- tie beam between the posts (ends sink into them) ----
    d = bpy.data.objects["timber_a"].dimensions
    L = gap + 2 * P["beam_embed"]
    o = _copy(g, "tie_beam", "timber_a")
    _put(o, (0, J() * jd * 0.5, J() * jd * 0.5), (L / d.x, P["beam_d"] / d.y, P["beam_h"] / d.z),
         center=(0.0, J() * jp, z_beam_top - P["beam_h"] / 2))
    out["tie_beam"] = o
    # ---- knee braces: 45 deg from the post inner face (just above the log) up to the beam underside ----
    z_lo = z_axle + log_r + P["brace_gap"]
    run = z_beam_bot - z_lo
    ab = run * math.sqrt(2)
    Lb = ab + 2 * P["brace_e"]
    for nm, src, sgn in (("brace_l", "timber_a", -1), ("brace_r", "timber_b", 1)):
        d = bpy.data.objects[src].dimensions
        cx = sgn * (xin - run / 2)   # midpoint of the centre line (post face at +-xin, beam end at +-(xin - run))
        cz = z_lo + run / 2
        rot_y = -45.0 if sgn < 0 else -135.0
        o = _copy(g, nm, src)
        _put(o, (180.0 * (sgn > 0) * 0 + J() * 2.0, rot_y + J() * jd, 0), (Lb / d.x, P["brace_w"] / d.y, P["brace_w"] / d.z),
             center=(cx + J() * jp, J() * jp, cz + J() * jp))
        out[nm] = o
    # ---- windlass between the posts: log (stretched along X to span the gap) and rope (uniform scale, undistorted) ----
    ws = P["win_s"]
    wz = z_axle - log_cz * ws
    wl = _copy(g, "windlass_log", "windlass")
    wl.scale = ((gap + 2 * P["log_embed"]) / (hi_l.x - lo_l.x), ws * P["log_fat"], ws * P["log_fat"])
    wl.location = (0.0, 0.0, z_axle - log_cz * ws * P["log_fat"])
    wr = _copy(g, "windlass_rope_i", "windlass_rope")
    wr.scale = (ws, ws, ws)
    wr.location = (P["rope_dx"], 0.0, wz)
    out["windlass_log"], out["windlass_rope"] = wl, wr
    # ---- crank outside the +X post, plate inner face against the post, bolt cap on the axle line ----
    c = _inst(g, "crank_i", "P_crank")
    cs = P["crank_s"]
    c.scale = (cs * P["crank_x"], cs, cs)
    c.location = (xout - P["crank_sink"], 0.0, z_axle - cap_z * cs)
    out["crank"] = c
    # ---- bucket: bail top at the strand end ----
    b = _inst(g, "bucket_i", "P_bucket")
    bs = P["bucket_s"]
    b.scale = (bs, bs, bs)
    b.rotation_euler = (0, 0, math.radians(P["bucket_yaw"]))
    tx, ty, tz = tip_x * ws + P["rope_dx"], tip_y * ws, wz + tip_z * ws
    b.location = (tx, ty, tz + P["bucket_overlap"] - bucket_top * bs)
    out["bucket"] = b
    bpy.context.view_layer.update()
    return out

# r01 (own check, before the first judge): frozen log is 0.85 m (the brief said 1.4): gap 0.82 / 1.7 m posts keep the reference's
# ratios (gap 5 sections, height 10 sections, log centre 0.64 below the post tops, coil about 55 % of the clear span).
