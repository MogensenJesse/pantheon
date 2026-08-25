// src/map/validateMapPayload.ts — shared map JSON validation (editor save API + MapIO)

import { WORLD } from '../config/world.ts';
import { isValidMapEntity } from './authoring/mapEntityCatalog.ts';
import {
  isBiomeId,
  isValidMapId,
  MAP_FILE_VERSION,
  MAP_FILE_VERSION_V1,
  MAP_FILE_VERSION_V2,
  type MapFile,
  type MapTerrainShape,
} from './MapTypes.ts';
import { validateMapGrassSettings } from './mapGrassSettings.ts';
import { isValidMapGridSidecar, type MapGridKind } from './mapGridSidecars.ts';

export const MAP_SAVE_VERSIONS = new Set([
  MAP_FILE_VERSION_V1,
  MAP_FILE_VERSION_V2,
  MAP_FILE_VERSION,
]);
export const MAX_MAP_ENTITIES = 20_000;

export interface MapGridLayerPayload {
  width: number;
  height: number;
  file?: unknown;
  encoding?: unknown;
  data?: unknown;
}

export interface MapPayloadLike {
  version: number;
  id: string;
  world?: { size?: number; segments?: number };
  height: MapGridLayerPayload;
  biome: MapGridLayerPayload;
  heightBase?: MapGridLayerPayload;
  terrainShape?: MapTerrainShape;
  entities?: unknown[];
  grass?: unknown;
}

const TERRAIN_SHAPE_KEYS: (keyof MapTerrainShape)[] = [
  'seed',
  'heightScale',
  'frequency',
  'octaves',
  'erosion',
  'warp',
  'valleyBias',
  'seaLevel',
  'talus',
  'talusPasses',
];

function validateTerrainShape(shape: unknown): string | null {
  if (shape === undefined) return null;
  if (!shape || typeof shape !== 'object') return 'terrainShape must be an object';
  const s = shape as Record<string, unknown>;
  // Legacy maps may omit seed — default before requiring the rest.
  if (typeof s.seed !== 'number' || !Number.isFinite(s.seed)) {
    s.seed = 1;
  }
  for (const key of TERRAIN_SHAPE_KEYS) {
    const v = s[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return `terrainShape.${key} must be a finite number`;
    }
  }
  return null;
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

function isTypedNumberArray(data: unknown): data is ArrayLike<number> {
  return Array.isArray(data) || data instanceof Float32Array || data instanceof Uint8Array;
}

function validateGridSamples(
  name: string,
  data: ArrayLike<number>,
  expected: number,
  integerBiome: boolean,
): string | null {
  if (data.length !== expected * expected) {
    return `${name} data length mismatch`;
  }
  if (integerBiome) {
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!;
      if (typeof v !== 'number' || !Number.isInteger(v) || !isBiomeId(v)) {
        return `Invalid biome id: ${v}`;
      }
    }
    return null;
  }
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return `${name} data must be finite numbers`;
    }
  }
  return null;
}

function validateGridLayer(
  name: string,
  kind: MapGridKind,
  layer: MapGridLayerPayload | undefined,
  expected: number,
  mapId: string,
  requireSamples: boolean,
): string | null {
  if (!layer || typeof layer.width !== 'number' || typeof layer.height !== 'number') {
    return `Missing ${name} grid dimensions`;
  }
  if (layer.width !== expected || layer.height !== expected) {
    return `${name} grid must be ${expected}×${expected}`;
  }

  const hasFile = layer.file !== undefined && layer.file !== '';
  const hasData = layer.data !== undefined;

  if (!hasFile && !hasData) {
    return `Missing ${name} grid data`;
  }

  if (hasFile) {
    if (!isValidMapGridSidecar(mapId, kind, layer.file)) {
      return `${name} file must be ${mapId}.${kind === 'biome' ? 'biome.u8' : kind === 'heightBase' ? 'heightBase.f32' : 'height.f32'}`;
    }
  }

  if (hasData) {
    if (!isTypedNumberArray(layer.data)) {
      return `${name} data must be an array`;
    }
    const sampleErr = validateGridSamples(name, layer.data, expected, kind === 'biome');
    if (sampleErr) return sampleErr;
  } else if (requireSamples) {
    return `Missing ${name} grid data`;
  }

  return null;
}

export function validateMapPayload(
  body: unknown,
  options: { requireGridSamples?: boolean } = {},
): { ok: true; map: MapPayloadLike } | { ok: false; error: string } {
  const requireGridSamples = options.requireGridSamples === true;

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

  for (const { name, kind, layer } of [
    { name: 'height', kind: 'height' as const, layer: map.height },
    { name: 'biome', kind: 'biome' as const, layer: map.biome },
  ]) {
    const err = validateGridLayer(name, kind, layer, expected, id, requireGridSamples);
    if (err) return { ok: false, error: err };
  }

  if (map.heightBase !== undefined) {
    const baseErr = validateGridLayer(
      'heightBase',
      'heightBase',
      map.heightBase,
      expected,
      id,
      requireGridSamples,
    );
    if (baseErr) return { ok: false, error: baseErr };
  }

  const shapeErr = validateTerrainShape(map.terrainShape);
  if (shapeErr) return { ok: false, error: shapeErr };

  if (map.entities !== undefined) {
    const entityErr = validateMapEntitiesArray(map.entities);
    if (entityErr) return { ok: false, error: entityErr };
  }

  const grassErr = validateMapGrassSettings((map as MapPayloadLike).grass);
  if (grassErr) return { ok: false, error: grassErr };

  map.id = id;
  return { ok: true, map };
}

/** Throws on invalid authored map (client load / MapIO). Hydrated maps must include samples. */
export function assertValidMapFile(map: MapFile, hydrated = true): void {
  const payload: MapPayloadLike = {
    version: map.version,
    id: map.id,
    world: map.world,
    height: map.height,
    biome: map.biome,
    heightBase: map.heightBase,
    terrainShape: map.terrainShape,
    entities: map.entities,
    grass: map.grass,
  };
  const result = validateMapPayload(payload, { requireGridSamples: hydrated });
  if (!result.ok) throw new Error(result.error);
}
