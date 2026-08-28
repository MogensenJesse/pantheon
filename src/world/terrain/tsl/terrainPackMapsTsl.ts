// src/world/terrain/tsl/terrainPackMapsTsl.ts — authored slope/convex mix for splat + disp
import { clamp, float, mix, smoothstep } from 'three/tsl';
import {
  TERRAIN_SLOPE_ROCK_BLEND,
  TERRAIN_SLOPE_ROCK_SOFTNESS,
  TERRAIN_SLOPE_ROCK_START,
} from '../config/terrainBiomeTuning';

type TslNode = any;

export function mixSlopeRockWeightTsl(
  worldNormal: TslNode,
  auxB: TslNode,
  uniforms: {
    uUseSlopeMap: TslNode;
    uSlopeMaskLow: TslNode;
    uSlopeMaskHigh: TslNode;
    uSlopeAuthoredStrength: TslNode;
    uSlopeDerivedStrength: TslNode;
  },
): TslNode {
  const uSlopeRockStart = float(TERRAIN_SLOPE_ROCK_START);
  const uSlopeRockSoftness = float(TERRAIN_SLOPE_ROCK_SOFTNESS);
  const derived = float(1)
    .sub(smoothstep(uSlopeRockStart.sub(uSlopeRockSoftness), uSlopeRockStart, worldNormal.y))
    .mul(uniforms.uSlopeDerivedStrength);
  const authored = smoothstep(uniforms.uSlopeMaskLow, uniforms.uSlopeMaskHigh, auxB)
    .mul(uniforms.uSlopeAuthoredStrength)
    .mul(uniforms.uUseSlopeMap);
  return clamp(derived.add(authored), 0, 1).mul(float(TERRAIN_SLOPE_ROCK_BLEND));
}

export function convexAlbedoMulTsl(
  auxA: TslNode,
  uniforms: { uUseConvexMap: TslNode; uConvexRidgeLight: TslNode },
): TslNode {
  return float(1).add(auxA.mul(uniforms.uConvexRidgeLight).mul(uniforms.uUseConvexMap));
}

export function convexRoughnessMixTsl(
  roughness: TslNode,
  auxA: TslNode,
  uniforms: { uUseConvexMap: TslNode; uConvexRidgeRough: TslNode },
): TslNode {
  return mix(
    roughness,
    clamp(roughness.add(uniforms.uConvexRidgeRough), 0, 1),
    auxA.mul(uniforms.uUseConvexMap),
  );
}
