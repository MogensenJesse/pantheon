// vite/terrainBiomeMapsPlugin.ts — DEV API: scan biome PBR folders → color URLs for the editor

import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { scanTerrainBiomeFolder } from '../scripts/lib/scanTerrainBiomeFolder.ts';
import { TERRAIN_ATLAS_BIOME_KEYS } from '../src/world/terrain/atlas/atlasConstants.ts';
import {
  TERRAIN_BIOME_MAPS_API,
  type TerrainBiomeMapCatalog,
} from '../src/world/terrain/loaders/terrainBiomeMapCatalog.ts';

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function biomeColorUrl(folder: string, colorRel: string): string {
  return encodeURI(`/textures/terrain/${folder}/${colorRel}`);
}

export function buildTerrainBiomeMapCatalog(terrainRoot: string): TerrainBiomeMapCatalog {
  const biomes: TerrainBiomeMapCatalog['biomes'] = {};
  for (const folder of TERRAIN_ATLAS_BIOME_KEYS) {
    try {
      const maps = scanTerrainBiomeFolder(path.join(terrainRoot, folder));
      biomes[folder] = {
        colorUrl: biomeColorUrl(folder, maps.colorRel),
        materialKey: maps.materialKey,
      };
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      throw new Error(`Biome "${folder}": ${detail}`);
    }
  }
  return { biomes };
}

export function terrainBiomeMapsPlugin(): Plugin {
  return {
    name: 'pantheon-terrain-biome-maps',
    apply: 'serve',
    configureServer(server) {
      const terrainRoot = path.resolve(server.config.root, 'public', 'textures', 'terrain');

      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next) => {
        const pathname = (req.url ?? '').split('?')[0] ?? '';
        if (pathname !== TERRAIN_BIOME_MAPS_API || req.method !== 'GET') {
          next();
          return;
        }
        try {
          sendJson(res, 200, buildTerrainBiomeMapCatalog(terrainRoot));
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Terrain biome scan failed';
          sendJson(res, 500, { ok: false, error: message });
        }
      });
    },
  };
}
