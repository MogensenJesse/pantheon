"""Fit a pinhole camera to the four corners of a known square on the ground, then cast pixels onto the ground.

numpy only. Conventions (same as the rest of the loop): Blender world, Z up, metres, origin at the centre
of the square, front = -Y. Azimuth 0 looks from the front (-Y), 90 from the right (+X); elevation is in
degrees above the horizon, so (az, el, lens) matches loop_render's `ref_view`.

    from camera_fit import fit
    cam = fit(corners_px, (W, H), tile_m=1.0)        # corners: front-left, front-right, back-right, back-left
    cam.az, cam.el, cam.lens_mm, cam.dist            # lens for a 36 mm sensor fitted to the longer image side
    cam.ground_xy([(px, py), ...])                   # pixel -> (x, y) on z = 0, in the same units as tile_m
    cam.blender()                                    # location / rotation_euler / lens for bpy

Corner labels are world labels: front-left = (-s, -s), front-right = (+s, -s), back-right = (+s, +s),
back-left = (-s, +s) with s = tile_m / 2. If the tile is seen turned by an angle, the azimuth you get is
relative to that labelling (label the edge you call "front" as front-left -> front-right).
  tile_yaw=45  the tile stands as a diamond in the world (a corner points to the front, as in a 3/4 game-asset
               view whose scene faces the camera): give the corners as front, right, back, left.
  weights=[..] one weight per corner (default 1). Give a corner that is hidden and extrapolated from its two
               edges a low weight (about sigma_visible / sigma_hidden, e.g. 0.2): the fit then follows the
               corners you can see. `cam.err_px` lists each corner's reprojection error.

The pose comes from the homography of the four corners (closed form, principal point at the image centre,
square pixels), then a short Levenberg-Marquardt refinement of rotation, translation and focal length on the
reprojection error. Four points fix the pose exactly; with noisy picks the refinement spreads the error.

Self-check:  python camera_fit.py --selftest      Fit from a JSON file:  python camera_fit.py picks.json
  picks.json = {"size": [W, H], "tile_m": 1.0, "corners": [[x, y], [x, y], [x, y], [x, y]], "tile_yaw": 0, "weights": [1, 1, 1, 1]}
"""
import json
import math
import sys

import numpy as np

SENSOR_MM = 36.0  # Blender default; sensor fit AUTO applies it to the longer image side


def _rod(r):
    """Rotation matrix from a rotation vector (Rodrigues)."""
    th = float(np.linalg.norm(r))
    if th < 1e-12:
        return np.eye(3)
    k = r / th
    K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]])
    return np.eye(3) + math.sin(th) * K + (1 - math.cos(th)) * (K @ K)


def _rotvec(R):
    """Rotation vector from a rotation matrix."""
    c = max(-1.0, min(1.0, (np.trace(R) - 1) / 2))
    th = math.acos(c)
    if th < 1e-9:
        return np.zeros(3)
    if math.pi - th < 1e-6:  # near 180 deg: take the axis from the symmetric part
        A = (R + np.eye(3)) / 2
        k = np.sqrt(np.maximum(np.diag(A), 0))
        k[1] = math.copysign(k[1], A[0, 1]) if k[0] > 1e-9 else k[1]
        k[2] = math.copysign(k[2], A[0, 2]) if k[0] > 1e-9 else math.copysign(k[2], A[1, 2])
        return th * k / max(np.linalg.norm(k), 1e-12)
    k = np.array([R[2, 1] - R[1, 2], R[0, 2] - R[2, 0], R[1, 0] - R[0, 1]]) / (2 * math.sin(th))
    return th * k


