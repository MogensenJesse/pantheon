#!/usr/bin/env node
/**
 * bake-terrain-atlases.mjs — offline-pack biome maps → play atlases
 *
 * Outputs under public/textures/terrain/atlases/:
 *   color.ktx2 (ETC1S sRGB + mips) / ao.ktx2 (ETC1S linear R + mips)
 *
 * Layout imported from src/world/terrain/atlas/atlasConstants.ts.
 *
 * Each biome folder may contain Poly Haven glTF packs, ambientCG ZIPs, or other PBR sets.
 * Maps are discovered by filename (Color / diff / Roughness / ARM / AO; normals optional leftover).
 * Play shading uses color + AO in `.r`; tangent normal / spec / displacement atlases are not emitted.
 *
 * Requirements: sharp (devDependency), toktx on PATH.
 * Usage: npm run bake:terrain-atlases
 */
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_ATLAS_COLS,
  TERRAIN_ATLAS_GUTTER_PX,
  TERRAIN_ATLAS_ROWS,
  TERRAIN_ATLAS_SLOT_COUNT,
  TERRAIN_ATLAS_SURF_TILE_PX,
  terrainAtlasCellPx,
  terrainAtlasSizePx,
} from '../src/world/terrain/atlas/atlasConstants.ts';
import {
  formatBiomeScanLog,
  scanTerrainBiomeFolder,
} from './lib/scanTerrainBiomeFolder.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const terrainRoot = join(root, 'public', 'textures', 'terrain');
const outDir = join(terrainRoot, 'atlases');
const tmpDir = join(outDir, '_tmp');

const COLS = TERRAIN_ATLAS_COLS;
const SLOT_COUNT = TERRAIN_ATLAS_SLOT_COUNT;
const SURF_TILE = TERRAIN_ATLAS_SURF_TILE_PX;
const GUTTER = TERRAIN_ATLAS_GUTTER_PX;
const BIOME_ORDER = [...TERRAIN_ATLAS_BIOME_KEYS];

const NEUTRAL = {
  color: [128, 128, 128, 255],
  /** Open AO (no occlusion). */
  ao: 255,
};

function atlasCell(tile) {
  return terrainAtlasCellPx(tile, GUTTER);
}

