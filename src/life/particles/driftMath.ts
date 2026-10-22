// src/life/particles/driftMath.ts — where a drifting speck is (pure CPU twin of the shader in driftField.ts)
//
// A field is a box of specks that follows the camera. Each speck has a fixed seed; its place comes from the seed,
// the wind it has been carried by (`drift`, metres, integrated on the CPU so a gust never makes it jump), the
// clock and the box centre. A speck stays put in the world while the camera moves; the box only decides which
// specks are near enough to draw.

export interface DriftSeed {
  x: number;
  y: number;
  z: number;
  /** 0..1 and unique per speck: the density shows the specks whose `w` is below it. */
  w: number;
}

export interface DriftShape {
  boxM: number;
  heightM: number;
  fallMps: number;
  wobbleM: number;
  wobbleHz: number;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

const TAU = Math.PI * 2;
const fract = (v: number) => v - Math.floor(v);

/** The seed of speck `i` of `n`: a golden-ratio sequence in each channel, well spread and the same on every run. */
export function seedAt(i: number, n: number): DriftSeed {
  const g = (k: number) => (0.5 + i * k) % 1;
  return {
    x: g(0.7548776662466927),
    y: g(0.5698402909980532),
    z: g(0.8191725133961645),
    w: (i + 0.5) / n,
  };
}

/** The 0..1 position of a speck in the box (before the sway): `u`/`w` across, `v` up. */
export function boxCoords(
  seed: DriftSeed,
  centre: Vec3Like,
  driftX: number,
  driftZ: number,
  clockS: number,
  shape: DriftShape,
): { u: number; v: number; w: number } {
  return {
    u: fract(seed.x + (driftX - centre.x) / shape.boxM),
    v: fract(seed.y - (shape.fallMps * clockS) / shape.heightM),
    w: fract(seed.z + (driftZ - centre.z) / shape.boxM),
  };
}

/** The world position of a speck: its place in the box plus the sway of its fall. */
export function driftPosition(
  seed: DriftSeed,
  centre: Vec3Like,
  driftX: number,
  driftZ: number,
  clockS: number,
  shape: DriftShape,
): Vec3Like {
  const c = boxCoords(seed, centre, driftX, driftZ, clockS, shape);
  const sway = TAU * shape.wobbleHz * clockS;
  return {
    x: centre.x + (c.u - 0.5) * shape.boxM + Math.sin(sway + seed.z * TAU) * shape.wobbleM,
    y: centre.y + c.v * shape.heightM + Math.sin(sway * 1.3 + seed.w * TAU) * shape.wobbleM * 0.25,
    z: centre.z + (c.w - 0.5) * shape.boxM + Math.sin(sway * 0.77 + seed.x * TAU) * shape.wobbleM,
  };
}

/** The wind carries the specks: `drift` grows by the wind's heading × its speed × the time that passed. */
export function advanceDrift(
  drift: { x: number; z: number },
  dirX: number,
  dirZ: number,
  speedMps: number,
  dt: number,
): void {
  drift.x += dirX * speedMps * dt;
  drift.z += dirZ * speedMps * dt;
}

/** The share of the box's edge a speck fades over: 1 at the middle, 0 at the rim (so the wrap is never seen). */
export function edgeFade(u: number, w: number, from = 0.55): number {
  const r = Math.hypot(u - 0.5, w - 0.5) * 2;
  const t = Math.min(1, Math.max(0, (r - from) / (1 - from)));
  return 1 - t * t * (3 - 2 * t);
}
