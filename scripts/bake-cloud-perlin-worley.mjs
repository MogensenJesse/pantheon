// scripts/bake-cloud-perlin-worley.mjs — one-time DEV bake → public/textures/environment/
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bakePerlinWorleyVolume,
  encodePerlinWorleyBin,
} from '../src/rendering/atmosphere/volumetricClouds/bake/perlinWorleyBake.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'public/textures/environment/cloud-perlin-worley.bin');

console.log('Baking Perlin-Worley 3D noise (32×32×64)…');
const t0 = performance.now();
const rgba = bakePerlinWorleyVolume();
const bin = encodePerlinWorleyBin(rgba);
writeFileSync(outPath, bin);
console.log(
  `Wrote ${outPath} (${bin.byteLength} bytes) in ${((performance.now() - t0) / 1000).toFixed(1)}s`,
);
