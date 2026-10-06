// src/rendering/sunShadow/shadowMapSize.ts — shared shadow map resolution clamp (dev panels)
const MIN_MAP_SIZE = 512;
const MAX_MAP_SIZE = 8192;

/** Snap to the nearest power of two in [512, 8192]. */
export function normalizeShadowMapSize(size: number): number {
  const clamped = Math.max(MIN_MAP_SIZE, Math.min(MAX_MAP_SIZE, Math.round(size)));
  return 2 ** Math.round(Math.log2(clamped));
}
