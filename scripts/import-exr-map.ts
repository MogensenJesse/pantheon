// scripts/import-exr-map.ts — bake Height/Diffuse EXR into public/maps/{id} sidecars
import fs from 'node:fs';
import path from 'node:path';
import { decodeExrScanlineFloat } from '../src/map/authoring/decodeExrScanline.ts';
import { importExrMap } from '../src/map/authoring/importExrMap.ts';
import { mapGridSidecarFile } from '../src/map/mapGridSidecars.ts';
import { defaultMapWorldMeta, MAP_FILE_VERSION } from '../src/map/MapTypes.ts';

function argValue(flag: string, fallback: string): string {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1]!;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function writeTyped(filePath: string, data: Float32Array | Uint8Array): void {
  fs.writeFileSync(
    filePath,
    Buffer.from(data.buffer, data.byteOffset, data.byteLength),
  );
}

function readExr(filePath: string) {
  const raw = fs.readFileSync(filePath);
  return decodeExrScanlineFloat(
    raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
  );
}

const mapId = argValue('--id', 'premade');
const heightPath = argValue(
  '--height',
  'C:\\Users\\jesse.mogensen\\Downloads\\Height Map.exr',
);
const diffusePath = argValue(
  '--diffuse',
  'C:\\Users\\jesse.mogensen\\Downloads\\Diffuse Map.exr',
);
const skipDiffuse = hasFlag('--no-diffuse');
const flipY = hasFlag('--flip-y');
const outDir = path.resolve('public/maps');

if (!fs.existsSync(heightPath)) {
  throw new Error(`Height EXR not found: ${heightPath}`);
}

const height = readExr(heightPath);
console.log(`Height EXR ${height.width}×${height.height}`);

let diffuse = undefined;
if (!skipDiffuse && fs.existsSync(diffusePath)) {
  diffuse = readExr(diffusePath);
  console.log(`Diffuse EXR ${diffuse.width}×${diffuse.height}`);
}

const imported = importExrMap({ height, diffuse, flipY });
const { grids } = imported;
const cell = grids.size;

fs.mkdirSync(outDir, { recursive: true });
const heightFile = mapGridSidecarFile(mapId, 'height');
const biomeFile = mapGridSidecarFile(mapId, 'biome');
writeTyped(path.join(outDir, heightFile), grids.height);
writeTyped(path.join(outDir, biomeFile), grids.biome);

const json = {
  version: MAP_FILE_VERSION,
  id: mapId,
  world: defaultMapWorldMeta(),
  height: {
    width: cell,
    height: cell,
    file: heightFile,
    encoding: 'f32le',
  },
  biome: {
    width: cell,
    height: cell,
    file: biomeFile,
    encoding: 'u8',
  },
  terrainShape: imported.terrainShape,
  entities: imported.entities,
};

fs.writeFileSync(path.join(outDir, `${mapId}.json`), `${JSON.stringify(json, null, 2)}\n`);

const manifestPath = path.join(outDir, 'manifest.json');
let maps: string[] = [];
try {
  const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { maps?: string[] };
  maps = existing.maps ?? [];
} catch {
  maps = [];
}
if (!maps.includes(mapId)) maps.push(mapId);
maps.sort();
fs.writeFileSync(manifestPath, `${JSON.stringify({ maps }, null, 2)}\n`);

const land = grids.biome.reduce((n, id) => n + (id !== 0 ? 1 : 0), 0);
console.log(
  `Wrote public/maps/${mapId}.json + sidecars (${cell}×${cell}, land cells ${land}/${cell * cell})`,
);
