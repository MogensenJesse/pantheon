#!/usr/bin/env node
/**
 * bake-terrain-atlases.mjs — offline-pack biome maps → play atlases
 *
 * Reads assets-src/terrain/{biome}/ (never shipped). Outputs under public/textures/terrain/:
 *   atlases/color.ktx2 (ETC1S sRGB + mips) / atlases/ao.ktx2 (ETC1S linear R + mips)
 *   thumbs/{biome}.jpg (editor biome browser)
 *
 * Layout imported from src/world/terrain/atlas/atlasConstants.ts.
 *
 * Each biome folder may contain Poly Haven, ambientCG or other PBR sets. Maps are discovered by
 * filename (Color / diff / albedo, ARM / ORM / AO; roughness, normals and the like are ignored).
 * Play shading uses color + AO in `.r`; nothing else is baked.
 *
 * Requirements: sharp (devDependency), toktx on PATH.
 * Usage: npm run bake:terrain-atlases
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_ATLAS_COLS,
  TERRAIN_ATLAS_GUTTER_PX,
  TERRAIN_ATLAS_SLOT_COUNT,
  TERRAIN_ATLAS_SURF_TILE_PX,
  terrainAtlasCellPx,
  terrainAtlasSizePx,
} from '../src/world/terrain/atlas/atlasConstants.ts';
import { resolveToktx, runToktx } from './lib/ktxEncoder.mjs';
import { formatBiomeScanLog, scanTerrainBiomeFolder } from './lib/scanTerrainBiomeFolder.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/** PBR source sets, one folder per biome (kept out of public/ so they never ship). */
const terrainRoot = join(root, 'assets-src', 'terrain');
const terrainOut = join(root, 'public', 'textures', 'terrain');
const outDir = join(terrainOut, 'atlases');
const thumbDir = join(terrainOut, 'thumbs');
const THUMB_PX = 128;
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
  runToktx(toktx, [...extraArgs, tmpOut, inputPng], { echo: true });
  await replaceFileRobust(tmpOut, destPath);
}

function biomeFile(folder, rel) {
  return join(terrainRoot, folder, ...rel.split('/'));
}

/** Small editor thumbnail of a biome's color map. */
async function writeThumb(folder, maps) {
  mkdirSync(thumbDir, { recursive: true });
  await sharp(biomeFile(folder, maps.colorRel))
    .resize(THUMB_PX, THUMB_PX, { fit: 'cover' })
    .jpeg({ quality: 82 })
    .toFile(join(thumbDir, `${folder}.jpg`));
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

/** AO in `.r`: packed ARM and ORM both keep occlusion in R (roughness G, metalness B); a separate AO map uses R; else open (255). */
async function loadAo(folder, maps) {
  const { orm } = maps;
  if (orm.kind === 'arm' || orm.kind === 'orm') {
    return extractChannelR8(await loadRgba(biomeFile(folder, orm.rel), SURF_TILE), 0);
  }
  if (orm.aoRel) {
    return extractChannelR8(await loadRgba(biomeFile(folder, orm.aoRel), SURF_TILE), 0);
  }
  return fillR8(SURF_TILE, NEUTRAL.ao);
}

/** Atlas of `channels` interleaved bytes per pixel, every pixel set to `fill` (one value per channel). */
function createAtlas(tile, channels, fill) {
  const size = atlasSize(tile);
  const buf = new Uint8ClampedArray(size * size * channels);
  for (let i = 0; i < buf.length; i += channels) buf.set(fill, i);
  return { buf, size, channels };
}

function blitTile(atlas, tile, slotIndex, tilePixels) {
  const { destX, destY } = slotOrigin(slotIndex, tile);
  const { size, channels } = atlas;
  const rowBytes = tile * channels;
  for (let y = 0; y < tile; y++) {
    const dstRow = ((destY + y) * size + destX) * channels;
    atlas.buf.set(tilePixels.subarray(y * rowBytes, (y + 1) * rowBytes), dstRow);
  }
  sealGutter(atlas, destX, destY, tile);
}

function copyPixel(atlas, fromX, fromY, toX, toY) {
  const { buf, size, channels } = atlas;
  const from = (fromY * size + fromX) * channels;
  buf.copyWithin((toY * size + toX) * channels, from, from + channels);
}

/** Extrude the tile's edge pixels into the gutter so mip chains stay inside the slot. */
function sealGutter(atlas, destX, destY, tile) {
  const last = tile - 1;
  for (let i = 1; i <= GUTTER; i++) {
    for (let x = 0; x < tile; x++) {
      copyPixel(atlas, destX + x, destY, destX + x, destY - i);
      copyPixel(atlas, destX + x, destY + last, destX + x, destY + last + i);
    }
    for (let y = 0; y < tile; y++) {
      copyPixel(atlas, destX, destY + y, destX - i, destY + y);
      copyPixel(atlas, destX + last, destY + y, destX + last + i, destY + y);
    }
    copyPixel(atlas, destX, destY, destX - i, destY - i);
    copyPixel(atlas, destX + last, destY, destX + last + i, destY - i);
    copyPixel(atlas, destX, destY + last, destX - i, destY + last + i);
    copyPixel(atlas, destX + last, destY + last, destX + last + i, destY + last + i);
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
    const colorAtlas = createAtlas(SURF_TILE, 4, NEUTRAL.color);
    const aoAtlas = createAtlas(SURF_TILE, 1, [NEUTRAL.ao]);

    for (let slot = 0; slot < BIOME_ORDER.length; slot++) {
      const folder = BIOME_ORDER[slot];
      console.log(`\nPacking biome slot ${slot}: ${folder}`);
      const maps = scanTerrainBiomeFolder(join(terrainRoot, folder));
      console.log(formatBiomeScanLog(maps));

      const color = await loadRgba(biomeFile(folder, maps.colorRel), SURF_TILE);
      const ao = await loadAo(folder, maps);
      await writeThumb(folder, maps);

      blitTile(colorAtlas, SURF_TILE, slot, color);
      blitTile(aoAtlas, SURF_TILE, slot, ao);
    }

    if (BIOME_ORDER.length !== SLOT_COUNT) {
      throw new Error(`${BIOME_ORDER.length} biomes for ${SLOT_COUNT} atlas slots`);
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
      [
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
      ],
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