class Camera:
    """World -> camera is x_cam = R @ x_world + t (camera x right, y down, z forward). f_px in pixels."""

    def __init__(self, R, t, f_px, size_px, rms_px=0.0):
        self.R = np.asarray(R, float)
        self.t = np.asarray(t, float)
        self.f = float(f_px)
        self.W, self.H = size_px
        self.rms_px = rms_px
        self.C = -self.R.T @ self.t  # camera position in the world

    @property
    def az(self):
        return math.degrees(math.atan2(self.C[0], -self.C[1]))

    @property
    def el(self):
        return math.degrees(math.atan2(self.C[2], math.hypot(self.C[0], self.C[1])))

    @property
    def dist(self):
        """Distance from the camera to the centre of the square (same units as tile_m)."""
        return float(np.linalg.norm(self.C))

    @property
    def lens_mm(self):
        return self.f * SENSOR_MM / max(self.W, self.H)

    def project(self, xyz):
        """World points (N x 3) -> pixels (N x 2)."""
        pc = np.atleast_2d(np.asarray(xyz, float)) @ self.R.T + self.t
        return np.stack([self.f * pc[:, 0] / pc[:, 2] + self.W / 2, self.f * pc[:, 1] / pc[:, 2] + self.H / 2], axis=1)

    def ray(self, px):
        """Pixels (N x 2) -> unit directions in the world (N x 3), starting at self.C."""
        p = np.atleast_2d(np.asarray(px, float))
        d = np.stack([(p[:, 0] - self.W / 2) / self.f, (p[:, 1] - self.H / 2) / self.f, np.ones(len(p))], axis=1)
        d = d @ self.R  # R.T @ d for each row
        return d / np.linalg.norm(d, axis=1, keepdims=True)

    def ground_xy(self, px, z=0.0):
        """Cast pixels onto the plane Z = z. Returns (N x 2); NaN where the ray does not reach the plane."""
        d = self.ray(px)
        with np.errstate(divide="ignore", invalid="ignore"):
            s = (z - self.C[2]) / d[:, 2]
        s = np.where(s > 0, s, np.nan)
        return (self.C[None, :2] + d[:, :2] * s[:, None])

    def blender(self):
        """Camera parameters for bpy: location, rotation_euler (XYZ, radians), lens, sensor."""
        M = self.R.T @ np.diag([1.0, -1.0, -1.0])  # camera-to-world with Blender axes (x right, y up, -z forward)
        b = -math.asin(max(-1.0, min(1.0, M[2, 0])))
        a = math.atan2(M[2, 1], M[2, 2])
        c = math.atan2(M[1, 0], M[0, 0])
        return {"location": [float(v) for v in self.C], "rotation_euler": [a, -b, c], "lens_mm": self.lens_mm,
                "sensor_width_mm": SENSOR_MM, "sensor_fit": "AUTO", "resolution": [self.W, self.H]}

    def summary(self):
        return {"az": round(self.az, 3), "el": round(self.el, 3), "lens_mm": round(self.lens_mm, 3),
                "dist": round(self.dist, 4), "rms_px": round(self.rms_px, 4)}


def _world_corners(tile_m, yaw_deg=0.0):
    s = tile_m / 2
    c = np.array([[-s, -s, 0], [s, -s, 0], [s, s, 0], [-s, s, 0]], float)
    a = math.radians(yaw_deg)
    return c @ np.array([[math.cos(a), math.sin(a), 0], [-math.sin(a), math.cos(a), 0], [0, 0, 1]])


def _homography(xy, uv):
    rows = []
    for (X, Y), (u, v) in zip(xy, uv):
        rows.append([X, Y, 1, 0, 0, 0, -u * X, -u * Y, -u])
        rows.append([0, 0, 0, X, Y, 1, -v * X, -v * Y, -v])
    return np.linalg.svd(np.array(rows))[2][-1].reshape(3, 3)


def _pose(H, f):
    """Pose for a given focal length (normalised units) from the homography of the ground plane."""
    g = np.diag([1 / f, 1 / f, 1.0]) @ H
    lam = 2 / (np.linalg.norm(g[:, 0]) + np.linalg.norm(g[:, 1]))
    r1, r2, t = lam * g[:, 0], lam * g[:, 1], lam * g[:, 2]
    if t[2] < 0:
        r1, r2, t = -r1, -r2, -t
    M = np.stack([r1, r2, np.cross(r1, r2)], axis=1)
    U, _, Vt = np.linalg.svd(M)
    return U @ Vt, t


