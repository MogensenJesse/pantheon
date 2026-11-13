"""Own check: pick the deck yaw / offset / scale whose projected outline best covers the reference's wood-coloured pixels
outside the ring. Runs inside root_work.blend (Blender python has numpy). Prints the best few as @@RESULT@@."""
import json
import math
import sys

import bpy
import numpy as np
from mathutils import Vector

R = r"D:/pantheon/assets-src/model-loop/well_test"
W, H = 2752, 1536
CAM = dict(az=30.0, el=20.0, lens=50.0, ppm=427.0, target=(0.0, 0.0, 0.75), px=(1410.0, 835.0))
for line in open(R + "/build/root_round.py").read().splitlines():
    if line.startswith("CAM.update"):
        exec(line)
STEP = 16  # analysis grid in image pixels


def load(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    a = a.reshape(h, w, 4)[::-1]  # top-down rows
    return a


ref = load(R + "/input.png")
ref = ref[::STEP // 2, ::STEP // 2][:, :, :3]  # coarse, still 2x oversampled
ref = ref[::2, ::2]
gh, gw = ref.shape[:2]
r, g, b = ref[..., 0], ref[..., 1], ref[..., 2]
mx = ref.max(2)
mn = ref.min(2)
sat = (mx - mn) / np.maximum(mx, 1e-4)
hue = np.zeros_like(mx)
d = np.maximum(mx - mn, 1e-4)
hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
yy, xx = np.mgrid[0:gh, 0:gw]
px_x, px_y = xx * STEP + STEP // 2, yy * STEP + STEP // 2
wood = (sat > 0.45) & (mx > 0.3) & (hue > 18) & (hue < 48) & (px_y > 1000)
# ring silhouette (half-size alpha render from the last silhouette pass)
ring_a = load(R + "/renders/root/r08_sil_shaft.png")[..., 3]
ring = ring_a[(px_y // 2).clip(0, ring_a.shape[0] - 1), (px_x // 2).clip(0, ring_a.shape[1] - 1)] > 0.5
valid = ~ring
# deck outline: convex hull of the deck's top vertices (world xy)
pts = []
for o in bpy.data.collections["G_deck"].objects:
    if o.type != "MESH":
        continue
    mw = o.matrix_world
    for v in o.data.vertices:
        p = mw @ v.co
        pts.append((p.x, p.y))
pts = sorted(set((round(x, 3), round(y, 3)) for x, y in pts))


def hull(P):
    def cr(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in P:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(P):
        while len(up) >= 2 and cr(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return lo[:-1] + up[:-1]


Hl = np.array(hull(pts))
a_, e_ = math.radians(CAM["az"]), math.radians(CAM["el"])
f_px = CAM["lens"] / 36.0 * W
dist = f_px / CAM["ppm"]
tgt = np.array(CAM["target"])
cdir = np.array([math.sin(a_) * math.cos(e_), -math.cos(a_) * math.cos(e_), math.sin(e_)])
cpos = tgt + cdir * dist
fwd = -cdir
right = np.array([math.cos(a_), math.sin(a_), 0.0])
up = np.cross(right, fwd)
up = up if up[2] > 0 else -up


def project(P3):
    v = P3 - cpos
    z = v @ fwd
    return np.stack([CAM["px"][0] + f_px * (v @ right) / z, CAM["px"][1] - f_px * (v @ up) / z], 1)


def mask_for(yaw, dx, dy, s, z=0.088):
    c, sn = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    xy = np.stack([s * (Hl[:, 0] * c - Hl[:, 1] * sn) + dx, s * (Hl[:, 0] * sn + Hl[:, 1] * c) + dy], 1)
    P3 = np.concatenate([xy, np.full((len(xy), 1), z)], 1)
    q = project(P3)
    # convex polygon (hull stays convex under similarity + projection): half-plane test, orientation by signed area
    area = np.sum(q[:, 0] * np.roll(q[:, 1], -1) - np.roll(q[:, 0], -1) * q[:, 1])
    sgn = 1 if area > 0 else -1
    inside = np.ones(px_x.shape, bool)
    for i in range(len(q)):
        j = (i + 1) % len(q)
        cr_ = (q[j, 0] - q[i, 0]) * (px_y - q[i, 1]) - (q[j, 1] - q[i, 1]) * (px_x - q[i, 0])
        inside &= (cr_ * sgn >= 0)
    return inside


def iou(m):
    a = m & valid
    t = wood & valid
    return (a & t).sum() / max((a | t).sum(), 1)


res = []
base = iou(mask_for(0, 0, 0, 1.0))
for yaw in range(0, 360, 15):
    for s in (0.95, 1.0, 1.05, 1.1, 1.15):
        for dx in np.arange(-0.3, 0.31, 0.1):
            for dy in np.arange(-0.4, 0.31, 0.1):
                res.append((iou(mask_for(yaw, dx, dy, s)), yaw, round(float(dx), 2), round(float(dy), 2), s))
res.sort(reverse=True)
# refine the best by local search
best = res[0]
for _ in range(2):
    sc, yaw, dx, dy, s = best
    for dyaw in (-5, 0, 5):
        for dsc in (-0.025, 0, 0.025):
            for ddx in (-0.05, 0, 0.05):
                for ddy in (-0.05, 0, 0.05):
                    cand = (iou(mask_for(yaw + dyaw, dx + ddx, dy + ddy, s + dsc)), yaw + dyaw, round(dx + ddx, 3), round(dy + ddy, 3), round(s + dsc, 3))
                    if cand[0] > best[0]:
                        best = cand
print("@@RESULT@@" + json.dumps(dict(base=base, top=res[:6], refined=best, wood_px=int((wood & valid).sum()), grid=[gw, gh])))
# debug image: truth (green) vs predicted at the best (red)
m = mask_for(best[1], best[2], best[3], best[4])
img = np.ones((gh, gw, 4), np.float32)
img[..., :3] = 1.0
img[wood & valid] = (0.2, 0.7, 0.2, 1)
img[m & valid & ~wood] = (0.9, 0.2, 0.2, 1)
img[m & valid & wood] = (0.2, 0.2, 0.9, 1)
im = bpy.data.images.new("dbg", gw, gh, alpha=True)
im.pixels.foreach_set(img[::-1].reshape(-1))
im.filepath_raw = R + "/renders/root/deckfit.png"
im.file_format = "PNG"
im.save()
