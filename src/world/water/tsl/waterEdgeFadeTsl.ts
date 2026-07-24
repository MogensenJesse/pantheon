// src/world/water/tsl/waterEdgeFadeTsl.ts — radial alpha falloff at ocean disc rim
import { float, length, positionWorld, smoothstep, sub, uniform } from 'three/tsl';

type TslNode = any;

export interface WaterEdgeFadeUniforms {
  uWaterRadius: TslNode;
  uFadeStartRatio: TslNode;
  uFadeEndRatio: TslNode;
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
export function applyWaterEdgeFade(baseAlpha: TslNode, edge: WaterEdgeFadeUniforms): TslNode {
  const fadeStart = edge.uWaterRadius.mul(edge.uFadeStartRatio);
  const fadeEnd = edge.uWaterRadius.mul(edge.uFadeEndRatio);
  const dist = length(positionWorld.xz);
  const edgeFade = sub(float(1), smoothstep(fadeStart, fadeEnd, dist));
  return baseAlpha.mul(edgeFade);
}
