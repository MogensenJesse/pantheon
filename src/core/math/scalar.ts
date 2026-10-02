// src/core/math/scalar.ts — shared scalar helpers (clamp, lerp, smoothing curves)

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Smoothstep of `t` clamped to 0..1. */
export function smoothstep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Hermite fade curve (3t² − 2t³); `t` is not clamped. */
export function fadeHermite(t: number): number {
  return t * t * (3 - 2 * t);
}
