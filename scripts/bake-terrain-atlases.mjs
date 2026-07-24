#!/usr/bin/env node
/**
 * bake-terrain-atlases.mjs — offline-pack Poly Haven biome maps → play atlases
 *
 * Outputs under public/textures/terrain/atlases/:
 *   color.ktx2 / normal.ktx2 / orm.ktx2 / spec.ktx2  (KTX2, mips)
 *   detailDisplacement.r8                            (raw R8 for CPU+GPU)
 *
 * Layout matches src/world/terrain/atlas/atlasConstants.ts (3×3, 2048 surf / 1024 disp, 8px gutter).
 *
 * Requirements: sharp (devDependency), toktx on PATH.
 * Usage: node scripts/bake-terrain-atlases.mjs
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const terrainRoot = join(root, 'public', 'textures', 'terrain');
const outDir = join(terrainRoot, 'atlases');
const tmpDir = join(outDir, '_tmp');

// Keep in sync with atlasConstants.ts + terrainTextureManifest.ts
const COLS = 3;
const ROWS = 3;
const SLOT_COUNT = COLS * ROWS;
const SURF_TILE = 2048;
const DISP_TILE = 1024;
const GUTTER = 8;
const BIOME_ORDER = ['shore', 'forest', 'hills', 'mountain', 'path', 'meadow', 'snow'];
const SKIP_DISP = new Set(['meadow']);
const GLTF_PACKS = {
  shore: 'sand_03_2k.gltf',
  forest: 'forrest_ground_01_2k.gltf',
  hills: 'aerial_rocks_02_2k.gltf',
  mountain: 'rock_face_03_2k.gltf',
  path: 'grassy_cobblestone_2k.gltf',
  meadow: 'rocky_terrain_02_2k.gltf',
  snow: 'snow_02_2k.gltf',
};

const NEUTRAL = {
  color: [128, 128, 128, 255],
  normal: [128, 128, 255, 255],
  orm: [128, 255, 0, 255],
  spec: [255, 255, 255, 255],
  disp: [0, 0, 0, 255],
};

function atlasCell(tile) {
  return tile + GUTTER * 2;
}

function atlasSize(tile) {
  return atlasCell(tile) * COLS;
}

function slotOrigin(slotIndex, tile) {
  const col = slotIndex % COLS;
  const row = Math.floor(slotIndex / COLS);
  const cell = atlasCell(tile);
  return { destX: col * cell + GUTTER, destY: row * cell + GUTTER };
}

function resolveToktx() {
  const which = spawnSync(process.platform === 'win32' ? 'where.exe' : 'which', ['toktx'], {
    encoding: 'utf8',
  });
  const line = which.stdout?.trim().split(/\r?\n/)[0];
  if (line && existsSync(line)) return line;
  const fallback = 'C:\\Program Files\\KTX-Software\\bin\\toktx.exe';
  if (existsSync(fallback)) return fallback;
  throw new Error('toktx not found on PATH (install KTX-Software)');
}

function runToktx(toktx, args) {
  console.log(`  $ toktx ${args.join(' ')}`);
  const result = spawnSync(toktx, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`toktx failed (exit ${result.status})`);
  }
}

function publicUrlToDisk(url) {
  // /textures/terrain/shore/foo.jpg → public/textures/terrain/shore/foo.jpg
  const pathPart = url.replace(/^\//, '').split('/').map(decodeURIComponent).join('/');
  return join(root, 'public', pathPart);
}

function parseGltfPack(folder) {
  const gltfPath = join(terrainRoot, folder, GLTF_PACKS[folder]);
  if (!existsSync(gltfPath)) throw new Error(`Missing glTF pack: ${gltfPath}`);
  const rootJson = JSON.parse(readFileSync(gltfPath, 'utf8'));
  const material = rootJson.materials?.[0];
  if (!material) throw new Error(`No material in ${gltfPath}`);

  const imageUri = (texIndex) => {
    if (texIndex === undefined) return null;
    const source = rootJson.textures?.[texIndex]?.source;
    if (source === undefined) return null;
    const uri = rootJson.images?.[source]?.uri;
    if (!uri) return null;
    const normalized = uri.replace(/^\.\//, '');
    return `/textures/terrain/${folder}/${normalized}`;
  };

  const pbr = material.pbrMetallicRoughness;
  const colorUrl = imageUri(pbr?.baseColorTexture?.index);
  const normalUrl = imageUri(material.normalTexture?.index);
  const mrUrl = imageUri(pbr?.metallicRoughnessTexture?.index);
  const specIndex = material.extensions?.KHR_materials_specular?.specularTexture?.index;
  const specUrl = imageUri(specIndex);
  if (!colorUrl || !normalUrl || !mrUrl) {
    throw new Error(`Pack ${folder} missing required textures`);
  }
  const mrKind = mrUrl.toLowerCase().includes('_arm_') ? 'arm' : 'rough';
  return { colorUrl, normalUrl, mrUrl, mrKind, specUrl };
}

function deriveMaterialPrefix(colorUrl) {
  const match = colorUrl.match(/([^/]+)_(?:diff|diffuse)_(?:1k|2k)\.(?:jpg|jpeg|png)$/i);
  return match?.[1] ?? null;
}

function displacementCandidates(folder, colorUrl) {
  const prefix = deriveMaterialPrefix(colorUrl);
  if (!prefix) return [];
  const base = join(terrainRoot, folder, 'textures', prefix);
  const urls = [];
  for (const suffix of ['disp', 'displacement']) {
    for (const res of ['1k', '2k']) {
      for (const ext of ['jpg', 'png', 'exr']) {
        urls.push(`${base}_${suffix}_${res}.${ext}`);
      }
    }
  }
  return urls;
}

async function loadRgba(path, size) {
  const { data, info } = await sharp(path)
    .resize(size, size, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.width !== size || info.height !== size) {
    throw new Error(`Unexpected size for ${path}: ${info.width}x${info.height}`);
  }
  return new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
}

function packOrm(mrRgba, mrKind) {
  const out = new Uint8ClampedArray(mrRgba.length);
  for (let i = 0; i < mrRgba.length; i += 4) {
    if (mrKind === 'arm') {
      // ARM: R=AO G=rough B=metal → ORM R=rough G=AO B=metal
      out[i] = mrRgba[i + 1];
      out[i + 1] = mrRgba[i];
      out[i + 2] = mrRgba[i + 2];
    } else {
      // rough MR: G=rough → R=rough G=AO(1) B=metal(0)
      out[i] = mrRgba[i + 1];
      out[i + 1] = 255;
      out[i + 2] = 0;
    }
    out[i + 3] = 255;
  }
  return out;
}

function createAtlasBuffer(tile, fillRgba) {
  const size = atlasSize(tile);
  const buf = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = fillRgba[0];
    buf[i + 1] = fillRgba[1];
    buf[i + 2] = fillRgba[2];
    buf[i + 3] = fillRgba[3];
  }
  return { buf, size };
}

function blitTile(atlas, tile, slotIndex, tileRgba) {
  const { destX, destY } = slotOrigin(slotIndex, tile);
  const size = atlas.size;
  const src = tileRgba;
  for (let y = 0; y < tile; y++) {
    const dstRow = ((destY + y) * size + destX) * 4;
    const srcRow = y * tile * 4;
    atlas.buf.set(src.subarray(srcRow, srcRow + tile * 4), dstRow);
  }
  sealGutter(atlas, destX, destY, tile);
}

function getPixel(atlas, x, y) {
  const o = (y * atlas.size + x) * 4;
  return [atlas.buf[o], atlas.buf[o + 1], atlas.buf[o + 2], atlas.buf[o + 3]];
}

function setPixel(atlas, x, y, rgba) {
  const o = (y * atlas.size + x) * 4;
  atlas.buf[o] = rgba[0];
  atlas.buf[o + 1] = rgba[1];
  atlas.buf[o + 2] = rgba[2];
  atlas.buf[o + 3] = rgba[3];
}

function sealGutter(atlas, destX, destY, tile) {
  if (GUTTER <= 0) return;
  for (let i = 1; i <= GUTTER; i++) {
    for (let x = 0; x < tile; x++) {
      setPixel(atlas, destX + x, destY - i, getPixel(atlas, destX + x, destY));
      setPixel(atlas, destX + x, destY + tile - 1 + i, getPixel(atlas, destX + x, destY + tile - 1));
    }
    for (let y = 0; y < tile; y++) {
      setPixel(atlas, destX - i, destY + y, getPixel(atlas, destX, destY + y));
      setPixel(atlas, destX + tile - 1 + i, destY + y, getPixel(atlas, destX + tile - 1, destY + y));
    }
    setPixel(atlas, destX - i, destY - i, getPixel(atlas, destX, destY));
    setPixel(atlas, destX + tile - 1 + i, destY - i, getPixel(atlas, destX + tile - 1, destY));
    setPixel(atlas, destX - i, destY + tile - 1 + i, getPixel(atlas, destX, destY + tile - 1));
    setPixel(
      atlas,
      destX + tile - 1 + i,
      destY + tile - 1 + i,
      getPixel(atlas, destX + tile - 1, destY + tile - 1),
    );
  }
}

async function writePng(path, atlas) {
  await sharp(Buffer.from(atlas.buf.buffer, atlas.buf.byteOffset, atlas.buf.byteLength), {
    raw: { width: atlas.size, height: atlas.size, channels: 4 },
  })
    .png()
    .toFile(path);
}

function atlasToR8(atlas) {
  const r8 = new Uint8Array(atlas.size * atlas.size);
  for (let i = 0; i < r8.length; i++) {
    r8[i] = atlas.buf[i * 4];
  }
  return r8;
}

async function main() {
  const toktx = resolveToktx();
  console.log(`Using ${toktx}`);
  mkdirSync(outDir, { recursive: true });
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  const colorAtlas = createAtlasBuffer(SURF_TILE, NEUTRAL.color);
  const normalAtlas = createAtlasBuffer(SURF_TILE, NEUTRAL.normal);
  const ormAtlas = createAtlasBuffer(SURF_TILE, NEUTRAL.orm);
  const specAtlas = createAtlasBuffer(SURF_TILE, NEUTRAL.spec);
  const dispAtlas = createAtlasBuffer(DISP_TILE, NEUTRAL.disp);

  let hasRealDisp = false;

  for (let slot = 0; slot < BIOME_ORDER.length; slot++) {
    const folder = BIOME_ORDER[slot];
    console.log(`\nPacking biome slot ${slot}: ${folder}`);
    const pack = parseGltfPack(folder);

    const color = await loadRgba(publicUrlToDisk(pack.colorUrl), SURF_TILE);
    const normal = await loadRgba(publicUrlToDisk(pack.normalUrl), SURF_TILE);
    const mr = await loadRgba(publicUrlToDisk(pack.mrUrl), SURF_TILE);
    const orm = packOrm(mr, pack.mrKind);
    const spec = pack.specUrl
      ? await loadRgba(publicUrlToDisk(pack.specUrl), SURF_TILE)
      : (() => {
          const n = new Uint8ClampedArray(SURF_TILE * SURF_TILE * 4);
          n.fill(255);
          return n;
        })();

    blitTile(colorAtlas, SURF_TILE, slot, color);
    blitTile(normalAtlas, SURF_TILE, slot, normal);
    blitTile(ormAtlas, SURF_TILE, slot, orm);
    blitTile(specAtlas, SURF_TILE, slot, spec);

    if (!SKIP_DISP.has(folder)) {
      let dispPath = null;
      for (const candidate of displacementCandidates(folder, pack.colorUrl)) {
        if (existsSync(candidate) && !candidate.endsWith('.exr')) {
          dispPath = candidate;
          break;
        }
      }
      if (dispPath) {
        console.log(`  disp: ${dispPath}`);
        const disp = await loadRgba(dispPath, DISP_TILE);
        blitTile(dispAtlas, DISP_TILE, slot, disp);
        hasRealDisp = true;
      } else {
        console.log('  disp: none (neutral)');
      }
    } else {
      console.log('  disp: skipped biome');
    }
  }

  // Empty slots 7–8 already neutral-filled via createAtlasBuffer background;
  // still seal gutters for consistency by blitting nothing — fillRect already set.
  // Explicitly seal empty slots with solid fill + gutter:
  for (let slot = BIOME_ORDER.length; slot < SLOT_COUNT; slot++) {
    const fill = (atlas, tile, rgba) => {
      const tileRgba = new Uint8ClampedArray(tile * tile * 4);
      for (let i = 0; i < tileRgba.length; i += 4) {
        tileRgba[i] = rgba[0];
        tileRgba[i + 1] = rgba[1];
        tileRgba[i + 2] = rgba[2];
        tileRgba[i + 3] = rgba[3];
      }
      blitTile(atlas, tile, slot, tileRgba);
    };
    fill(colorAtlas, SURF_TILE, NEUTRAL.color);
    fill(normalAtlas, SURF_TILE, NEUTRAL.normal);
    fill(ormAtlas, SURF_TILE, NEUTRAL.orm);
    fill(specAtlas, SURF_TILE, NEUTRAL.spec);
    fill(dispAtlas, DISP_TILE, NEUTRAL.disp);
  }

  console.log('\nWriting intermediate PNGs…');
  const colorPng = join(tmpDir, 'color.png');
  const normalPng = join(tmpDir, 'normal.png');
  const ormPng = join(tmpDir, 'orm.png');
  const specPng = join(tmpDir, 'spec.png');
  await writePng(colorPng, colorAtlas);
  await writePng(normalPng, normalAtlas);
  await writePng(ormPng, ormAtlas);
  await writePng(specPng, specAtlas);

  const r8Path = join(outDir, 'detailDisplacement.r8');
  writeFileSync(r8Path, atlasToR8(dispAtlas));
  console.log(`Wrote ${r8Path} (${dispAtlas.size}×${dispAtlas.size} R8)`);

  console.log('\nEncoding KTX2…');
  runToktx(toktx, [
    '--t2',
    '--encode',
    'etc1s',
    '--qlevel',
    '128',
    '--assign_oetf',
    'srgb',
    '--genmipmap',
    '--filter',
    'lanczos4',
    join(outDir, 'color.ktx2'),
    colorPng,
  ]);
  for (const [name, png] of [
    ['normal', normalPng],
    ['orm', ormPng],
    ['spec', specPng],
  ]) {
    runToktx(toktx, [
      '--t2',
      '--encode',
      'uastc',
      '--uastc_quality',
      '2',
      '--assign_oetf',
      'linear',
      '--zcmp',
      '18',
      '--genmipmap',
      '--filter',
      'lanczos4',
      join(outDir, `${name}.ktx2`),
      png,
    ]);
  }

  writeFileSync(
    join(outDir, 'bake-meta.json'),
    JSON.stringify(
      {
        surfTile: SURF_TILE,
        dispTile: DISP_TILE,
        gutter: GUTTER,
        cols: COLS,
        rows: ROWS,
        biomes: BIOME_ORDER,
        hasDisplacementMaps: hasRealDisp,
        bakedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  rmSync(tmpDir, { recursive: true, force: true });
  console.log('\nDone. Play loads from public/textures/terrain/atlases/.');
  console.log(`Files: ${readdirSync(outDir).join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
