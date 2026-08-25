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
import {
  expectedGridByteLength,
  type MapGridKind,
  mapGridEncoding,
  mapGridSidecarFile,
} from './mapGridSidecars';
import { assertValidMapFile } from './validateMapPayload';

interface GridsToMapFileOptions {
  entities?: MapEntity[];
  /** Soft sculpt massing; when set, written as `heightBase`. */
  heightBase?: Float32Array;
  terrainShape?: MapTerrainShape;
  grass?: MapFile['grass'];
}

function sidecarLayer(
  id: string,
  kind: Exclude<MapGridKind, 'biome'>,
  size: number,
  data: Float32Array,
): MapGridLayer {
  return {
    width: size,
    height: size,
    file: mapGridSidecarFile(id, kind),
    encoding: mapGridEncoding(kind),
    data,
  };
}

function biomeSidecarLayer(id: string, size: number, data: Uint8Array): MapGridLayer {
  return {
    width: size,
    height: size,
    file: mapGridSidecarFile(id, 'biome'),
    encoding: 'u8',
    data,
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
    height: sidecarLayer(id, 'height', grids.size, grids.height),
    biome: biomeSidecarLayer(id, grids.size, grids.biome),
  };

  if (options.heightBase && options.heightBase.length === grids.size * grids.size) {
    map.heightBase = sidecarLayer(id, 'heightBase', grids.size, options.heightBase);
  }

  if (options.terrainShape) map.terrainShape = { ...options.terrainShape };
  if (options.grass) map.grass = options.grass;

  if (options.entities?.length) map.entities = options.entities;

  return map;
}

function toFloat32(data: ArrayLike<number>): Float32Array {
  return data instanceof Float32Array ? data : new Float32Array(data);
}

function toUint8(data: ArrayLike<number>): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

export function mapFileToGrids(map: MapFile): MapGrids {
  const size = map.height.width;
  const heightData = map.height.data;
  const biomeData = map.biome.data;

  if (!heightData || !biomeData) {
    throw new Error('Map grid samples are not loaded');
  }

  if (heightData.length !== size * size || biomeData.length !== size * size) {
    throw new Error('Map grid data length mismatch');
  }

  return {
    size,
    height: toFloat32(heightData),
    biome: toUint8(biomeData),
  };
}

export function getMapEntities(map: MapFile): MapEntity[] {
  return map.entities ?? [];
}

function layerMeta(layer: MapGridLayer): MapGridLayer {
  const { data: _data, ...meta } = layer;
  return meta;
}

/**
 * Map JSON without typed grid samples. Pretty by default (disk / download);
 * compact for the save POST so 20k entities stay under the body limit.
 */
export function serializeMapFile(map: MapFile, pretty = true): string {
  const payload: MapFile = {
    ...map,
    height: layerMeta(map.height),
    biome: layerMeta(map.biome),
  };
  if (map.heightBase) {
    payload.heightBase = layerMeta(map.heightBase);
  }
  return pretty ? `${JSON.stringify(payload, null, 2)}\n` : JSON.stringify(payload);
}

/** Legacy map JSON may include a removed `name` field; it is ignored. */
type MapFileJson = MapFile & { name?: string };

export function parseMapFile(json: string, hydrated = false): MapFile {
  const raw = JSON.parse(json) as MapFileJson;

  if (raw.name !== undefined) delete raw.name;

  assertValidMapFile(raw, hydrated);

  raw.id = normalizeMapId(raw.id);

  return raw;
}

const DEV_SAVE_URL = '/api/dev/maps/save';
const DEV_BIN_URL = '/api/dev/maps/bin';

interface SaveMapToProjectResult {
  path: string;
  maps: string[];
}

async function postMapBinary(
  id: string,
  kind: MapGridKind,
  data: Float32Array | Uint8Array,
): Promise<void> {
  const payload = data instanceof Float32Array ? new Float32Array(data) : new Uint8Array(data);
  const res = await fetch(
    `${DEV_BIN_URL}?id=${encodeURIComponent(id)}&kind=${encodeURIComponent(kind)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    },
  );
  const json = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) {
    throw new Error(json.error ?? `Failed to write ${kind} grid (${res.status})`);
  }
}

/** Writes map JSON + grid sidecars via Vite dev server (npm run dev only). */
export async function saveMapToProject(map: MapFile): Promise<SaveMapToProjectResult> {
  const height = map.height.data;
  const biome = map.biome.data;
  if (!(height instanceof Float32Array) && !Array.isArray(height)) {
    throw new Error('Cannot save map without height samples');
  }
  if (!(biome instanceof Uint8Array) && !Array.isArray(biome)) {
    throw new Error('Cannot save map without biome samples');
  }

  const heightF32 = toFloat32(height);
  const biomeU8 = toUint8(biome);

  let res: Response;
  try {
    res = await fetch(DEV_SAVE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serializeMapFile(map, false),
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

  await postMapBinary(map.id, 'height', heightF32);
  await postMapBinary(map.id, 'biome', biomeU8);
  if (map.heightBase?.data) {
    await postMapBinary(map.id, 'heightBase', toFloat32(map.heightBase.data));
  }

  return { path: payload.path, maps: [...new Set(payload.maps)].sort() };
}

async function fetchGridBuffer(
  id: string,
  file: string,
  expectedBytes: number,
): Promise<ArrayBuffer> {
  const res = await fetch(`/maps/${file}`, import.meta.env.DEV ? { cache: 'no-store' } : undefined);
  if (!res.ok) {
    throw new Error(`Failed to load map grid "${id}" (${file}): ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `Map grid "${file}" byte length mismatch (got ${buffer.byteLength}, expected ${expectedBytes})`,
    );
  }
  return buffer;
}

function hydrateLayer(layer: MapGridLayer, kind: MapGridKind, buffer: ArrayBuffer): MapGridLayer {
  const data = kind === 'biome' ? new Uint8Array(buffer) : new Float32Array(buffer);
  return { ...layer, data, encoding: mapGridEncoding(kind) };
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

  const map = parseMapFile(await res.text(), false);
  const cellCount = map.height.width * map.height.height;

  const heightFile = map.height.file ?? mapGridSidecarFile(id, 'height');
  const biomeFile = map.biome.file ?? mapGridSidecarFile(id, 'biome');

  const [heightBuf, biomeBuf] = await Promise.all([
    fetchGridBuffer(id, heightFile, expectedGridByteLength('height', cellCount)),
    fetchGridBuffer(id, biomeFile, expectedGridByteLength('biome', cellCount)),
  ]);

  map.height = hydrateLayer(map.height, 'height', heightBuf);
  map.biome = hydrateLayer(map.biome, 'biome', biomeBuf);

  if (map.heightBase) {
    const baseFile = map.heightBase.file ?? mapGridSidecarFile(id, 'heightBase');
    const baseBuf = await fetchGridBuffer(
      id,
      baseFile,
      expectedGridByteLength('heightBase', cellCount),
    );
    map.heightBase = hydrateLayer(map.heightBase, 'heightBase', baseBuf);
  }

  assertValidMapFile(map, true);
  return map;
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