def _refine(R, t, f, world, uv, iters=80, w=None):
    """Levenberg-Marquardt on rotation vector, translation and log focal length (w: weight per point)."""
    w = np.ones(len(world)) if w is None else np.asarray(w, float)

    def res(p):
        Rm = _rod(p[:3])
        pc = world @ Rm.T + p[3:6]
        return ((math.exp(p[6]) * pc[:, :2] / pc[:, 2:3] - uv) * w[:, None]).ravel()

    p = np.concatenate([_rotvec(R), t, [math.log(f)]])
    r = res(p)
    cost = float(r @ r)
    lam = 1e-3
    for _ in range(iters):
        J = np.empty((len(r), 7))
        for k in range(7):
            q = p.copy()
            q[k] += 1e-7
            J[:, k] = (res(q) - r) / 1e-7
        A, g = J.T @ J, J.T @ r
        improved = False
        for _try in range(12):
            try:
                step = np.linalg.solve(A + lam * np.diag(np.maximum(np.diag(A), 1e-12)), -g)
            except np.linalg.LinAlgError:
                lam *= 10
                continue
            rn = res(p + step)
            cn = float(rn @ rn)
            if cn < cost:
                p, r, cost, lam, improved = p + step, rn, cn, max(lam / 5, 1e-12), True
                break
            lam *= 5
        if not improved or math.sqrt(cost / len(r)) < 1e-13:
            break
    return _rod(p[:3]), p[3:6], math.exp(p[6])


def fit(corners_px, size_px, tile_m=1.0, tile_yaw=0.0, weights=None):
    """Camera from the 4 corner pixels of a square tile (front-left, front-right, back-right, back-left;
    with tile_yaw=45: front, right, back, left). weights: one per corner, low for an extrapolated corner."""
    W, H = size_px
    px = np.asarray(corners_px, float)
    if px.shape != (4, 2):
        raise ValueError("need exactly 4 corner pixels")
    S = float(max(W, H))
    uv = (px - [W / 2, H / 2]) / S
    world = _world_corners(tile_m, tile_yaw)
    wts = np.ones(4) if weights is None else np.asarray(weights, float)
    if wts.shape != (4,) or (wts <= 0).any():
        raise ValueError("weights: 4 positive numbers")
    Hm = _homography(world[:, :2], uv)
    h1, h2 = Hm[:, 0], Hm[:, 1]
    starts = []
    with np.errstate(divide="ignore", invalid="ignore"):
        for e in (-(h1[0] * h2[0] + h1[1] * h2[1]) / (h1[2] * h2[2]),
                  (h1[0] ** 2 + h1[1] ** 2 - h2[0] ** 2 - h2[1] ** 2) / (h2[2] ** 2 - h1[2] ** 2)):
            if np.isfinite(e) and e > 0:
                starts.append(math.sqrt(e))
    starts += [0.6, 1.0, 1.6, 2.5, 4.0]  # in units of the longer image side (lens = f * 36 mm)
    best = None
    for f0 in starts:
        R, t = _pose(Hm, f0)
        if (-R.T @ t)[2] <= 0:
            continue
        R, t, f = _refine(R, t, f0, world, uv, w=wts)
        if (-R.T @ t)[2] <= 0 or t[2] <= 0:
            continue
        r = (f * (world @ R.T + t)[:, :2] / (world @ R.T + t)[:, 2:3] - uv) * S
        cost = float(((r * wts[:, None]) ** 2).sum())
        if best is None or cost < best[0] - 1e-9:
            best = (cost, R, t, f, r)
    if best is None:
        raise ValueError("no camera above the ground fits these corners: check the corner order "
                         "(front-left, front-right, back-right, back-left) and that they are not collinear")
    _, R, t, f, r = best
    cam = Camera(R, t, f * S, (W, H), rms_px=float(np.sqrt((r ** 2).sum(1).mean())))
    cam.err_px = [round(float(e), 3) for e in np.linalg.norm(r, axis=1)]  # per corner, in the order given
    return cam


# ---------------------------------------------------------------------------------------------- self-check
def _synthetic(az, el, lens_mm, dist, aim, size):
    a, e = math.radians(az), math.radians(el)
    C = np.array([math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)]) * dist + [aim[0], aim[1], 0]
    z = np.array([aim[0], aim[1], 0.0]) - C
    z /= np.linalg.norm(z)
    x = np.cross(z, [0, 0, 1.0])
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    R = np.stack([x, y, z])
    return Camera(R, -R @ C, lens_mm * max(size) / SENSOR_MM, size)


