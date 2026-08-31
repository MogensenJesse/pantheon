// src/world/terrain/tsl/terrainPackMapsTsl.ts — derived slope-rock + authored convex albedo
import { clamp, float, smoothstep } from 'three/tsl';
import {
  TERRAIN_SLOPE_ROCK_BLEND,
  TERRAIN_SLOPE_ROCK_SOFTNESS,
  TERRAIN_SLOPE_ROCK_START,
} from '../config/terrainBiomeTuning';

type TslNode = any;

/** Steep-face weight from chisel N only (authored slope pack is unused). */
export function mixSlopeRockWeightTsl(worldNormal: TslNode): TslNode {
  const uSlopeRockStart = float(TERRAIN_SLOPE_ROCK_START);
  const uSlopeRockSoftness = float(TERRAIN_SLOPE_ROCK_SOFTNESS);
  const derived = float(1).sub(
    smoothstep(uSlopeRockStart.sub(uSlopeRockSoftness), uSlopeRockStart, worldNormal.y),
  );
  return clamp(derived, 0, 1).mul(float(TERRAIN_SLOPE_ROCK_BLEND));
}

export function convexAlbedoMulTsl(
  auxA: TslNode,
  uniforms: { uUseConvexMap: TslNode; uConvexRidgeLight: TslNode },
): TslNode {
  return float(1).add(auxA.mul(uniforms.uConvexRidgeLight).mul(uniforms.uUseConvexMap));
}
