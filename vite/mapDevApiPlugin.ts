// vite/mapDevApiPlugin.ts — DEV-only API to write map JSON + grid sidecars into public/maps/

import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { isValidMapId, normalizeMapId } from '../src/map/MapTypes.ts';
import {
  expectedGridByteLength,
  isMapGridKind,
  isValidMapGridSidecar,
  type MapGridKind,
  mapGridSidecarFile,
} from '../src/map/mapGridSidecars.ts';
import { type MapPayloadLike, validateMapPayload } from '../src/map/validateMapPayload.ts';

const SAVE_PATH = '/api/dev/maps/save';
const BIN_PATH = '/api/dev/maps/bin';
/** Metadata JSON only — grids are binary sidecars. */
const MAX_JSON_BYTES = 2 * 1024 * 1024;
/** 2049² Float32 height ≈ 16.8 MB. */
const MAX_BIN_BYTES = 24 * 1024 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readTextBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.off('data', onData);
        req.off('end', onEnd);
        req.resume();
        reject(
          new Error(`Request body too large (max ${Math.round(maxBytes / (1024 * 1024))} MB)`),
        );
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', reject);
  });
}

function readBinaryBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.off('data', onData);
        req.off('end', onEnd);
        req.resume();
        reject(
          new Error(`Request body too large (max ${Math.round(maxBytes / (1024 * 1024))} MB)`),
        );
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      resolve(Buffer.concat(chunks));
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', reject);
  });
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
  await fs.writeFile(manifestPath, `${JSON.stringify({ maps: sorted }, null, 2)}\n`);
}

function stripGridSamples(map: MapPayloadLike): MapPayloadLike {
  const strip = (layer: MapPayloadLike['height'] | undefined) => {
    if (!layer) return layer;
    const { data: _data, ...meta } = layer;
    return meta;
  };
  return {
    ...map,
    height: strip(map.height)!,
    biome: strip(map.biome)!,
    heightBase: map.heightBase ? strip(map.heightBase) : undefined,
  };
}

async function handleSave(
  mapsDir: string,
  body: string,
): Promise<{ path: string; maps: string[] }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error('Invalid JSON');
  }

  const validated = validateMapPayload(parsed, { requireGridSamples: false });
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const map = stripGridSamples(validated.map);

  await fs.mkdir(mapsDir, { recursive: true });
  const filePath = path.join(mapsDir, `${map.id}.json`);
  const relativePath = `public/maps/${map.id}.json`;
  const { name: _legacyName, ...mapToWrite } = map as MapPayloadLike & { name?: string };

  await fs.writeFile(filePath, `${JSON.stringify(mapToWrite, null, 2)}\n`);

  const maps = await readManifest(mapsDir);
  if (!maps.includes(map.id)) maps.push(map.id);
  await writeManifest(mapsDir, maps);

  return { path: relativePath, maps: [...new Set(maps)].sort() };
}

function parseBinQuery(url: string): { id: string; kind: MapGridKind } | { error: string } {
  const parsed = new URL(url, 'http://127.0.0.1');
  const idRaw = parsed.searchParams.get('id') ?? '';
  const kindRaw = parsed.searchParams.get('kind') ?? '';
  const id = normalizeMapId(idRaw);
  if (!isValidMapId(id)) return { error: 'Invalid map id' };
  if (!isMapGridKind(kindRaw)) return { error: 'Invalid grid kind' };
  return { id, kind: kindRaw };
}

async function handleBin(mapsDir: string, url: string, body: Buffer): Promise<{ path: string }> {
  const query = parseBinQuery(url);
  if ('error' in query) throw new Error(query.error);

  const { id, kind } = query;
  const fileName = mapGridSidecarFile(id, kind);
  if (!isValidMapGridSidecar(id, kind, fileName)) {
    throw new Error('Invalid grid sidecar name');
  }

  const metaPath = path.join(mapsDir, `${id}.json`);
  let expectedCells: number | null = null;
  try {
    const raw = await fs.readFile(metaPath, 'utf8');
    const meta = JSON.parse(raw) as { height?: { width?: number; height?: number } };
    const w = meta.height?.width;
    const h = meta.height?.height;
    if (typeof w === 'number' && typeof h === 'number') expectedCells = w * h;
  } catch {
    throw new Error(`Save map JSON for "${id}" before writing grid sidecars`);
  }

  if (expectedCells === null) throw new Error('Map JSON is missing height dimensions');
  const expectedBytes = expectedGridByteLength(kind, expectedCells);
  if (body.byteLength !== expectedBytes) {
    throw new Error(
      `${kind} sidecar byte length mismatch (got ${body.byteLength}, expected ${expectedBytes})`,
    );
  }

  await fs.mkdir(mapsDir, { recursive: true });
  await fs.writeFile(path.join(mapsDir, fileName), body);
  return { path: `public/maps/${fileName}` };
}

export function mapDevApiPlugin(): Plugin {
  return {
    name: 'pantheon-map-dev-api',
    apply: 'serve',
    configureServer(server) {
      const mapsDir = path.resolve(server.config.root, 'public', 'maps');

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        const pathname = url.split('?')[0] ?? '';

        if (pathname === SAVE_PATH && req.method === 'POST') {
          try {
            const body = await readTextBody(req, MAX_JSON_BYTES);
            const result = await handleSave(mapsDir, body);
            sendJson(res, 200, { ok: true, ...result });
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Save failed';
            const status = message.startsWith('Request body too large') ? 413 : 400;
            sendJson(res, status, { ok: false, error: message });
          }
          return;
        }

        if (pathname === BIN_PATH && req.method === 'POST') {
          try {
            const body = await readBinaryBody(req, MAX_BIN_BYTES);
            const result = await handleBin(mapsDir, url, body);
            sendJson(res, 200, { ok: true, ...result });
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Save failed';
            const status = message.startsWith('Request body too large') ? 413 : 400;
            sendJson(res, status, { ok: false, error: message });
          }
          return;
        }

        next();
      });
    },
  };
}