def selftest(verbose=True):
    rng = np.random.default_rng(7)
    cases = [(0, 30, 50, 4.0, (0, 0), (1536, 1024)), (35, 25, 85, 6.0, (0.2, 0.1), (1024, 1024)),
             (-50, 40, 35, 3.0, (-0.1, 0.3), (1536, 1024)), (120, 20, 28, 5.0, (0, 0), (1024, 1536)),
             (15, 55, 70, 8.0, (0.5, -0.3), (1920, 1080))]
    worst = {"corner_px": 0.0, "ang_deg": 0.0, "lens_pct": 0.0, "ground_m": 0.0}
    for sigma in (0.0, 0.7):
        for az, el, lens, dist, aim, size in cases:
            tile = 2.0
            truth = _synthetic(az, el, lens, dist * tile, [v * tile for v in aim], size)
            corners = truth.project(_world_corners(tile))
            noisy = corners + rng.normal(0, sigma, corners.shape)
            cam = fit(noisy, size, tile)
            # 1. the picked corners reproject within 3 px
            err = np.linalg.norm(cam.project(_world_corners(tile)) - noisy, axis=1).max()
            assert err < 3.0, f"corners reproject {err:.2f} px off (az {az} el {el})"
            # 2. the camera is the one that made them
            # (az, el) are measured from the tile centre; the synthetic camera orbits its aim point, so
            # compare with the truth camera's own values, not the nominal ones
            dang = max(abs((cam.az - truth.az + 180) % 360 - 180), abs(cam.el - truth.el))
            dlens = abs(cam.lens_mm - lens) / lens * 100
            tol_ang, tol_lens = (0.01, 0.05) if sigma == 0 else (2.5, 12.0)
            assert dang < tol_ang and dlens < tol_lens, f"pose off: {dang:.3f} deg, lens {dlens:.2f} % (az {az} el {el}, sigma {sigma})"
            # 3. round trip on known ground points: ground -> pixel -> ground
            pts = np.concatenate([rng.uniform(-1.5, 1.5, (20, 2)) * tile, [[0, 0]]])
            back = cam.ground_xy(truth.project(np.c_[pts, np.zeros(len(pts))]))
            gerr = np.abs(back - pts).max()
            assert gerr < (1e-6 if sigma == 0 else 0.35 * tile), f"ground round trip {gerr:.4f} m (sigma {sigma})"
            if sigma == 0:
                worst["ground_m"] = max(worst["ground_m"], gerr)
            worst["corner_px"] = max(worst["corner_px"], err)
            worst["ang_deg"] = max(worst["ang_deg"], dang) if sigma == 0 else worst["ang_deg"]
            worst["lens_pct"] = max(worst["lens_pct"], dlens) if sigma == 0 else worst["lens_pct"]
    # diamond tile (tile_yaw=45): same camera, corners given as front, right, back, left
    truth = _synthetic(-2, 25, 75, 9.0, (0, 0), (1536, 1024))
    dia = truth.project(_world_corners(2.0, 45))
    cam = fit(dia, (1536, 1024), 2.0, tile_yaw=45)
    assert abs(cam.az - truth.az) < 0.01 and abs(cam.el - truth.el) < 0.01 and abs(cam.lens_mm - 75) < 0.05, cam.summary()
    # a hidden corner picked 12 px off with a low weight: the visible corners still reproject within 1.5 px
    bad = dia.copy()
    bad[2] += [9.0, -8.0]
    cam = fit(bad, (1536, 1024), 2.0, tile_yaw=45, weights=[1, 1, 0.15, 1])
    assert max(cam.err_px[i] for i in (0, 1, 3)) < 1.5 and cam.err_px[2] > 5, cam.err_px
    # mirrored labelling must be refused, not silently flipped
    truth = _synthetic(30, 30, 50, 6.0, (0, 0), (1024, 1024))
    try:
        fit(truth.project(_world_corners(1.0))[[1, 0, 3, 2]], (1024, 1024), 1.0)
    except ValueError:
        pass
    else:
        raise AssertionError("mirrored corner order was accepted")
    if verbose:
        print("camera_fit selftest OK", json.dumps({k: float(f"{v:.3g}") for k, v in worst.items()}))
    return worst


def main(argv):
    if len(argv) > 1 and argv[1] == "--selftest":
        selftest()
        return 0
    if len(argv) != 2:
        print(__doc__)
        return 2
    d = json.load(open(argv[1]))
    cam = fit(d["corners"], tuple(d["size"]), d.get("tile_m", 1.0), d.get("tile_yaw", 0.0), d.get("weights"))
    print(json.dumps({**cam.summary(), "err_px": cam.err_px, "blender": cam.blender()}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
