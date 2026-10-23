// src/core/math/scalar.ts — shared scalar helpers (clamp, lerp, smoothing curves, angles)

/** A full turn, in radians. */
export const TAU = Math.PI * 2;

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** The point `t` of the way through a `{ MIN, MAX }` range. */
export function lerpRange(range: { MIN: number; MAX: number }, t: number): number {
  return lerp(range.MIN, range.MAX, t);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** The part of `v` after the point (0..1, also for a negative `v`). */
export function fract(v: number): number {
  return v - Math.floor(v);
}

/** `current` moved toward `target` by at most `maxStep`. */
export function moveToward(current: number, target: number, maxStep: number): number {
  return current + Math.max(-maxStep, Math.min(maxStep, target - current));
}

/** `current` moved the share `rate * dt` (at most all) of the way to `target`: a quick, simple ease for small steps. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * Math.min(1, rate * dt);
}

/** `current` moved toward `target` over `dt` seconds with time constant `tauS` (no overshoot, frame-rate independent). */
export function followTarget(current: number, target: number, dt: number, tauS: number): number {
  if (dt <= 0) return current;
  if (tauS <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dt / tauS));
}

/** A random number from `rand` (0..1) spread over a `[low, high]` range. */
export function randRange(rand: () => number, range: readonly [number, number]): number {
  return lerp(range[0], range[1], rand());
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
  let delta = angle % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

/** Turn `current` toward `target` by the share `amount` (0..1) of the shortest way round. */
export function turnToward(current: number, target: number, amount: number): number {
  return current + wrapAngle(target - current) * Math.min(1, amount);
}
