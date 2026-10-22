// src/core/math/scalar.ts — shared scalar helpers (clamp, lerp, smoothing curves)

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** The point `t` of the way through a `{ MIN, MAX }` range. */
export function lerpRange(range: { MIN: number; MAX: number }, t: number): number {
  return lerp(range.MIN, range.MAX, t);
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Smoothstep of `t` clamped to 0..1. */
export function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** GLSL-style `smoothstep(edge0, edge1, x)`; a zero-width band behaves like a step. */
export function smoothstepEdges(edge0: number, edge1: number, x: number): number {
  return smoothstep01((x - edge0) / Math.max(1e-8, edge1 - edge0));
}

/** Hermite fade curve (3t² − 2t³); `t` is not clamped. */
export function fadeHermite(t: number): number {
  return t * t * (3 - 2 * t);
}

/** An angle wrapped into [-PI, PI]. */
export function wrapAngle(angle: number): number {
  const turn = Math.PI * 2;
  let delta = angle % turn;
  if (delta > Math.PI) delta -= turn;
  if (delta < -Math.PI) delta += turn;
  return delta;
}

/** Turn `current` toward `target` by the share `amount` (0..1) of the shortest way round. */
export function turnToward(current: number, target: number, amount: number): number {
  return current + wrapAngle(target - current) * Math.min(1, amount);
}
