// src/rendering/sunShadow/setSunShadowMapSize.ts — live sun shadow map resolution (DEV + tooling)
import type { DirectionalLight } from 'three';
import { invalidateSunShadowMap } from './followTarget';

const MIN_MAP_SIZE = 512;
const MAX_MAP_SIZE = 8192;

/** Snap to nearest power of two in [512, 8192]. */
export function normalizeSunShadowMapSize(size: number): number {
  const clamped = Math.max(MIN_MAP_SIZE, Math.min(MAX_MAP_SIZE, Math.round(size)));
  const exp = Math.round(Math.log2(clamped));
  return 2 ** Math.max(9, Math.min(13, exp));
}

/**
 * Resize the sun directional shadow map. Disposes the existing depth target so the
 * next shadow pass allocates at the new resolution (WebGPU + god rays safe).
 * PcssShadowNode resizes its R32F color-depth RT on the next updateShadow copy pass.
 */
export function setSunShadowMapSize(sun: DirectionalLight, size: number): number {
  const next = normalizeSunShadowMapSize(size);
  const shadow = sun.shadow;
  if (shadow.mapSize.x === next && shadow.mapSize.y === next) return next;

  shadow.mapSize.set(next, next);
  shadow.map?.dispose();
  shadow.map = null;
  shadow.needsUpdate = true;
  invalidateSunShadowMap();
  return next;
}

export function readSunShadowMapSize(sun: DirectionalLight): number {
  return sun.shadow.mapSize.x;
}
