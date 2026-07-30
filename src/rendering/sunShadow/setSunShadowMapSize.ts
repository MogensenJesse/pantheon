// src/rendering/sunShadow/setSunShadowMapSize.ts — live near-cascade map resolution (DEV)
import type { DirectionalLight } from 'three';
import { invalidateNearCascadeShadowMap } from './nearCascadeShadow';

const MIN_MAP_SIZE = 512;
const MAX_MAP_SIZE = 8192;

/** Snap to nearest power of two in [512, 8192]. */
export function normalizeSunShadowMapSize(size: number): number {
  const clamped = Math.max(MIN_MAP_SIZE, Math.min(MAX_MAP_SIZE, Math.round(size)));
  const exp = Math.round(Math.log2(clamped));
  return 2 ** Math.max(9, Math.min(13, exp));
}

/**
 * Resize a directional shadow map (near cascade in DEV). Disposes the existing depth
 * target so the next shadow pass allocates at the new resolution.
 * PcssShadowNode resizes its downsampled R32F blocker RT on the next updateShadow copy pass.
 */
export function setSunShadowMapSize(light: DirectionalLight, size: number): number {
  const next = normalizeSunShadowMapSize(size);
  const shadow = light.shadow;
  if (shadow.mapSize.x === next && shadow.mapSize.y === next) return next;

  shadow.mapSize.set(next, next);
  shadow.map?.dispose();
  shadow.map = null;
  shadow.needsUpdate = true;
  invalidateNearCascadeShadowMap();
  return next;
}

export function readSunShadowMapSize(light: DirectionalLight): number {
  return light.shadow.mapSize.x;
}
