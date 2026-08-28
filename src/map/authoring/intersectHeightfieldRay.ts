// src/map/authoring/intersectHeightfieldRay.ts — CPU ray vs bilinear heightfield (XZ function)
import { type Ray, Vector3 } from 'three';
import { HEIGHT_NORM_MAX, HEIGHT_NORM_MIN } from '../mapHeightBounds';

const _p = new Vector3();
const _bmin = new Vector3();
const _bmax = new Vector3();

function rayAabbInterval(
  origin: Vector3,
  dir: Vector3,
  bmin: Vector3,
  bmax: Vector3,
): { t0: number; t1: number } | null {
  let t0 = 0;
  let t1 = Number.POSITIVE_INFINITY;
  const axes = ['x', 'y', 'z'] as const;
  for (const axis of axes) {
    const d = dir[axis];
    const o = origin[axis];
    if (Math.abs(d) < 1e-12) {
      if (o < bmin[axis] || o > bmax[axis]) return null;
      continue;
    }
    let ta = (bmin[axis] - o) / d;
    let tb = (bmax[axis] - o) / d;
    if (ta > tb) {
      const swap = ta;
      ta = tb;
      tb = swap;
    }
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return { t0, t1 };
}

function heightDelta(ray: Ray, t: number, getWorldY: (x: number, z: number) => number): number {
  _p.copy(ray.direction).multiplyScalar(t).add(ray.origin);
  return _p.y - getWorldY(_p.x, _p.z);
}

export interface IntersectHeightfieldOptions {
  /**
   * Extra metres past the map XZ square. Outside the map, `getWorldY` is the
   * clamped edge height — a virtual plateau so brush centers can sit off-map.
   */
  xzPad?: number;
}

/**
 * First intersection of a world ray with a heightfield `y = getWorldY(x, z)`.
 * No overhangs — the surface is a function of XZ.
 */
export function intersectHeightfieldRay(
  ray: Ray,
  getWorldY: (x: number, z: number) => number,
  worldSize: number,
  heightScale: number,
  options?: IntersectHeightfieldOptions,
): { x: number; y: number; z: number } | null {
  const half = worldSize * 0.5;
  const xzPad = Math.max(0, options?.xzPad ?? 0);
  _bmin.set(-half - xzPad, HEIGHT_NORM_MIN * heightScale, -half - xzPad);
  _bmax.set(half + xzPad, HEIGHT_NORM_MAX * heightScale, half + xzPad);
  const span = rayAabbInterval(ray.origin, ray.direction, _bmin, _bmax);
  if (!span) return null;

  const xzSpeed = Math.hypot(ray.direction.x, ray.direction.z);
  const cellSize = worldSize / 256;
  const step = cellSize / Math.max(xzSpeed, 1e-4);
  const maxSteps = 1024;

  let t = span.t0;
  let prev = heightDelta(ray, t, getWorldY);
  for (let i = 0; i < maxSteps; i++) {
    t = Math.min(span.t1, t + step);
    const next = heightDelta(ray, t, getWorldY);
    if (prev > 0 && next <= 0) {
      let lo = t - step;
      let hi = t;
      for (let k = 0; k < 10; k++) {
        const mid = (lo + hi) * 0.5;
        if (heightDelta(ray, mid, getWorldY) > 0) lo = mid;
        else hi = mid;
      }
      _p.copy(ray.direction).multiplyScalar(hi).add(ray.origin);
      const limit = half + xzPad;
      if (_p.x < -limit || _p.x > limit || _p.z < -limit || _p.z > limit) return null;
      const y = getWorldY(_p.x, _p.z);
      return { x: _p.x, y, z: _p.z };
    }
    prev = next;
    if (t >= span.t1) break;
  }
  return null;
}
