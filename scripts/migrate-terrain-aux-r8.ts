// scripts/migrate-terrain-aux-r8.ts — one-time: packed RGBA8 terrainAux sidecar -> one-byte convex grid
//
// Old sidecars hold RGBA8 per cell but only the A channel (convex) is ever read. This writes
// `<id>.terrainAux.u8` (1 byte per cell, a quarter of the size), points the map JSON at it and removes
// the old file. Only the `terrainAux` block of the JSON is rewritten, as text, so any other edits in
// the file (entities, water, ...) are left exactly as they are.
//
// Usage: node --experimental-strip-types scripts/migrate-terrain-aux-r8.ts <mapId> [<mapId> ...]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMapId } from '../src/map/MapTypes.ts';
import {
  legacyTerrainAuxSidecarFile,
  mapGridEncoding,
  mapGridSidecarFile,
} from '../src/map/mapGridSidecars.ts';

const mapsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'maps');

function migrate(rawId: string): void {
  const id = normalizeMapId(rawId);
  const jsonPath = path.join(mapsDir, `${id}.json`);
  const text = fs.readFileSync(jsonPath, 'utf8');
  const map = JSON.parse(text) as {
    terrainAux?: { width: number; height: number; file?: string; encoding?: string };
  };
  const aux = map.terrainAux;
  if (!aux) {
    console.log(`${id}: no terrainAux, skipped`);
    return;
  }
  if (aux.encoding !== 'rgba8') {
    console.log(`${id}: terrainAux already ${aux.encoding}, skipped`);
    return;
  }

  const oldName = aux.file ?? legacyTerrainAuxSidecarFile(id);
  const newName = mapGridSidecarFile(id, 'terrainAux');
  const rgba = fs.readFileSync(path.join(mapsDir, oldName));
  const cells = aux.width * aux.height;
  if (rgba.length !== cells * 4) {
    throw new Error(`${oldName}: ${rgba.length} bytes, expected ${cells * 4}`);
  }
  const convex = Buffer.alloc(cells);
  for (let i = 0; i < cells; i++) convex[i] = rgba[i * 4 + 3]!;

  // Rewrite just the two lines of the terrainAux block.
  const block = /("terrainAux":\s*\{[^}]*\})/;
  const match = block.exec(text);
  if (!match) throw new Error(`${id}.json: terrainAux block not found`);
  const rewritten = match[1]!
    .replace(/("file":\s*")[^"]*(")/, `$1${newName}$2`)
    .replace(/("encoding":\s*")[^"]*(")/, `$1${mapGridEncoding('terrainAux')}$2`);

  fs.writeFileSync(path.join(mapsDir, newName), convex);
  fs.writeFileSync(jsonPath, text.replace(block, rewritten));
  fs.rmSync(path.join(mapsDir, oldName), { force: true });
  console.log(`${id}: ${oldName} (${rgba.length} B) -> ${newName} (${convex.length} B)`);
}

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('Usage: migrate-terrain-aux-r8.ts <mapId> [<mapId> ...]');
  process.exit(1);
}
for (const id of ids) migrate(id);
