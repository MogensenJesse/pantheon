// src/map/MapTypes.ts — authored map JSON schema

import { WORLD } from '../config/world.ts';

export const MAP_FILE_VERSION = 3;

/** Legacy maps without entities remain loadable. */
export const MAP_FILE_VERSION_V1 = 1;

/** Inline JSON grid arrays (pre-sidecar). */
export const MAP_FILE_VERSION_V2 = 2;

/** Per-cell biome id stored in map JSON (uint8). */
export const BiomeId = {
  Water: 0,
  Shore: 1,
  Forest: 2,
  Hills: 3,
  Mountain: 4,
  Path: 5,
  Meadow: 6,
} as const;

export type BiomeIdValue = (typeof BiomeId)[keyof typeof BiomeId];

export const BIOME_ID_LABELS: Record<BiomeIdValue, string> = {
  [BiomeId.Water]: 'Water',
  [BiomeId.Shore]: 'Shore',
  [BiomeId.Forest]: 'Forest',
  [BiomeId.Hills]: 'Hills',
  [BiomeId.Mountain]: 'Mountain',
  [BiomeId.Path]: 'Path',
  [BiomeId.Meadow]: 'Meadow',
};

export type MapEntity =
  | {
      type: 'prop';
      key: string;
      x: number;
      z: number;
      rotY: number;
      scale: number;
      surfaceLift?: number;
    }
  | {
      type: 'playerStart';
      x: number;
      z: number /** Initial camera yaw (rad). Omit → PHASE0.CAMERA.INITIAL_YAW. */;
      rotY?: number;
    }
  | { type: 'orb'; x: number; z: number; energy?: number }
  | {
      type: 'villageSeed';
      x: number;
      z: number;
      /** Temple facing (rad). Omit → 0. */
      rotY?: number;
      /** Village RNG seed. Omit → VILLAGE.SEED.DEFAULT. */
      seed?: number;
      /** Growth radius (m). Omit → VILLAGE.SEED.DEFAULT_RADIUS_M. */
      radiusM?: number;
    }
  | {
      type: 'shrine';
      x: number;
      z: number;
      /** Zone radius (m). Omit → PHASE0.SHRINE.RADIUS_M. */
      radiusM?: number;
      /** Energy per second inside the zone (with Attunement). Omit → PHASE0.SHRINE.REGEN_PER_SEC. */
      regenPerSec?: number;
    };

/** A shrine: a zone where energy regenerates (several per map). */
export type ShrineEntity = Extract<MapEntity, { type: 'shrine' }>;

/** Authored village founding spot (one per map in play). */
export type VillageSeedEntity = Extract<MapEntity, { type: 'villageSeed' }>;

export interface MapWorldMeta {
  size: number;
  segments: number;
}

export interface MapGridLayer {
  width: number;
  height: number;
  /**
   * Sidecar basename under `public/maps/` (v3).
   * Omitted on legacy inline JSON; stripped from disk JSON when `data` is hydrated in memory.
   */
  file?: string;
  encoding?: 'f32le' | 'u8' | 'rgba8';
  /** Inline samples (v1/v2) or hydrated typed arrays after sidecar load. */
  data?: number[] | Float32Array | Uint8Array;
}

export type MapHeightMode = 'shaped' | 'rawSigned';

export interface MapWaterSettings {
  /** Water plane Y in metres. Omit → WORLD.BIOMES.WATER.max × HEIGHT_SCALE. */
  levelM: number;
}

/**
 * One cumulus deck authored on the map. Omit the block and play keeps the shipped defaults.
 * Puff count and puff shape are play look. Extra puff keys in old maps are ignored.
 */
export interface MapCumulusDeck {
  coverage: number;
  /** Weather-pattern size (m). */
  bankScaleM: number;
  /** Width of the coverage threshold. */
  bankSoftness: number;
  density: number;
  supercluster: number;
  deckMinY: number;
  deckMaxY: number;
  /** Meters added once to the shared base. Not multiplied by height scale. */
  deckYBiasM: number;
  spread: number;
  edgeFadeM: number;
  windSpeed: number;
}

export interface MapTerrainAuxMeta {
  /** The map carries an authored convex ridge grid (`MapFile.terrainAux`). */
  hasConvex: boolean;
  /** True after sculpting when authored convex is no longer valid. */
  stale?: boolean;
  /** Written by older editors, ignored at runtime (slope and normals come from height). */
  hasSlope?: boolean;
  hasNormal?: boolean;
  normalConvention?: string;
}

/** Optional per-map GPU grass overrides (authored in map JSON). */
export interface MapGrassDensityMul {
  meadow?: number;
  forest?: number;
  hills?: number;
  shore?: number;
  mountain?: number;
  path?: number;
}

export interface MapGrassSettings {
  /** When false, grass is not spawned for this map. Default true. */
  enabled?: boolean;
  /** Per-biome-channel density multiplier (0–2). Default 1 each. */
  density?: MapGrassDensityMul;
}

