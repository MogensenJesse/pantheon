// vite/gradeLutManifestPlugin.ts — scan public/textures/grade/**/*.cube → manifest.json

import fs from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin } from 'vite';

const DEV_CATALOG_PATH = '/api/dev/grade-luts';

export interface GradeLutManifestEntry {
  id: string;
  path: string;
  vendor: string;
  name: string;
}

export interface GradeLutManifestFile {
  luts: GradeLutManifestEntry[];
  vendors: string[];
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function scanGradeLuts(gradeDir: string): Promise<GradeLutManifestFile> {
  const luts: GradeLutManifestEntry[] = [];
  const vendors = new Set<string>();

  async function walk(absDir: string, relDir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
      entries = await fs.readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const absPath = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        const nextRel = relDir ? `${relDir}/${entry.name}` : entry.name;
        await walk(absPath, nextRel);
        continue;
      }
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.cube')) continue;

      const vendor = relDir || 'Root';
      const name = entry.name.replace(/\.cube$/i, '');
      const id = relDir ? `${relDir}/${name}` : name;
      const urlPath = `/textures/grade/${relDir ? `${relDir}/` : ''}${entry.name}`.replace(
        /\/+/g,
        '/',
      );
      luts.push({ id, path: urlPath, vendor, name });
      vendors.add(vendor);
    }
  }

  await walk(gradeDir, '');
  luts.sort((a, b) => a.id.localeCompare(b.id));
  return { luts, vendors: [...vendors].sort((a, b) => a.localeCompare(b)) };
}

async function writeManifest(gradeDir: string): Promise<GradeLutManifestFile> {
  const manifest = await scanGradeLuts(gradeDir);
  await fs.mkdir(gradeDir, { recursive: true });
  await fs.writeFile(
    path.join(gradeDir, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  return manifest;
}

export function gradeLutManifestPlugin(): Plugin {
  let gradeDir = '';

  return {
    name: 'pantheon-grade-lut-manifest',
    configResolved(config) {
      gradeDir = path.resolve(config.root, 'public', 'textures', 'grade');
    },
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const url = req.url?.split('?')[0];
        if (url !== DEV_CATALOG_PATH) {
          next();
          return;
        }
        try {
          const manifest = await scanGradeLuts(gradeDir);
          sendJson(res, 200, manifest);
        } catch (e) {
          const message = e instanceof Error ? e.message : 'LUT scan failed';
          sendJson(res, 500, { error: message });
        }
      });
    },
    async buildStart() {
      await writeManifest(gradeDir);
    },
  };
}
