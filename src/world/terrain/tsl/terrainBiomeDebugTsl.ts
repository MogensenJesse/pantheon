// src/world/terrain/tsl/terrainBiomeDebugTsl.ts — DEV painted-biome false-color overlay
import { abs, clamp, float, mix, step, vec3 } from 'three/tsl';
import { BiomeId } from '../../../map/MapTypes';
import { BIOME_DEBUG_RGB, BIOME_DEBUG_ROCK_RGB, BIOME_DEBUG_SNOW_RGB } from '../biomeDebugColors';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';
import { terrainMapUv } from './biomeAtlasUv';

type TslNode = any;

function idEquals(id: TslNode, value: number): TslNode {
  return float(1).sub(step(float(0.5), abs(id.sub(float(value)))));
}

function biomeDebugColor(id: TslNode): TslNode {
  const water = vec3(...BIOME_DEBUG_RGB[BiomeId.Water]);
  const shore = vec3(...BIOME_DEBUG_RGB[BiomeId.Shore]);
  const forest = vec3(...BIOME_DEBUG_RGB[BiomeId.Forest]);
  const hills = vec3(...BIOME_DEBUG_RGB[BiomeId.Hills]);
  const mountain = vec3(...BIOME_DEBUG_RGB[BiomeId.Mountain]);
  const path = vec3(...BIOME_DEBUG_RGB[BiomeId.Path]);
  const meadow = vec3(...BIOME_DEBUG_RGB[BiomeId.Meadow]);
  return mix(
    mix(
      mix(
        mix(
          mix(mix(water, shore, idEquals(id, 1)), forest, idEquals(id, 2)),
          hills,
          idEquals(id, 3),
        ),
        mountain,
        idEquals(id, 4),
      ),
      path,
      idEquals(id, 5),
    ),
    meadow,
    idEquals(id, 6),
  );
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
  const mapUv = terrainMapUv(uWorldSize, worldXZ);
  const id = uBiomeIdMap.sample(mapUv).r.mul(255).round();
  const painted = biomeDebugColor(id);
  const withSnow = mix(painted, vec3(...BIOME_DEBUG_SNOW_RGB), clamp(snowW, 0, 1));
  const overlay = mix(withSnow, vec3(...BIOME_DEBUG_ROCK_RGB), clamp(slopeRockW, 0, 1));
  return mix(litColor, overlay, uBiomeDebugEnabled);
}
