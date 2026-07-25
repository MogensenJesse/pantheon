// src/map/validateMapPayload.ts — shared map JSON validation (editor save API + MapIO)

import { WORLD } from '../config/world';
import { isValidMapEntity } from './authoring/mapEntityCatalog';
import {
  isBiomeId,
  isValidMapId,
  MAP_FILE_VERSION,
  MAP_FILE_VERSION_V1,
  type MapFile,
} from './MapTypes';
import { validateMapGrassSettings } from './mapGrassSettings';

export const MAP_SAVE_VERSIONS = new Set([MAP_FILE_VERSION_V1, MAP_FILE_VERSION]);
export const MAX_MAP_ENTITIES = 5000;

export interface MapGridLayerPayload {
  width: number;
  height: number;
  data: unknown;
}

export interface MapPayloadLike {
  version: number;
  id: string;
  world?: { size?: number; segments?: number };
  height: MapGridLayerPayload;
  biome: MapGridLayerPayload;
  entities?: unknown[];
  grass?: unknown;
}

export function validateMapEntitiesArray(entities: unknown): string | null {
  if (!Array.isArray(entities)) return 'entities must be an array';
  if (entities.length > MAX_MAP_ENTITIES) {
    return `entities exceeds max length (${MAX_MAP_ENTITIES})`;
  }
  for (let i = 0; i < entities.length; i++) {
    if (!isValidMapEntity(entities[i])) return `Invalid entity at index ${i}`;
  }
  return null;
}

function validateGridLayer(
  name: string,
  layer: MapGridLayerPayload | undefined,
  expected: number,
): string | null {
  if (!layer || typeof layer.width !== 'number' || typeof layer.height !== 'number') {
    return `Missing ${name} grid dimensions`;
  }
  if (layer.width !== expected || layer.height !== expected) {
    return `${name} grid must be ${expected}×${expected}`;
  }
  if (!Array.isArray(layer.data) || layer.data.length !== expected * expected) {
    return `${name} data length mismatch`;
  }
  return null;
}

export function validateMapPayload(
  body: unknown,
): { ok: true; map: MapPayloadLike } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Body must be a JSON object' };
  }

  const map = body as MapPayloadLike;

  if (!MAP_SAVE_VERSIONS.has(map.version)) {
    return { ok: false, error: `Unsupported map version: ${map.version}` };
  }

  const id = typeof map.id === 'string' ? map.id.trim().toLowerCase() : '';
  if (!isValidMapId(id)) {
    return { ok: false, error: 'Invalid map id (use a-z, 0-9, hyphen, underscore)' };
  }

  const segments = map.world?.segments ?? WORLD.SEGMENTS;
  if (map.world?.segments !== undefined && map.world.segments !== WORLD.SEGMENTS) {
    return {
      ok: false,
      error: `world.segments must be ${WORLD.SEGMENTS} (got ${map.world.segments})`,
    };
  }
  const expected = segments + 1;

  if (map.world?.size !== undefined && map.world.size !== WORLD.SIZE) {
    return {
      ok: false,
      error: `world.size must be ${WORLD.SIZE} (got ${map.world.size})`,
    };
  }

  for (const { name, layer } of [
    { name: 'height', layer: map.height },
    { name: 'biome', layer: map.biome },
  ] as const) {
    const err = validateGridLayer(name, layer, expected);
    if (err) return { ok: false, error: err };
  }

  for (const v of map.biome.data as number[]) {
    if (typeof v !== 'number' || !Number.isInteger(v) || !isBiomeId(v)) {
      return { ok: false, error: `Invalid biome id: ${v}` };
    }
  }

  for (const v of map.height.data as number[]) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, error: 'Height data must be finite numbers' };
    }
  }

  if (map.entities !== undefined) {
    const entityErr = validateMapEntitiesArray(map.entities);
    if (entityErr) return { ok: false, error: entityErr };
  }

  const grassErr = validateMapGrassSettings((map as MapPayloadLike).grass);
  if (grassErr) return { ok: false, error: grassErr };

  map.id = id;
  return { ok: true, map };
}

/** Throws on invalid authored map (client load / MapIO). */
export function assertValidMapFile(map: MapFile): void {
  const payload: MapPayloadLike = {
    version: map.version,
    id: map.id,
    world: map.world,
    height: map.height,
    biome: map.biome,
    entities: map.entities,
    grass: map.grass,
  };
  const result = validateMapPayload(payload);
  if (!result.ok) throw new Error(result.error);
}
