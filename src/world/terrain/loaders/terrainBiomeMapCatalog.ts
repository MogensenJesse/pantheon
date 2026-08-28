// src/world/terrain/loaders/terrainBiomeMapCatalog.ts — editor catalog of scanned biome color maps

export const TERRAIN_BIOME_MAPS_API = '/api/dev/terrain-biome-maps';

export interface TerrainBiomeMapCatalogEntry {
  colorUrl: string;
  materialKey: string;
}

export interface TerrainBiomeMapCatalog {
  biomes: Record<string, TerrainBiomeMapCatalogEntry>;
}

let catalogPromise: Promise<TerrainBiomeMapCatalog | null> | null = null;

async function fetchCatalogInner(): Promise<TerrainBiomeMapCatalog | null> {
  if (!import.meta.env.DEV) return null;
  try {
    const res = await fetch(TERRAIN_BIOME_MAPS_API);
    if (!res.ok) return null;
    const body = (await res.json()) as TerrainBiomeMapCatalog;
    if (!body || typeof body.biomes !== 'object') return null;
    return body;
  } catch {
    return null;
  }
}

/** DEV editor: live folder scan. Null in play builds or if the Vite plugin is missing. */
export function fetchTerrainBiomeMapCatalog(): Promise<TerrainBiomeMapCatalog | null> {
  catalogPromise ??= fetchCatalogInner();
  return catalogPromise;
}
