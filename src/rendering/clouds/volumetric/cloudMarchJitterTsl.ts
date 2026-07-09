// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/clouds/volumetric/cloudMarchJitterTsl.ts — procedural march step jitter (blue-noise style)
import { float, fract, sin, vec2 } from 'three/tsl';

type TslNode = any;

/** Cheap hash — stable per pixel + step, uncorrelated across steps. */
function hash12(p: TslNode): TslNode {
  const k = vec2(127.1, 311.7);
  return fract(sin(p.dot(k)).mul(43758.5453));
}

/**
 * Offset in roughly [-0.5, 0.5] × strength for staggered raymarch sample positions.
 * strength 0 disables jitter.
 */
export function marchBlueNoiseJitter(screenUv: TslNode, stepIndex: TslNode, strength: TslNode): TslNode {
  const cell = screenUv.mul(128).add(vec2(stepIndex.mul(17.3), stepIndex.mul(9.1)));
  const n = hash12(cell);
  return n.sub(0.5).mul(strength);
}
