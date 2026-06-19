// @ts-nocheck — TSL uniform typing is looser in three.js than in strict TS
// src/world/water/waterEdgeFadeTsl.ts — radial alpha falloff at ocean disc rim
import { float, length, positionWorld, smoothstep, sub, uniform } from 'three/tsl';
import type { Node } from 'three/webgpu';

export interface WaterEdgeFadeUniforms {
  uWaterRadius: ReturnType<typeof uniform>;
  uFadeStartRatio: ReturnType<typeof uniform>;
  uFadeEndRatio: ReturnType<typeof uniform>;
}

export function createWaterEdgeFadeUniforms(
  waterRadius: number,
  fadeStartRatio: number,
  fadeEndRatio: number,
): WaterEdgeFadeUniforms {
  return {
    uWaterRadius: uniform(waterRadius),
    uFadeStartRatio: uniform(fadeStartRatio),
    uFadeEndRatio: uniform(fadeEndRatio),
  };
}

/** Multiply base alpha — full inside fadeStart, transparent at outer radius. */
export function applyWaterEdgeFade(baseAlpha: Node, edge: WaterEdgeFadeUniforms): Node {
  const fadeStart = edge.uWaterRadius.mul(edge.uFadeStartRatio);
  const fadeEnd = edge.uWaterRadius.mul(edge.uFadeEndRatio);
  const dist = length(positionWorld.xz);
  const edgeFade = sub(float(1), smoothstep(fadeStart, fadeEnd, dist));
  return baseAlpha.mul(edgeFade);
}
