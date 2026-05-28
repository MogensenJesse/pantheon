// src/map/MapIO.ts — map JSON serialize, parse, download, fetch

import { isValidMapEntity } from './mapEntityCatalog';

import {

  defaultMapWorldMeta,

  isBiomeId,

  MAP_FILE_VERSION,

  MAP_FILE_VERSION_V1,

  mapGridSize,

  type MapEntity,

  type MapFile,

  type MapGrassSettings,

} from './MapTypes';

import { bakeProceduralMapGrids, type MapGrids } from './MapGrids';

import { WORLD } from '../world/WorldConfig';



export interface GridsToMapFileOptions {

  entities?: MapEntity[];

  grass?: MapGrassSettings;

}



export function gridsToMapFile(

  id: string,

  name: string,

  grids: MapGrids,

  options: GridsToMapFileOptions = {},

): MapFile {

  const map: MapFile = {

    version: MAP_FILE_VERSION,

    id,

    name,

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



function validateGrassSettings(grass: unknown): grass is MapGrassSettings {

  if (!grass || typeof grass !== 'object') return false;

  const g = grass as MapGrassSettings;

  if (typeof g.enabled !== 'boolean') return false;

  if (g.densityMul !== undefined && (typeof g.densityMul !== 'number' || !Number.isFinite(g.densityMul))) {

    return false;

  }

  return true;

}



function validateEntities(entities: unknown): void {

  if (!Array.isArray(entities)) throw new Error('entities must be an array');

  if (entities.length > 5000) throw new Error('entities array exceeds max length (5000)');

  for (let i = 0; i < entities.length; i++) {

    if (!isValidMapEntity(entities[i])) {

      throw new Error(`Invalid entity at index ${i}`);

    }

  }

}



export function validateMapFile(map: MapFile): void {

  if (map.version !== MAP_FILE_VERSION && map.version !== MAP_FILE_VERSION_V1) {

    throw new Error(`Unsupported map version: ${map.version}`);

  }

  const expected = mapGridSize(map.world.segments);

  if (map.height.width !== expected || map.height.height !== expected) {

    throw new Error(`Expected ${expected}×${expected} grids for segments=${map.world.segments}`);

  }

  for (const v of map.biome.data) {

    if (!isBiomeId(v)) throw new Error(`Invalid biome id: ${v}`);

  }

  if (map.version >= MAP_FILE_VERSION) {

    if (map.entities !== undefined) validateEntities(map.entities);

    if (map.grass !== undefined && !validateGrassSettings(map.grass)) {

      throw new Error('Invalid grass settings');

    }

  }

}



export function serializeMapFile(map: MapFile): string {

  return JSON.stringify(map, null, 2);

}



export function parseMapFile(json: string): MapFile {

  const map = JSON.parse(json) as MapFile;

  validateMapFile(map);

  return map;

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

  const payload = (await res.json()) as { ok?: boolean; error?: string; path?: string; maps?: string[] };

  if (!res.ok || !payload.ok || !payload.path || !payload.maps) {

    throw new Error(payload.error ?? `Save failed (${res.status})`);

  }

  return { path: payload.path, maps: payload.maps };

}



export function populateMapListSelect(select: HTMLSelectElement, ids: string[], placeholder = '— maps —'): void {

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

  const res = await fetch(`/maps/${id}.json`);

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



export function createNewMapFile(

  id = 'new-map',

  name = 'New Map',

  seed: string = WORLD.SEED,

): MapFile {

  const grids = bakeProceduralMapGrids(seed);

  return gridsToMapFile(id, name, grids);

}


