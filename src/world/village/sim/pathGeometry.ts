// src/world/village/sim/pathGeometry.ts — curve and segment helpers for laying paths (pure)
import { hash01 } from './geometry.ts';

/** Smooth 1D value noise in -1..1. */
function valueNoise(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return (hash01(i + seed) * (1 - u) + hash01(i + 1 + seed) * u) * 2 - 1;
}

/** Subdivide to about 3 m steps and sway sideways, tapering to zero at both ends. */
export function sway(points: number[], amplitude: number, seed: number): number[] {
  const out: number[] = [];
  let total = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    total += Math.hypot(points[i + 2]! - points[i]!, points[i + 3]! - points[i + 1]!);
  }
  let travelled = 0;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const [x0, z0, x1, z1] = [points[i]!, points[i + 1]!, points[i + 2]!, points[i + 3]!];
    const len = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = -(z1 - z0) / len;
    const nz = (x1 - x0) / len;
    const steps = Math.max(1, Math.ceil(len / 3));
    for (let k = 0; k < steps; k++) {
      const s = travelled + (len * k) / steps;
      const taper = Math.min(1, s / 6, (total - s) / 6);
      const offset = amplitude * valueNoise(s * 0.12, seed) * Math.max(0, taper);
      const t = k / steps;
      out.push(x0 + (x1 - x0) * t + nx * offset, z0 + (z1 - z0) * t + nz * offset);
    }
    travelled += len;
  }
  out.push(points[points.length - 2]!, points[points.length - 1]!);
  return out;
}

/** One round of corner cutting that keeps both ends in place. */
export function chaikin(points: number[]): number[] {
  if (points.length <= 4) return points;
  const out = [points[0]!, points[1]!];
  for (let i = 0; i + 3 < points.length; i += 2) {
    const [x0, z0, x1, z1] = [points[i]!, points[i + 1]!, points[i + 2]!, points[i + 3]!];
    out.push(
      0.75 * x0 + 0.25 * x1,
      0.75 * z0 + 0.25 * z1,
      0.25 * x0 + 0.75 * x1,
      0.25 * z0 + 0.75 * z1,
    );
  }
  out.push(points[points.length - 2]!, points[points.length - 1]!);
  return out;
}

/** Distance from (px, pz) to the segment (ax, az)-(bx, bz). */
export function segmentDistance(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}
