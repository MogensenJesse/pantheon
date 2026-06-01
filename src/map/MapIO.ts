// src/map/MapIO.ts — map JSON serialize, parse, download, fetch

import { createEmptyMapGrids, type MapGrids } from './MapGrids';
import {
  defaultMapWorldMeta,
  MAP_FILE_VERSION,
  type MapEntity,
  type MapFile,
  type MapGrassSettings,
} from './MapTypes';
import { assertValidMapFile } from './validateMapPayload';

export interface GridsToMapFileOptions {
  entities?: MapEntity[];

  grass?: MapGrassSettings;
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

    height: {
      width: grids.size,

      height: grids.size,

      data: Array.from(grids.height),
    },

    biome: {
      width: grids.size,

      height: grids.size,

      data: Array.from(grids.biome),
    },
  };

  if (options.entities?.length) map.entities = options.entities;

  if (options.grass) map.grass = options.grass;

  return map;
}

export function mapFileToGrids(map: MapFile): MapGrids {
  validateMapFile(map);

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

export function validateMapFile(map: MapFile): void {
  assertValidMapFile(map);
}

export function serializeMapFile(map: MapFile): string {
  return JSON.stringify(map, null, 2);
}

/** Legacy map JSON may include a removed `name` field; it is ignored. */
type MapFileJson = MapFile & { name?: string };

export function parseMapFile(json: string): MapFile {
  const raw = JSON.parse(json) as MapFileJson;

  if (raw.name !== undefined) delete raw.name;

  validateMapFile(raw);

  return raw;
}

export function downloadMapFile(map: MapFile): void {
  const blob = new Blob([serializeMapFile(map)], { type: 'application/json' });

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');

  a.href = url;

  a.download = `${map.id || 'map'}.json`;

  a.click();

  URL.revokeObjectURL(url);
}

const DEV_SAVE_URL = '/api/dev/maps/save';

export interface SaveMapToProjectResult {
  path: string;

  maps: string[];
}

/** Writes map JSON via Vite dev server (npm run dev only). */

export async function saveMapToProject(map: MapFile): Promise<SaveMapToProjectResult> {
  const res = await fetch(DEV_SAVE_URL, {
    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: serializeMapFile(map),
  });

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

export function populateMapListSelect(
  select: HTMLSelectElement,
  ids: string[],
  placeholder = '— maps —',
): void {
  select.replaceChildren();

  const first = document.createElement('option');

  first.value = '';

  first.textContent = placeholder;

  select.appendChild(first);

  for (const id of ids) {
    const opt = document.createElement('option');

    opt.value = id;

    opt.textContent = id;

    select.appendChild(opt);
  }
}

export async function fetchMapById(id: string): Promise<MapFile> {
  const res = await fetch(
    `/maps/${id}.json`,
    import.meta.env.DEV ? { cache: 'no-store' } : undefined,
  );

  if (!res.ok) throw new Error(`Failed to load map "${id}": ${res.status}`);

  return parseMapFile(await res.text());
}

/** List map ids from public/maps/manifest.json when present. */

export async function fetchMapManifest(): Promise<string[]> {
  try {
    const res = await fetch('/maps/manifest.json');

    if (!res.ok) return [];

    const data = (await res.json()) as { maps?: string[] };

    return data.maps ?? [];
  } catch {
    return [];
  }
}

/** Load manifest ids for the play chooser. */

export async function fetchMapSummaries(): Promise<string[]> {
  return fetchMapManifest();
}

export function loadMapFileFromInput(file: File): Promise<MapFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        resolve(parseMapFile(String(reader.result)));
      } catch (e) {
        reject(e);
      }
    };

    reader.onerror = () => reject(reader.error);

    reader.readAsText(file);
  });
}

export function createNewMapFile(id = 'new-map'): MapFile {
  const grids = createEmptyMapGrids();

  return gridsToMapFile(id, grids);
}
