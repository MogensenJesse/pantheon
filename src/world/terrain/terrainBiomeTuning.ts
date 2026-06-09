// src/world/terrain/terrainBiomeTuning.ts — per-atlas-slot texture tuning defaults and helpers

export const TERRAIN_ATLAS_BIOME_KEYS = [
  'shore',
  'forest',
  'hills',
  'mountain',
  'path',
  'meadow',
  'snow',
] as const;

export type TerrainAtlasBiomeKey = (typeof TERRAIN_ATLAS_BIOME_KEYS)[number];

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
}

export type TerrainBiomeTuneMap = Record<TerrainAtlasBiomeKey, TerrainBiomeTextureTune>;

export const DEFAULT_BIOME_TUNE: TerrainBiomeTextureTune = {
  tileRepeat: 0.1,
  detailDisplacement: 1,
  normalStrength: 1,
  roughness: 1,
};

export function createDefaultBiomeTuneMap(
  overrides?: Partial<TerrainBiomeTuneMap>,
): TerrainBiomeTuneMap {
  const map = {} as TerrainBiomeTuneMap;
  for (const key of TERRAIN_ATLAS_BIOME_KEYS) {
    map[key] = { ...DEFAULT_BIOME_TUNE, ...overrides?.[key] };
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
