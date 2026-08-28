// src/world/terrain/material/slopeRockWeight.ts — CPU slope-rock mix (matches terrainPackMapsTsl)
import {
  TERRAIN_SLOPE_ROCK_BLEND,
  TERRAIN_SLOPE_ROCK_SOFTNESS,
  TERRAIN_SLOPE_ROCK_START,
} from '../config/terrainBiomeTuning';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function combinedSlopeRockWeight(normalY: number): number {
  const derived =
    1 -
    smoothstep(
      TERRAIN_SLOPE_ROCK_START - TERRAIN_SLOPE_ROCK_SOFTNESS,
      TERRAIN_SLOPE_ROCK_START,
      normalY,
    );
  return Math.max(0, Math.min(1, derived)) * TERRAIN_SLOPE_ROCK_BLEND;
}
