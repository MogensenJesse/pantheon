// src/world/grass/tsl/grassLodDebugTsl.ts — DEV false-color overlay for grass LOD rings
import { Color } from 'three';
import { float, mix, step, vec3 } from 'three/tsl';
import type { TslNode } from './tslNode';

/** Distinct false-colors for LOD0 / LOD1 / LOD2 (near / mid / far). */
export const GRASS_LOD_DEBUG_COLORS = [
  new Color('#22dd44'), // LOD0 near — green
  new Color('#22aaff'), // LOD1 mid — blue
  new Color('#ff44aa'), // LOD2 far — magenta
] as const;

/** Replace shaded albedo with the ring LOD color when `uGrassLodColorDebug` is on. */
export function applyGrassLodDebugColor(
  shadedColor: TslNode,
  lodTier: 0 | 1 | 2,
  uGrassLodColorDebug: TslNode,
): TslNode {
  const c = GRASS_LOD_DEBUG_COLORS[lodTier]!;
  const debugColor = vec3(c.r, c.g, c.b);
  const debugOn = step(float(0.5), uGrassLodColorDebug);
  return mix(shadedColor, debugColor, debugOn);
}
