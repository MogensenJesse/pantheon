// vite/mapDevApiPlugin.ts — DEV-only API to write map JSON into public/maps/

import fs from 'node:fs/promises';

import path from 'node:path';

import type { IncomingMessage, ServerResponse } from 'node:http';

import type { Plugin } from 'vite';



const SAVE_PATH = '/api/dev/maps/save';

const MAP_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

const MAP_VERSIONS = new Set([1, 2]);

const MAX_BODY_BYTES = 2 * 1024 * 1024;

const MAX_ENTITIES = 5000;



interface MapGridLayer {

  width: number;

  height: number;

  data: unknown;

}



interface MapPayload {

  version: number;

  id: string;

  name: string;

  world?: { segments?: number };

  height: MapGridLayer;

  biome: MapGridLayer;

  entities?: unknown[];

  grass?: { enabled?: boolean; densityMul?: number };

}



function sendJson(res: ServerResponse, status: number, body: unknown): void {

  res.statusCode = status;

  res.setHeader('Content-Type', 'application/json');

  res.end(JSON.stringify(body));

}



function readBody(req: IncomingMessage): Promise<string> {

  return new Promise((resolve, reject) => {

    const chunks: Buffer[] = [];

    let size = 0;

    req.on('data', (chunk: Buffer) => {

      size += chunk.length;

      if (size > MAX_BODY_BYTES) {

        reject(new Error('Request body too large'));

        req.destroy();

        return;

      }

      chunks.push(chunk);

    });

    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));

    req.on('error', reject);

  });

}



function isBiomeId(value: number): boolean {

  return Number.isInteger(value) && value >= 0 && value <= 5;

}



function isValidEntity(entity: unknown): boolean {

  if (!entity || typeof entity !== 'object') return false;

  const e = entity as { type?: string };

  if (typeof e.type !== 'string') return false;

  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);



  switch (e.type) {

    case 'prop':

    case 'mountain': {

      const p = e as { key?: string; x?: number; z?: number; rotY?: number; scale?: number };

      return typeof p.key === 'string' && finite(p.x) && finite(p.z) && finite(p.rotY) && finite(p.scale);

    }

    case 'playerStart': {

      const p = e as { x?: number; z?: number };

      return finite(p.x) && finite(p.z);

    }

    case 'standingStone': {

      const p = e as { stoneId?: number; x?: number; z?: number };

      return [0, 1, 2, 3, 4].includes(p.stoneId as number) && finite(p.x) && finite(p.z);

    }

    case 'orb': {

      const p = e as { x?: number; z?: number; energy?: number };

      return finite(p.x) && finite(p.z) && (p.energy === undefined || finite(p.energy));

    }

    case 'landmark': {

      const p = e as { landmark?: string; x?: number; z?: number };

      return (

        ['ancientOak', 'sacredSpring', 'drownedTemple', 'highCairn'].includes(p.landmark ?? '') &&

        finite(p.x) &&

        finite(p.z)

      );

    }

    default:

      return false;

  }

}



function validateEntities(entities: unknown): string | null {

  if (!Array.isArray(entities)) return 'entities must be an array';

  if (entities.length > MAX_ENTITIES) return `entities exceeds max length (${MAX_ENTITIES})`;

  for (let i = 0; i < entities.length; i++) {

    if (!isValidEntity(entities[i])) return `Invalid entity at index ${i}`;

  }

  return null;

}