export interface BiomeRule {
  /** Relative claim when height/slope/density all match. 0 = never pick. */
  weight: number;
  /** 0–1 fraction of matching cells that may win this biome. */
  density: number;
  heightMin: number;
  heightMax: number;
  slopeMin: number;
  slopeMax: number;
  /** 0–1 slope-mask floor (the mask is `min(1, slope / 2.5)`). Omit = 0. */
  maskMin?: number;
  /** 0–1 slope-mask ceiling. Omit = 1. */
  maskMax?: number;
}

export const LAND_BIOME_RULE_KEYS = ['shore', 'forest', 'meadow', 'hills', 'mountain'] as const;

export type LandBiomeRuleKey = (typeof LAND_BIOME_RULE_KEYS)[number];

export interface BiomePaintRules {
  seed: number;
  /** Absorb land-biome islands smaller than this many cells across (area ≈ scale²). 1 = keep specks. */
  noiseScale: number;
  /**
   * Extra height-band wander on slopes (normalized height). 0 = hard min/max.
   * Scales with slope angle so flats stay crisp.
   */
  heightVariation: number;
  preservePaths: boolean;
  autoWater: boolean;
  waterHeightMax: number;
  shore: BiomeRule;
  forest: BiomeRule;
  meadow: BiomeRule;
  hills: BiomeRule;
  mountain: BiomeRule;
}

/**
 * Optional editor Quilez ridge params for the sculpt Ridge brush.
 * Play ignores these and only uses `height`.
 */
export interface MapTerrainShape {
  /** Procedural Quilez PRNG seed for ridge stamps. */
  seed: number;
  heightScale: number;
  frequency: number;
  octaves: number;
  erosion: number;
  warp: number;
  valleyBias: number;
  seaLevel: number;
  talus: number;
  talusPasses: number;
}

export interface MapFile {
  version: number;
  id: string;
  world: MapWorldMeta;
  height: MapGridLayer;
  biome: MapGridLayer;
  /** Soft sculpt massing (seed) for live shape derive; optional for legacy maps. */
  heightBase?: MapGridLayer;
  /** Live shape slider values; optional for legacy maps. */
  terrainShape?: MapTerrainShape;
  /** Auto-paint rules; optional — editor infers from the biome grid when missing. */
  biomePaintRules?: BiomePaintRules;
  entities?: MapEntity[];
  grass?: MapGrassSettings;
  /** Direct sculpt of authored metres. Omit → Quilez shaped (0–1) editor path. */
  heightMode?: MapHeightMode;
  /** Per-map water plane. Omit → WORLD.BIOMES.WATER.max × HEIGHT_SCALE. */
  water?: MapWaterSettings;
  /** Cumulus deck. Omit → shipped deck and cumulus puff defaults. */
  clouds?: MapCumulusDeck;
  /**
   * Authored convex ridge, one byte per cell (`u8`). Older maps hold packed RGBA8 whose A channel
   * is the convex mask; the loader converts them and the next save writes `u8`.
   */
  terrainAux?: MapGridLayer;
  terrainAuxMeta?: MapTerrainAuxMeta;
}

export function defaultMapWorldMeta(): MapWorldMeta {
  return {
    size: WORLD.SIZE,
    segments: WORLD.SEGMENTS,
  };
}

export function mapGridSize(segments: number = WORLD.SEGMENTS): number {
  return segments + 1;
}

export function isBiomeId(value: number): value is BiomeIdValue {
  return value >= BiomeId.Water && value <= BiomeId.Meadow;
}

export interface PlayerStartPose {
  x: number;
  z: number;
  /** Radians; undefined means play should use PHASE0.CAMERA.INITIAL_YAW. */
  rotY?: number;
}

export function getPlayerStartFromMap(map: MapFile): PlayerStartPose {
  const playerStart = map.entities?.find(
    (e): e is Extract<MapEntity, { type: 'playerStart' }> => e.type === 'playerStart',
  );

  if (!playerStart) {
    throw new Error(
      `Map "${map.id}" is missing a playerStart entity. Place one in the map editor.`,
    );
  }

  return {
    x: playerStart.x,
    z: playerStart.z,
    rotY: playerStart.rotY,
  };
}

/** Filename-safe map id for public/maps/{id}.json */
const MAP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function normalizeMapId(id: string): string {
  return id.trim().toLowerCase();
}

export function isValidMapId(id: string): boolean {
  return MAP_ID_PATTERN.test(normalizeMapId(id));
}

/** Next unused `{id}-copy` / `{id}-copy-N` that still fits MAP_ID_PATTERN. */
export function suggestDuplicateMapId(sourceId: string, existingIds: readonly string[]): string {
  const taken = new Set(existingIds.map(normalizeMapId));
  const raw = normalizeMapId(sourceId);
  const base = !raw || raw === 'new-map' ? 'map' : raw;

  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? '-copy' : `-copy-${n}`;
    const maxBaseLen = 64 - suffix.length;
    if (maxBaseLen < 1) break;
    const id = `${base.slice(0, maxBaseLen)}${suffix}`;
    if (isValidMapId(id) && !taken.has(id)) return id;
  }
  return 'map-copy';
}
