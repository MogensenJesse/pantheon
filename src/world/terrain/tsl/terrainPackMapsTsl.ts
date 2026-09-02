// src/world/terrain/tsl/terrainPackMapsTsl.ts — derived slope-rock + authored convex albedo
import { clamp, float, smoothstep } from 'three/tsl';
import {
  TERRAIN_SLOPE_ROCK_BLEND,
  TERRAIN_SLOPE_ROCK_SOFTNESS,
  TERRAIN_SLOPE_ROCK_START,
} from '../config/terrainBiomeTuning';

type TslNode = any;

/**
 * 0–1 steep-face weight from chisel N.y. CPU twin: `slopeRockDerivedFromNormalY`.
 * Grass kill (`1 − derived × slopeKill`) and snow overlay (`1 − derived`) share this.
 */
export function slopeRockDerivedTsl(worldNormal: TslNode): TslNode {
  const uSlopeRockStart = float(TERRAIN_SLOPE_ROCK_START);
  const uSlopeRockSoftness = float(TERRAIN_SLOPE_ROCK_SOFTNESS);
  const derived = float(1).sub(
    smoothstep(uSlopeRockStart.sub(uSlopeRockSoftness), uSlopeRockStart, worldNormal.y),
  );
  return clamp(derived, 0, 1);
}

/** Albedo mix toward the rock atlas slot. CPU twin: `combinedSlopeRockWeight`. */
export function mixSlopeRockWeightTsl(worldNormal: TslNode): TslNode {
  return slopeRockDerivedTsl(worldNormal).mul(float(TERRAIN_SLOPE_ROCK_BLEND));
}

export function convexAlbedoMulTsl(
  convexR: TslNode,
  uniforms: { uUseConvexMap: TslNode; uConvexRidgeLight: TslNode },
): TslNode {
  return float(1).add(convexR.mul(uniforms.uConvexRidgeLight).mul(uniforms.uUseConvexMap));
}
