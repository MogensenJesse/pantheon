// src/world/terrain/config/terrainBiomeTuning.ts — per-atlas-slot texture tuning defaults and helpers

import { TERRAIN_ATLAS_BIOME_KEYS, type TerrainAtlasBiomeKey } from '../atlas/atlasConstants';

export { TERRAIN_ATLAS_BIOME_KEYS, type TerrainAtlasBiomeKey };

export interface TerrainBiomeTextureTune {
  tileRepeat: number;
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

export type TerrainChiselTune = {
  stepM: number;
  /** Crease fillet width as a fraction of `stepM` (0 = knife lighting N). */
  edgeSoft: number;
};

export function cloneTerrainChiselTune(source: TerrainChiselTune): TerrainChiselTune {
  return { stepM: source.stepM, edgeSoft: source.edgeSoft };
}

/** One time-of-day stop: sun-facing, midtone, and shadow hexes. */
export interface TerrainStylizeStop {
  sun: string;
  ground: string;
  shadow: string;
}

export interface TerrainStylizeBiomePalette {
  noon: TerrainStylizeStop;
  goldenHour: TerrainStylizeStop;
}

export type TerrainStylizePaletteMap = Record<TerrainAtlasBiomeKey, TerrainStylizeBiomePalette>;

/** Live stylize knobs + per-biome palettes (hexes also seed from VISUAL). */
export interface TerrainStylizeTune {
  /** 0 = photographed albedo, 1 = hue-split palettes. */
  albedoPaletteMix: number;
  /** 0 = per-biome palettes, 1 = {@link global} sun/ground/shadow on every biome. */
  globalPaletteMix: number;
  global: TerrainStylizeStop;
  biomes: TerrainStylizePaletteMap;
}

export function cloneTerrainStylizePaletteMap(
  source: TerrainStylizePaletteMap,
): TerrainStylizePaletteMap {
  const map = {} as TerrainStylizePaletteMap;
  for (const key of TERRAIN_ATLAS_BIOME_KEYS) {
    const biome = source[key];
    map[key] = {
      noon: { ...biome.noon },
      goldenHour: { ...biome.goldenHour },
    };
  }
  return map;
}

export function cloneTerrainStylizeTune(source: TerrainStylizeTune): TerrainStylizeTune {
  return {
    albedoPaletteMix: source.albedoPaletteMix,
    globalPaletteMix: source.globalPaletteMix,
    global: { ...source.global },
    biomes: cloneTerrainStylizePaletteMap(source.biomes),
  };
}

export type TerrainBiomeTuneMap = Record<TerrainAtlasBiomeKey, TerrainBiomeTextureTune>;

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
  rock: 'Rock',
};

/** Internal slope-rock blend threshold (not dev-tunable). */
export const TERRAIN_SLOPE_ROCK_START = 0.75;

/** Smoothstep width below `TERRAIN_SLOPE_ROCK_START` (worldNormal.y). */
export const TERRAIN_SLOPE_ROCK_SOFTNESS = 0.12;

/** Mix toward the dedicated rock atlas slot on steep slopes. */
export const TERRAIN_SLOPE_ROCK_BLEND = 0.85;
