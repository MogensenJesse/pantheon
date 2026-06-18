// vite/mapDevApiPlugin.ts — DEV-only API to write map JSON into public/maps/

import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';
import { type MapPayloadLike, validateMapPayload } from '../src/map/validateMapPayload';

const SAVE_PATH = '/api/dev/maps/save';
/** 513×513 blank map JSON is ~4.5 MB; sculpted maps with entities need headroom. */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;

    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        req.off('data', onData);
        req.off('end', onEnd);
        req.resume();
        reject(
          new Error(
            `Request body too large (max ${Math.round(MAX_BODY_BYTES / (1024 * 1024))} MB)`,
          ),
        );
        return;
      }
      chunks.push(chunk);
    };

    const onEnd = () => {
      if (tooLarge) return;
      resolve(Buffer.concat(chunks).toString('utf8'));
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
  await fs.writeFile(manifestPath, `${JSON.stringify({ maps: sorted }, null, 2)}\n`, 'utf8');
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

  const validated = validateMapPayload(parsed);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  const map = validated.map;

  await fs.mkdir(mapsDir, { recursive: true });
  const filePath = path.join(mapsDir, `${map.id}.json`);
  const relativePath = `public/maps/${map.id}.json`;
  const { name: _legacyName, ...mapToWrite } = map as MapPayloadLike & { name?: string };

  await fs.writeFile(filePath, `${JSON.stringify(mapToWrite, null, 2)}\n`, 'utf8');

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
          const status = message.startsWith('Request body too large') ? 413 : 400;
          sendJson(res, status, { ok: false, error: message });
        }
      });
    },
  };
}
