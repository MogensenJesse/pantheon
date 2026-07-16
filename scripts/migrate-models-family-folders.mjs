// One-time: public/models/glTF/ → public/models/{family}/ (self-contained gltf+bin+textures)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('public/models');
const SRC = path.join(ROOT, 'glTF');

/** glTF basename (no extension) → family folder name */
const FAMILY_BY_FILE = new Map([
  ...[1, 2, 3, 4, 5].map((n) => [`CommonTree_${n}`, 'common-tree']),
  ...[1, 2, 3, 4, 5].map((n) => [`TwistedTree_${n}`, 'twisted-tree']),
  ...[1, 2, 3, 4, 5].map((n) => [`Pine_${n}`, 'pine']),
  ...[1, 2, 3, 4, 5].map((n) => [`DeadTree_${n}`, 'dead-tree']),
  ...[1, 2, 3].map((n) => [`Rock_Medium_${n}`, 'rock-medium']),
  ['RockPath_Round_Small_1', 'rock-path'],
  ['RockPath_Round_Small_2', 'rock-path'],
  ['RockPath_Round_Small_3', 'rock-path'],
  ['RockPath_Round_Thin', 'rock-path'],
  ['RockPath_Round_Wide', 'rock-path'],
  ['RockPath_Square_Small_1', 'rock-path'],
  ['RockPath_Square_Small_2', 'rock-path'],
  ['RockPath_Square_Small_3', 'rock-path'],
  ['RockPath_Square_Thin', 'rock-path'],
  ['RockPath_Square_Wide', 'rock-path'],
  ['Bush_Common', 'bush'],
  ['Bush_Common_Flowers', 'bush'],
  ['Fern_1', 'fern'],
  ['Clover_1', 'clover'],
  ['Clover_2', 'clover'],
  ['Plant_1', 'plant-1'],
  ['Plant_1_Big', 'plant-1'],
  ['Plant_7', 'plant-7'],
  ['Plant_7_Big', 'plant-7'],
  ['Flower_3_Group', 'flower-3'],
  ['Flower_3_Single', 'flower-3'],
  ['Flower_4_Group', 'flower-4'],
  ['Flower_4_Single', 'flower-4'],
  ...[1, 2, 3, 4, 5].map((n) => [`Petal_${n}`, 'petal']),
  ['Mushroom_Common', 'mushroom'],
  ['Mushroom_Laetiporus', 'mushroom'],
  ...[1, 2, 3, 4, 5].map((n) => [`Pebble_Round_${n}`, 'pebble-round']),
  ...[1, 2, 3, 4, 5, 6].map((n) => [`Pebble_Square_${n}`, 'pebble-square']),
]);

function copyIfMissing(src, dest) {
  if (fs.existsSync(dest)) return;
  fs.copyFileSync(src, dest);
}

function migrateGltf(basename) {
  const family = FAMILY_BY_FILE.get(basename);
  if (!family) throw new Error(`No family mapping for ${basename}`);

  const destDir = path.join(ROOT, family);
  fs.mkdirSync(destDir, { recursive: true });

  const gltfName = `${basename}.gltf`;
  const gltfSrc = path.join(SRC, gltfName);
  if (!fs.existsSync(gltfSrc)) throw new Error(`Missing ${gltfSrc}`);

  const gltf = JSON.parse(fs.readFileSync(gltfSrc, 'utf8'));

  for (const buf of gltf.buffers ?? []) {
    if (!buf.uri || buf.uri.startsWith('data:')) continue;
    const src = path.join(SRC, buf.uri);
    copyIfMissing(src, path.join(destDir, buf.uri));
  }
  for (const img of gltf.images ?? []) {
    if (!img.uri || img.uri.startsWith('data:')) continue;
    const src = path.join(SRC, img.uri);
    copyIfMissing(src, path.join(destDir, img.uri));
  }

  fs.renameSync(gltfSrc, path.join(destDir, gltfName));
  console.log(`${gltfName} → ${family}/`);
}

if (!fs.existsSync(SRC)) {
  console.log('No public/models/glTF — already migrated?');
  process.exit(0);
}

const gltfs = fs.readdirSync(SRC).filter((f) => f.endsWith('.gltf'));
for (const f of gltfs) {
  migrateGltf(f.replace(/\.gltf$/, ''));
}

const remaining = fs.readdirSync(SRC);
if (remaining.length > 0) {
  console.warn('Leftover in glTF/:', remaining.join(', '));
  for (const f of remaining) {
    fs.unlinkSync(path.join(SRC, f));
  }
}
fs.rmdirSync(SRC);
console.log('Removed empty public/models/glTF/');
