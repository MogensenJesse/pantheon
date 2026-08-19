// src/map/MapTypes.ts — authored map JSON schema

import { WORLD } from '../config/world.ts';

export const MAP_FILE_VERSION = 2;

/** Legacy maps without entities remain loadable. */
export const MAP_FILE_VERSION_V1 = 1;

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
  | { type: 'playerStart'; x: number; z: number }
  | { type: 'orb'; x: number; z: number; energy?: number };

export interface MapWorldMeta {
  size: number;
  segments: number;
}

export interface MapGridLayer {
  width: number;
  height: number;
  data: number[];
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

/**
 * Optional editor TerrainGenerator-style shape params for sculpt derive.
 * Play ignores these and only uses `height`.
 */
export interface MapTerrainShape {
  /** Procedural Quilez PRNG seed (Generate button). */
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
  entities?: MapEntity[];
  grass?: MapGrassSettings;
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

const GAMEPLAY_ENTITY_TYPES = new Set(['playerStart', 'orb']);

/** Authored Phase 0 layout when player start or gameplay markers are present. */
export function isAuthoredGameplayLayout(map: MapFile): boolean {
  if (!map.entities?.length) return false;
  return map.entities.some((e) => GAMEPLAY_ENTITY_TYPES.has(e.type));
}

export function getPlayerStartFromMap(map: MapFile | undefined): [number, number] {
  const playerStart = map?.entities?.find(
    (e): e is Extract<MapEntity, { type: 'playerStart' }> => e.type === 'playerStart',
  );

  if (playerStart) return [playerStart.x, playerStart.z];

  return [...WORLD.PLAYER_START.xz];
}

/** Filename-safe map id for public/maps/{id}.json */
export const MAP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function normalizeMapId(id: string): string {
  return id.trim().toLowerCase();
}

export function isValidMapId(id: string): boolean {
  return MAP_ID_PATTERN.test(normalizeMapId(id));
}
