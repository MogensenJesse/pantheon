// src/life/particles/driftMath.ts — where a drifting speck is (pure CPU twin of the shader in driftField.ts)
//
// A field is a box of specks that follows the camera. Each speck has a fixed seed; its place comes from the seed,
// the wind it has been carried by (`drift`, metres, integrated on the CPU so a gust never makes it jump), the
// clock and the box centre. A speck stays put in the world while the camera moves; the box only decides which
// specks are near enough to draw.

import { fract, smoothstepEdges, TAU } from '../../core/math/scalar.ts';

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

/** The 0..1 position of a speck along each axis of the box (before the sway). */
export function boxCoords(
  seed: DriftSeed,
  centre: Vec3Like,
  driftX: number,
  driftZ: number,
  clockS: number,
  shape: DriftShape,
): Vec3Like {
  return {
    x: fract(seed.x + (driftX - centre.x) / shape.boxM),
    y: fract(seed.y - (shape.fallMps * clockS) / shape.heightM),
    z: fract(seed.z + (driftZ - centre.z) / shape.boxM),
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
    x: centre.x + (c.x - 0.5) * shape.boxM + Math.sin(sway + seed.z * TAU) * shape.wobbleM,
    y: centre.y + c.y * shape.heightM + Math.sin(sway * 1.3 + seed.w * TAU) * shape.wobbleM * 0.25,
    z: centre.z + (c.z - 0.5) * shape.boxM + Math.sin(sway * 0.77 + seed.x * TAU) * shape.wobbleM,
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

/** Where from the middle of the box (0..1 of its half width) a speck starts to fade out toward the rim. */
export const EDGE_FADE_FROM = 0.55;

/** The share of the box's edge a speck fades over: 1 at the middle, 0 at the rim (so the wrap is never seen). */
export function edgeFade(x: number, z: number, from = EDGE_FADE_FROM): number {
  const r = Math.hypot(x - 0.5, z - 0.5) * 2;
  return 1 - smoothstepEdges(from, 1, r);
}

/** A firefly's blink, 0.1..1: a soft glow that comes and goes at `hz`, out of step with every other speck. */
export function blinkAt(seedW: number, clockS: number, hz: number): number {
  const phase = fract(clockS * hz + fract(seedW * 37.31));
  const s = Math.sin(phase * TAU) * 0.5 + 0.5;
  return 0.1 + 0.9 * smoothstepEdges(0.45, 0.95, s);
}

/**
 * Creatures notice the orb: inside `radiusM` a speck is drawn toward it, keeping only `keep` of its distance at
 * full pull (inside `innerShare` of the radius), and nothing at the rim, so the pull is continuous.
 */
export function orbPulled(
  p: Vec3Like,
  orb: Vec3Like,
  pull01: number,
  radiusM: number,
  innerShare: number,
  keep: number,
): Vec3Like {
  const d = Math.hypot(p.x - orb.x, p.y - orb.y, p.z - orb.z);
  const pull = pull01 * (1 - smoothstepEdges(radiusM * innerShare, radiusM, d));
  const k = 1 - (1 - keep) * pull;
  return {
    x: orb.x + (p.x - orb.x) * k,
    y: orb.y + (p.y - orb.y) * k,
    z: orb.z + (p.z - orb.z) * k,
  };
}
