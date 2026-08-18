// src/map/MapIO.ts — map JSON serialize, parse, fetch, and project save

import { createEmptyMapGrids, type MapGrids } from './MapGrids';
import {
  defaultMapWorldMeta,
  isValidMapId,
  MAP_FILE_VERSION,
  type MapEntity,
  type MapFile,
  type MapGridLayer,
  type MapTerrainShape,
  normalizeMapId,
} from './MapTypes';
import { assertValidMapFile } from './validateMapPayload';

interface GridsToMapFileOptions {
  entities?: MapEntity[];
  /** Soft sculpt massing; when set, written as `heightBase`. */
  heightBase?: Float32Array;
  terrainShape?: MapTerrainShape;
}

function layerFromGrid(size: number, data: ArrayLike<number>): MapGridLayer {
  return {
    width: size,
    height: size,
    data: Array.from(data),
  };
}

export function gridsToMapFile(
  id: string,
  grids: MapGrids,
  options: GridsToMapFileOptions = {},
): MapFile {
  const map: MapFile = {
    version: MAP_FILE_VERSION,
    id,
    world: defaultMapWorldMeta(),
    height: layerFromGrid(grids.size, grids.height),
    biome: layerFromGrid(grids.size, grids.biome),
  };

  if (options.heightBase && options.heightBase.length === grids.size * grids.size) {
    map.heightBase = layerFromGrid(grids.size, options.heightBase);
  }

  if (options.terrainShape) map.terrainShape = { ...options.terrainShape };

  if (options.entities?.length) map.entities = options.entities;

  return map;
}

export function mapFileToGrids(map: MapFile): MapGrids {
  const size = map.height.width;

  if (map.height.data.length !== size * size || map.biome.data.length !== size * size) {
    throw new Error('Map grid data length mismatch');
  }

  return {
    size,
    height: new Float32Array(map.height.data),
    biome: new Uint8Array(map.biome.data),
  };
}

export function getMapEntities(map: MapFile): MapEntity[] {
  return map.entities ?? [];
}

const GRID_SENTINEL_PREFIX = '__PANTHEON_GRID_';

/**
 * Pretty-print map metadata; emit each grid `data` array as one compact JSON line.
 * Schema stays `number[]` — parse/validate are unchanged.
 */
export function serializeMapFile(map: MapFile): string {
  const blobs: string[] = [];
  const stash = (data: number[]): string => {
    const token = `${GRID_SENTINEL_PREFIX}${blobs.length}__`;
    blobs.push(JSON.stringify(data));
    return token;
  };

  const payload: MapFile = {
    ...map,
    height: { ...map.height, data: stash(map.height.data) as unknown as number[] },
    biome: { ...map.biome, data: stash(map.biome.data) as unknown as number[] },
  };
  if (map.heightBase) {
    payload.heightBase = {
      ...map.heightBase,
      data: stash(map.heightBase.data) as unknown as number[],
    };
  }

  let json = JSON.stringify(payload, null, 2);
  for (let i = 0; i < blobs.length; i++) {
    json = json.replace(`"${GRID_SENTINEL_PREFIX}${i}__"`, blobs[i]!);
  }
  return json;
}

/** Legacy map JSON may include a removed `name` field; it is ignored. */
type MapFileJson = MapFile & { name?: string };

export function parseMapFile(json: string): MapFile {
  const raw = JSON.parse(json) as MapFileJson;

  if (raw.name !== undefined) delete raw.name;

  assertValidMapFile(raw);

  raw.id = normalizeMapId(raw.id);

  return raw;
}

const DEV_SAVE_URL = '/api/dev/maps/save';

interface SaveMapToProjectResult {
  path: string;
  maps: string[];
}

/** Writes map JSON via Vite dev server (npm run dev only). */
export async function saveMapToProject(map: MapFile): Promise<SaveMapToProjectResult> {
  let res: Response;
  try {
    res = await fetch(DEV_SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serializeMapFile(map),
    });
  } catch (e) {
    const hint = import.meta.env.DEV
      ? ' Is npm run dev running? Restart the dev server after mapDevApiPlugin changes.'
      : ' Project save only works via npm run dev (not production build or preview).';
    throw new Error(`${e instanceof Error ? e.message : 'Network request failed'}.${hint}`);
  }

  const payload = (await res.json()) as {
    ok?: boolean;
    error?: string;
    path?: string;
    maps?: string[];
  };

  if (!res.ok || !payload.ok || !payload.path || !payload.maps) {
    throw new Error(payload.error ?? `Save failed (${res.status})`);
  }

  return { path: payload.path, maps: payload.maps };
}

export async function fetchMapById(id: string): Promise<MapFile> {
  if (!isValidMapId(id)) {
    throw new Error(`Invalid map id "${id}"`);
  }

  const res = await fetch(
    `/maps/${id}.json`,
    import.meta.env.DEV ? { cache: 'no-store' } : undefined,
  );

  if (!res.ok) throw new Error(`Failed to load map "${id}": ${res.status}`);

  return parseMapFile(await res.text());
}

/** List map ids from public/maps/manifest.json when present. */
export async function fetchMapManifest(signal?: AbortSignal): Promise<string[]> {
  try {
    const res = await fetch('/maps/manifest.json', { signal });

    if (!res.ok) return [];

    const data = (await res.json()) as { maps?: string[] };

    return data.maps ?? [];
  } catch {
    return [];
  }
}

export function createNewMapFile(id = 'new-map'): MapFile {
  const grids = createEmptyMapGrids();

  return gridsToMapFile(id, grids);
}
