// vite/optimizerDevApiPlugin.ts — DEV-only optimizer library / capabilities / staged save

import { copyFileSync, createWriteStream, existsSync, renameSync, unlinkSync } from 'node:fs';
import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Plugin } from 'vite';
import { detectKtxTools } from '../scripts/lib/ktxEncoder.mjs';
import { bakeOptimizedLod0ToPlayChain } from '../scripts/lib/playPropBake.mjs';
import { allPropAssetEntries } from '../src/assets/assetManifest.ts';
import { MAX_SAVE_GLB_BYTES } from '../src/optimizer/pipeline/limits.ts';

const CAP_PATH = '/api/dev/optimizer/capabilities';
const LIB_PATH = '/api/dev/optimizer/library';
const SAVE_PATH = '/api/dev/optimizer/save';
const MAX_GLB_BYTES = MAX_SAVE_GLB_BYTES;
const SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function sendNdjson(res: ServerResponse, event: unknown): void {
  res.write(`${JSON.stringify(event)}\n`);
}

function isInside(root: string, candidate: string): boolean {
  const rel = path.relative(root, candidate);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function collectLod0(
  dir: string,
  modelsRoot: string,
  out: Array<{ family: string; name: string; relativePath: string; bytes: number }> = [],
): Promise<typeof out> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectLod0(full, modelsRoot, out);
      continue;
    }
    if (!/\.glb$/i.test(entry.name) || /_lod[12]\.glb$/i.test(entry.name)) continue;
    const rel = path.relative(modelsRoot, full).replace(/\\/g, '/');
    const family = rel.split('/')[0] ?? 'models';
    const name = entry.name.replace(/\.glb$/i, '');
    const st = await fs.stat(full);
    out.push({ family, name, relativePath: rel, bytes: st.size });
  }
  return out;
}

let saveQueue: Promise<void> = Promise.resolve();

