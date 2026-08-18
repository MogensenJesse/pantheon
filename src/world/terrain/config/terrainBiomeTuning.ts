// src/world/terrain/config/terrainBiomeTuning.ts — per-atlas-slot texture tuning defaults and helpers

import { VISUAL } from '../../../config/visualTuning';
import { TERRAIN_ATLAS_BIOME_KEYS, type TerrainAtlasBiomeKey } from '../atlas/atlasConstants';

export { TERRAIN_ATLAS_BIOME_KEYS, type TerrainAtlasBiomeKey };

export interface TerrainBiomeTextureTune {
  tileRepeat: number;
  detailDisplacement: number;
  normalStrength: number;
  /** Multiplier on ORM roughness (1 = as-authored). */
  roughness: number;
}

export interface TerrainSnowTune {
  heightStart: number;
  heightEnd: number;
  mountainWeight: number;
  noise: {
    amplitude: number;
    scale: number;
  };
  aspect: {
    strength: number;
    shadeBoost: number;
    referenceElevationDeg: number;
    referenceAzimuthDeg: number;
  };
  slope: {
    normalYStart: number;
    normalYEnd: number;
    strength: number;
  };
}

export function cloneSnowTune(source: TerrainSnowTune): TerrainSnowTune {
  return {
    ...source,
    noise: { ...source.noise },
    aspect: { ...source.aspect },
    slope: { ...source.slope },
  };
}

export type TerrainBiomeTuneMap = Record<TerrainAtlasBiomeKey, TerrainBiomeTextureTune>;

export type TerrainSolidColorMap = Record<TerrainAtlasBiomeKey, string>;

export function cloneSolidColorMap(
  source: { readonly [K in TerrainAtlasBiomeKey]: string },
): TerrainSolidColorMap {
  const map = {} as TerrainSolidColorMap;
  for (const key of TERRAIN_ATLAS_BIOME_KEYS) {
    map[key] = source[key];
  }
  return map;
}

export function cloneBiomeTuneMap(source: TerrainBiomeTuneMap): TerrainBiomeTuneMap {
  const map = {} as TerrainBiomeTuneMap;
  for (const key of TERRAIN_ATLAS_BIOME_KEYS) {
    map[key] = { ...source[key] };
  }
  return map;
}

/** Display label for dev panel accordion headers. */
export const TERRAIN_BIOME_LABELS: Record<TerrainAtlasBiomeKey, string> = {
  shore: 'Shore',
  forest: 'Forest',
  hills: 'Hills',
  mountain: 'Mountain',
  path: 'Path',
  meadow: 'Meadow',
  snow: 'Snow',
};

/** Internal slope-rock blend threshold (not dev-tunable). */
export const TERRAIN_SLOPE_ROCK_START = 0.75;

/** Fixed specular highlight multiplier (replaces former dev slider). */
export const TERRAIN_SPECULAR_MUL = 0.5;

/** Plateau lighting blend — geometric normal above flatnessEnd (from VISUAL.terrain). */
export const TERRAIN_PLATEAU_FLATNESS_START = VISUAL.terrain.plateauFlatnessStart;
export const TERRAIN_PLATEAU_FLATNESS_END = VISUAL.terrain.plateauFlatnessEnd;