function validateMapPayload(body: unknown): { ok: true; map: MapPayload } | { ok: false; error: string } {

  if (!body || typeof body !== 'object') {

    return { ok: false, error: 'Body must be a JSON object' };

  }

  const map = body as MapPayload;

  if (!MAP_VERSIONS.has(map.version)) {

    return { ok: false, error: `Unsupported map version: ${map.version}` };

  }

  const id = typeof map.id === 'string' ? map.id.trim().toLowerCase() : '';

  if (!MAP_ID_RE.test(id)) {

    return { ok: false, error: 'Invalid map id (use a-z, 0-9, hyphen, underscore)' };

  }

  if (typeof map.name !== 'string' || !map.name.trim()) {

    return { ok: false, error: 'Map name is required' };

  }



  const segments = map.world?.segments ?? 128;

  const expected = segments + 1;

  const layers: Array<{ name: string; layer: MapGridLayer }> = [

    { name: 'height', layer: map.height },

    { name: 'biome', layer: map.biome },

  ];



  for (const { name, layer } of layers) {

    if (!layer || typeof layer.width !== 'number' || typeof layer.height !== 'number') {

      return { ok: false, error: `Missing ${name} grid dimensions` };

    }

    if (layer.width !== expected || layer.height !== expected) {

      return { ok: false, error: `${name} grid must be ${expected}×${expected}` };

    }

    if (!Array.isArray(layer.data) || layer.data.length !== expected * expected) {

      return { ok: false, error: `${name} data length mismatch` };

    }

  }



  for (const v of map.biome.data as number[]) {

    if (typeof v !== 'number' || !isBiomeId(v)) {

      return { ok: false, error: `Invalid biome id: ${v}` };

    }

  }



  for (const v of map.height.data as number[]) {

    if (typeof v !== 'number' || !Number.isFinite(v)) {

      return { ok: false, error: 'Height data must be finite numbers' };

    }

  }



  if (map.version >= 2 && map.entities !== undefined) {

    const entityErr = validateEntities(map.entities);

    if (entityErr) return { ok: false, error: entityErr };

  }



  if (map.grass !== undefined) {

    if (typeof map.grass.enabled !== 'boolean') {

      return { ok: false, error: 'grass.enabled must be boolean' };

    }

    if (

      map.grass.densityMul !== undefined &&

      (typeof map.grass.densityMul !== 'number' || !Number.isFinite(map.grass.densityMul))

    ) {

      return { ok: false, error: 'grass.densityMul must be a finite number' };

    }

  }



  map.id = id;

  map.name = map.name.trim();

  return { ok: true, map };

}



async function readManifest(mapsDir: string): Promise<string[]> {

  const manifestPath = path.join(mapsDir, 'manifest.json');

  try {

    const raw = await fs.readFile(manifestPath, 'utf8');

    const data = JSON.parse(raw) as { maps?: string[] };

    return Array.isArray(data.maps) ? data.maps.filter((id) => typeof id === 'string') : [];

  } catch {

    return [];

  }

}



async function writeManifest(mapsDir: string, maps: string[]): Promise<void> {

  const sorted = [...new Set(maps)].sort();

  const manifestPath = path.join(mapsDir, 'manifest.json');

  await fs.writeFile(manifestPath, `${JSON.stringify({ maps: sorted }, null, 2)}\n`, 'utf8');

}



async function handleSave(mapsDir: string, body: string): Promise<{ path: string; maps: string[] }> {

  let parsed: unknown;

  try {

    parsed = JSON.parse(body);

  } catch {

    throw new Error('Invalid JSON');

  }



  const validated = validateMapPayload(parsed);

  if (!validated.ok) {

    throw new Error(validated.error);

  }



  const map = validated.map;

  await fs.mkdir(mapsDir, { recursive: true });



  const filePath = path.join(mapsDir, `${map.id}.json`);

  const relativePath = `public/maps/${map.id}.json`;

  await fs.writeFile(filePath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');



  const maps = await readManifest(mapsDir);

  if (!maps.includes(map.id)) maps.push(map.id);

  await writeManifest(mapsDir, maps);



  return { path: relativePath, maps: [...new Set(maps)].sort() };

}



export function mapDevApiPlugin(): Plugin {

  return {

    name: 'pantheon-map-dev-api',

    apply: 'serve',

    configureServer(server) {

      const mapsDir = path.resolve(server.config.root, 'public', 'maps');



      server.middlewares.use(async (req, res, next) => {

        if (req.url !== SAVE_PATH || req.method !== 'POST') {

          next();

          return;

        }



        try {

          const body = await readBody(req);

          const result = await handleSave(mapsDir, body);

          sendJson(res, 200, { ok: true, ...result });

        } catch (e) {

          const message = e instanceof Error ? e.message : 'Save failed';

          sendJson(res, 400, { ok: false, error: message });

        }

      });

    },

  };

}