function enqueueSave<T>(job: () => Promise<T>): Promise<T> {
  const run = saveQueue.then(job, job);
  saveQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readLimitedBody(
  req: IncomingMessage,
  destPath: string,
  maxBytes: number,
): Promise<number> {
  let size = 0;
  await pipeline(
    req,
    async function* (source) {
      for await (const chunk of source) {
        const buf = chunk as Buffer;
        size += buf.length;
        if (size > maxBytes) {
          throw new Error(
            `Request body too large (max ${Math.round(maxBytes / (1024 * 1024))} MB)`,
          );
        }
        yield buf;
      }
    },
    createWriteStream(destPath),
  );
  return size;
}

export function optimizerDevApiPlugin(): Plugin {
  return {
    name: 'pantheon-optimizer-dev-api',
    apply: 'serve',
    configureServer(server) {
      const modelsRoot = path.resolve(server.config.root, 'public', 'models');

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        const pathname = url.split('?')[0] ?? '';

        if (pathname === CAP_PATH && req.method === 'GET') {
          sendJson(res, 200, detectKtxTools());
          return;
        }

        if (pathname === LIB_PATH && req.method === 'GET') {
          try {
            const files = await collectLod0(modelsRoot, modelsRoot);
            const catalog = allPropAssetEntries();
            const entries = files.map((file) => {
              const urlPath = `models/${file.relativePath}`;
              const matches = catalog.filter((e) => decodeURIComponent(e.path) === urlPath);
              return {
                ...file,
                url: `/models/${file.relativePath}`,
                catalogKeys: matches.map((m) => m.key),
                embeddedLod: matches.some(
                  (m) => m.extractLod1 !== undefined || m.extractLod2 !== undefined,
                ),
              };
            });
            res.setHeader('Cache-Control', 'no-store');
            sendJson(res, 200, { entries });
          } catch (e) {
            sendJson(res, 500, {
              ok: false,
              error: e instanceof Error ? e.message : 'Library failed',
            });
          }
          return;
        }

        if (pathname === SAVE_PATH && req.method === 'POST') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/x-ndjson');
          res.setHeader('Cache-Control', 'no-store');
          const parsed = new URL(url, 'http://127.0.0.1');
          const family = parsed.searchParams.get('family') ?? '';
          const name = parsed.searchParams.get('name') ?? '';
          const overwrite = parsed.searchParams.get('overwrite') === '1';
          const emitLod = parsed.searchParams.get('lod') !== '0';

          const fail = (message: string, status = 400) => {
            res.statusCode = status;
            sendNdjson(res, { phase: 'error', ok: false, error: message, message });
            res.end();
          };

          if (!SEGMENT.test(family) || !SEGMENT.test(name)) {
            fail('family and name must be short alphanumeric path segments');
            return;
          }
          if (/_lod[12]$/i.test(name)) {
            fail('Name must be the canonical lod0 basename (not *_lod1 / *_lod2)');
            return;
          }

          const destDir = path.resolve(modelsRoot, family);
          const destLod0 = path.resolve(destDir, `${name}.glb`);
          if (!isInside(modelsRoot, destLod0)) {
            fail('Destination escapes public/models');
            return;
          }

          const catalogHits = allPropAssetEntries().filter(
            (e) => decodeURIComponent(e.path) === `models/${family}/${name}.glb`,
          );
          if (catalogHits.some((e) => e.extractLod1 !== undefined || e.extractLod2 !== undefined)) {
            fail(
              'This catalog asset uses embedded extractLod1/extractLod2. Save to a new sibling-based family instead of overwriting it.',
            );
            return;
          }

          const stageRoot = await fs.mkdtemp(path.join(tmpdir(), 'pantheon-opt-save-'));
          const stagedSrc = path.join(stageRoot, 'source.glb');
          let cancelled = false;
          const markCancelled = () => {
            if (!res.writableEnded) cancelled = true;
          };
          res.on('close', markCancelled);
          try {
            sendNdjson(res, { phase: 'stage', message: 'Receiving optimized lod0…' });
            await readLimitedBody(req, stagedSrc, MAX_GLB_BYTES);
            await enqueueSave(async () => {
              if (cancelled) throw new Error('Save cancelled');
              if (existsSync(destLod0) && !overwrite) {
                throw new Error(`${family}/${name}.glb already exists (enable overwrite)`);
              }
              const stagedDir = path.join(stageRoot, 'out');
              await fs.mkdir(stagedDir);
              const stagedLod0 = path.join(stagedDir, `${name}.glb`);
              sendNdjson(res, { phase: 'bake', message: 'Compressing KTX2 + LOD chain…' });
              const written = bakeOptimizedLod0ToPlayChain(stagedSrc, stagedLod0, {
                emitLodChain: emitLod,
                onProgress: (phase, message) => sendNdjson(res, { phase, message }),
              });
              if (cancelled) throw new Error('Save cancelled');
              sendNdjson(res, { phase: 'promote', message: 'Promoting files…' });
              await fs.mkdir(destDir, { recursive: true });
              const promotions = written.map((file) => ({
                src: file,
                dest: path.join(destDir, path.basename(file)),
                tmp: path.join(destDir, `${path.basename(file)}.tmp`),
              }));
              try {
                for (const p of promotions) copyFileSync(p.src, p.tmp);
                if (cancelled) throw new Error('Save cancelled');
                for (const p of promotions) {
                  if (existsSync(p.dest)) unlinkSync(p.dest);
                  renameSync(p.tmp, p.dest);
                }
              } catch (err) {
                for (const p of promotions) {
                  if (existsSync(p.tmp)) unlinkSync(p.tmp);
                }
                throw err;
              }
              const rels = written.map((f) => `public/models/${family}/${path.basename(f)}`);
              sendNdjson(res, {
                phase: 'done',
                ok: true,
                message: `Saved ${rels.join(', ')}`,
                files: rels,
              });
              res.end();
            });
          } catch (e) {
            const message = e instanceof Error ? e.message : 'Save failed';
            const status = message.startsWith('Request body too large') ? 413 : 400;
            if (!res.writableEnded) fail(message, status);
          } finally {
            res.off('close', markCancelled);
            await fs.rm(stageRoot, { recursive: true, force: true }).catch(() => undefined);
          }
          return;
        }

        next();
      });
    },
  };
}
