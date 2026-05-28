// src/map/MapTypes.ts — authored map JSON schema

import { WORLD } from '../world/WorldConfig';



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

} as const;



export type BiomeIdValue = (typeof BiomeId)[keyof typeof BiomeId];



export const BIOME_ID_LABELS: Record<BiomeIdValue, string> = {

  [BiomeId.Water]: 'Water',

  [BiomeId.Shore]: 'Shore',

  [BiomeId.Forest]: 'Forest',

  [BiomeId.Hills]: 'Hills',

  [BiomeId.Mountain]: 'Mountain',

  [BiomeId.Path]: 'Path',

};



export type MapLandmarkKind = 'ancientOak' | 'sacredSpring' | 'drownedTemple' | 'highCairn';



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

  | {

      type: 'standingStone';

      stoneId: 0 | 1 | 2 | 3 | 4;

      x: number;

      z: number;

      rotY?: number;

      scale?: number;

    }

  | { type: 'orb'; x: number; z: number; energy?: number }

  | {

      type: 'landmark';

      landmark: MapLandmarkKind;

      x: number;

      z: number;

      rotY?: number;

      scale?: number;

    }

  | { type: 'mountain'; key: string; x: number; z: number; rotY: number; scale: number };



export interface MapGrassSettings {

  enabled: boolean;

  densityMul?: number;

}



export interface MapWorldMeta {

  size: number;

  segments: number;

  heightScale: number;

}



export interface MapGridLayer {

  width: number;

  height: number;

  data: number[];

}



export interface MapFile {

  version: number;

  id: string;

  name: string;

  world: MapWorldMeta;

  height: MapGridLayer;

  biome: MapGridLayer;

  entities?: MapEntity[];

  grass?: MapGrassSettings;

}



export function defaultMapWorldMeta(): MapWorldMeta {

  return {

    size: WORLD.SIZE,

    segments: WORLD.SEGMENTS,

    heightScale: WORLD.HEIGHT_SCALE,

  };

}



export function mapGridSize(segments: number = WORLD.SEGMENTS): number {

  return segments + 1;

}



export function isBiomeId(value: number): value is BiomeIdValue {

  return value >= BiomeId.Water && value <= BiomeId.Path;

}



const GAMEPLAY_ENTITY_TYPES = new Set(['playerStart', 'standingStone', 'landmark', 'orb']);



/** Authored Phase 0 layout when player start or gameplay markers are present. */

export function isAuthoredGameplayLayout(map: MapFile): boolean {

  if (!map.entities?.length) return false;

  return map.entities.some((e) => GAMEPLAY_ENTITY_TYPES.has(e.type));

}



export function getPlayerStartFromMap(map: MapFile | undefined): [number, number] {

  const ps = map?.entities?.find((e): e is Extract<MapEntity, { type: 'playerStart' }> => e.type === 'playerStart');

  if (ps) return [ps.x, ps.z];

  return WORLD.PLAYER_START.xz;

}



/** Filename-safe map id for public/maps/{id}.json */

export const MAP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;



export function normalizeMapId(id: string): string {

  return id.trim().toLowerCase();

}



export function isValidMapId(id: string): boolean {

  return MAP_ID_PATTERN.test(normalizeMapId(id));

}