function atlasSize(tile) {
  return terrainAtlasSizePx(tile, GUTTER);
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

/** Vite / AV often lock live atlas KTX2 files — encode into `_tmp` then replace. */
async function replaceFileRobust(srcPath, destPath, { retries = 10, delayMs = 200 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (existsSync(destPath)) {
        try {
          rmSync(destPath, { force: true });
        } catch {
          /* dest may be mapped by the dev server */
        }
      }
      try {
        renameSync(srcPath, destPath);
      } catch {
        copyFileSync(srcPath, destPath);
        rmSync(srcPath, { force: true });
      }
      return;
    } catch (err) {
      lastErr = err;
      if (attempt + 1 < retries) {
        await sleep(delayMs * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

async function encodeKtx2(toktx, destPath, extraArgs, inputPng) {
  const tmpOut = join(tmpDir, `${basename(destPath)}.${process.pid}`);
  try {
    rmSync(tmpOut, { force: true });
  } catch {
    /* ignore */
  }
  runToktx(toktx, [...extraArgs, tmpOut, inputPng]);
  await replaceFileRobust(tmpOut, destPath);
}

/** Windows AV / editor locks on `public/` can reject direct overwrites — temp + retry. */
async function writeFileRobust(filePath, data, { retries = 8, delayMs = 125 } = {}) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = join(dirname(filePath), `.${basename(filePath)}.${process.pid}.tmp`);
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      writeFileSync(tmpPath, data);
      if (existsSync(filePath)) {
        try {
          rmSync(filePath, { force: true });
        } catch {
          /* target may be briefly locked (indexer, dev static server) */
        }
      }
      renameSync(tmpPath, filePath);
      return;
    } catch (err) {
      lastErr = err;
      try {
        rmSync(tmpPath, { force: true });
      } catch {
        /* ignore */
      }
      if (attempt + 1 < retries) {
        await sleep(delayMs * (attempt + 1));
      }
    }
  }
  throw lastErr;
}

function biomeFile(folder, rel) {
  return join(terrainRoot, folder, ...rel.split('/'));
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

function extractChannelR8(rgba, channel) {
  const n = rgba.length / 4;
  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    out[i] = rgba[i * 4 + channel];
  }
  return out;
}

function fillR8(size, value) {
  const out = new Uint8ClampedArray(size * size);
  out.fill(value);
  return out;
}

/** AO in `.r`: ARM uses R, ORM uses G, separate AO map uses R, else open (255). */
async function loadAo(folder, maps) {
  const { orm } = maps;
  if (orm.kind === 'arm') {
    return extractChannelR8(await loadRgba(biomeFile(folder, orm.rel), SURF_TILE), 0);
  }
  if (orm.kind === 'orm') {
    return extractChannelR8(await loadRgba(biomeFile(folder, orm.rel), SURF_TILE), 1);
  }
  if (orm.aoRel) {
    return extractChannelR8(await loadRgba(biomeFile(folder, orm.aoRel), SURF_TILE), 0);
  }
  return fillR8(SURF_TILE, NEUTRAL.ao);
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
  return { buf, size, channels: 4 };
}

function createAtlasBufferR8(tile, fill) {
  const size = atlasSize(tile);
  const buf = new Uint8ClampedArray(size * size);
  buf.fill(fill);
  return { buf, size, channels: 1 };
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

function blitTileR8(atlas, tile, slotIndex, tileR8) {
  const { destX, destY } = slotOrigin(slotIndex, tile);
  const size = atlas.size;
  for (let y = 0; y < tile; y++) {
    const dstRow = (destY + y) * size + destX;
    const srcRow = y * tile;
    atlas.buf.set(tileR8.subarray(srcRow, srcRow + tile), dstRow);
  }
  sealGutterR8(atlas, destX, destY, tile);
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
      setPixel(
        atlas,
        destX + x,
        destY + tile - 1 + i,
        getPixel(atlas, destX + x, destY + tile - 1),
      );
    }
    for (let y = 0; y < tile; y++) {
      setPixel(atlas, destX - i, destY + y, getPixel(atlas, destX, destY + y));
      setPixel(
        atlas,
        destX + tile - 1 + i,
        destY + y,
        getPixel(atlas, destX + tile - 1, destY + y),
      );
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

function getPixelR8(atlas, x, y) {
  return atlas.buf[y * atlas.size + x];
}

function setPixelR8(atlas, x, y, v) {
  atlas.buf[y * atlas.size + x] = v;
}

function sealGutterR8(atlas, destX, destY, tile) {
  if (GUTTER <= 0) return;
  for (let i = 1; i <= GUTTER; i++) {
    for (let x = 0; x < tile; x++) {
      setPixelR8(atlas, destX + x, destY - i, getPixelR8(atlas, destX + x, destY));
      setPixelR8(
        atlas,
        destX + x,
        destY + tile - 1 + i,
        getPixelR8(atlas, destX + x, destY + tile - 1),
      );
    }
    for (let y = 0; y < tile; y++) {
      setPixelR8(atlas, destX - i, destY + y, getPixelR8(atlas, destX, destY + y));
      setPixelR8(
        atlas,
        destX + tile - 1 + i,
        destY + y,
        getPixelR8(atlas, destX + tile - 1, destY + y),
      );
    }
    setPixelR8(atlas, destX - i, destY - i, getPixelR8(atlas, destX, destY));
    setPixelR8(atlas, destX + tile - 1 + i, destY - i, getPixelR8(atlas, destX + tile - 1, destY));
    setPixelR8(atlas, destX - i, destY + tile - 1 + i, getPixelR8(atlas, destX, destY + tile - 1));
    setPixelR8(
      atlas,
      destX + tile - 1 + i,
      destY + tile - 1 + i,
      getPixelR8(atlas, destX + tile - 1, destY + tile - 1),
    );
  }
}

async function writePng(path, atlas) {
  await sharp(Buffer.from(atlas.buf.buffer, atlas.buf.byteOffset, atlas.buf.byteLength), {
    raw: { width: atlas.size, height: atlas.size, channels: atlas.channels ?? 4 },
  })
    .png()
    .toFile(path);
}

async function main() {
  const toktx = resolveToktx();
  console.log(`Using ${toktx}`);
  mkdirSync(outDir, { recursive: true });
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });

  try {
  const colorAtlas = createAtlasBuffer(SURF_TILE, NEUTRAL.color);
  const aoAtlas = createAtlasBufferR8(SURF_TILE, NEUTRAL.ao);

  for (let slot = 0; slot < BIOME_ORDER.length; slot++) {
    const folder = BIOME_ORDER[slot];
    console.log(`\nPacking biome slot ${slot}: ${folder}`);
    const maps = scanTerrainBiomeFolder(join(terrainRoot, folder));
    console.log(formatBiomeScanLog(maps));

    const color = await loadRgba(biomeFile(folder, maps.colorRel), SURF_TILE);
    const ao = await loadAo(folder, maps);

    blitTile(colorAtlas, SURF_TILE, slot, color);
    blitTileR8(aoAtlas, SURF_TILE, slot, ao);
  }

  // Remaining empty slots stay neutral-filled via createAtlasBuffer background.
  for (let slot = BIOME_ORDER.length; slot < SLOT_COUNT; slot++) {
    const tileRgba = new Uint8ClampedArray(SURF_TILE * SURF_TILE * 4);
    for (let i = 0; i < tileRgba.length; i += 4) {
      tileRgba[i] = NEUTRAL.color[0];
      tileRgba[i + 1] = NEUTRAL.color[1];
      tileRgba[i + 2] = NEUTRAL.color[2];
      tileRgba[i + 3] = NEUTRAL.color[3];
    }
    blitTile(colorAtlas, SURF_TILE, slot, tileRgba);
    blitTileR8(aoAtlas, SURF_TILE, slot, fillR8(SURF_TILE, NEUTRAL.ao));
  }

  console.log('\nWriting intermediate PNGs…');
  const colorPng = join(tmpDir, 'color.png');
  const aoPng = join(tmpDir, 'ao.png');
  await writePng(colorPng, colorAtlas);
  await writePng(aoPng, aoAtlas);

  console.log('\nEncoding KTX2…');
  await encodeKtx2(
    toktx,
    join(outDir, 'color.ktx2'),
    ['--t2', '--encode', 'etc1s', '--qlevel', '128', '--assign_oetf', 'srgb', '--genmipmap', '--filter', 'lanczos4'],
    colorPng,
  );
  await encodeKtx2(
    toktx,
    join(outDir, 'ao.ktx2'),
    [
      '--t2',
      '--encode',
      'etc1s',
      '--qlevel',
      '128',
      '--assign_oetf',
      'linear',
      '--target_type',
      'R',
      '--genmipmap',
      '--filter',
      'lanczos4',
    ],
    aoPng,
  );

  const staleOrm = join(outDir, 'orm.ktx2');
  if (existsSync(staleOrm)) {
    rmSync(staleOrm, { force: true });
  }

  await writeFileRobust(
    join(outDir, 'bake-meta.json'),
    JSON.stringify(
      {
        surfTile: SURF_TILE,
        gutter: GUTTER,
        cols: COLS,
        rows: TERRAIN_ATLAS_ROWS,
        biomes: BIOME_ORDER,
        aoChannel: 'r',
        bakedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log('\nDone. Play loads color.ktx2 + ao.ktx2 from public/textures/terrain/atlases/.');
  console.log(`Files: ${readdirSync(outDir).join(', ')}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
