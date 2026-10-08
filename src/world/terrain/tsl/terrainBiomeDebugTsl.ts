// src/world/terrain/tsl/terrainBiomeDebugTsl.ts — DEV painted-biome false-color overlay
import { abs, clamp, float, mix, step, vec3 } from 'three/tsl';
import { BiomeId } from '../../../map/MapTypes';
import { BIOME_DEBUG_RGB, BIOME_DEBUG_ROCK_RGB, BIOME_DEBUG_SNOW_RGB } from '../biomeDebugColors';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';
import { terrainGridUv } from './biomeAtlasUv';

type TslNode = any;

function idEquals(id: TslNode, value: number): TslNode {
  return float(1).sub(step(float(0.5), abs(id.sub(float(value)))));
}

/** Painted biomes drawn over the Water base color, in id order. */
const OVER_WATER = [
  BiomeId.Shore,
  BiomeId.Forest,
  BiomeId.Hills,
  BiomeId.Mountain,
  BiomeId.Path,
  BiomeId.Meadow,
] as const;

function biomeDebugColor(id: TslNode): TslNode {
  let color: TslNode = vec3(...BIOME_DEBUG_RGB[BiomeId.Water]);
  for (const biome of OVER_WATER) {
    color = mix(color, vec3(...BIOME_DEBUG_RGB[biome]), idEquals(id, biome));
  }
  return color;
}

/**
 * Replace lit terrain with painted-biome false colors when `uBiomeDebugEnabled` is on.
 * Rock and snow use the same shader weights as splat shading (not painted IDs).
 */
export function applyTerrainBiomeDebugOverlay(
  litColor: TslNode,
  worldXZ: TslNode,
  uniforms: TerrainSplatUniforms,
  slopeRockW: TslNode,
  snowW: TslNode,
): TslNode {
  const { uBiomeDebugEnabled, uBiomeIdMap, uWorldSize } = uniforms as any;
  const mapUv = terrainGridUv(uWorldSize, worldXZ);
  const id = uBiomeIdMap.sample(mapUv).r.mul(255).round();
  const painted = biomeDebugColor(id);
  const withSnow = mix(painted, vec3(...BIOME_DEBUG_SNOW_RGB), clamp(snowW, 0, 1));
  const overlay = mix(withSnow, vec3(...BIOME_DEBUG_ROCK_RGB), clamp(slopeRockW, 0, 1));
  return mix(litColor, overlay, uBiomeDebugEnabled);
}
