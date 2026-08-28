#!/usr/bin/env node
/**
 * bake-terrain-atlases.mjs — offline-pack biome PBR maps → play atlases
 *
 * Outputs under public/textures/terrain/atlases/:
 *   color.ktx2 / normal.ktx2 / orm.ktx2 / spec.ktx2  (KTX2, mips)
 *   detailDisplacement.r8                            (raw R8 for CPU+GPU)
 *
 * Layout matches src/world/terrain/atlas/atlasConstants.ts (3×3, 2048 surf / 1024 disp, 8px gutter).
 *
 * Each biome folder may contain Poly Haven glTF packs, ambientCG ZIPs, or other PBR sets.
 * Maps are discovered by filename (Color / diff / NormalGL / Roughness / ARM / AO / Displacement).
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
  formatBiomeScanLog,
  scanTerrainBiomeFolder,
} from './lib/scanTerrainBiomeFolder.ts';

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
const BIOME_ORDER = ['shore', 'forest', 'hills', 'mountain', 'path', 'meadow', 'snow', 'rock'];
const SKIP_DISP = new Set(['meadow']);

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

function composeOrmSeparate(roughRgba, aoRgba, metalRgba) {
  const out = new Uint8ClampedArray(roughRgba.length);
  for (let i = 0; i < roughRgba.length; i += 4) {
    out[i] = roughRgba[i + 1];
    out[i + 1] = aoRgba ? aoRgba[i] : 255;
    out[i + 2] = metalRgba ? metalRgba[i] : 0;
    out[i + 3] = 255;
  }
  return out;
}

function copyOrm(rgba) {
  const out = new Uint8ClampedArray(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = rgba[i];
    out[i + 1] = rgba[i + 1];
    out[i + 2] = rgba[i + 2];
    out[i + 3] = 255;
  }
  return out;
}

async function loadOrm(folder, maps) {
  const { orm } = maps;
  if (orm.kind === 'arm') {
    return packOrm(await loadRgba(biomeFile(folder, orm.rel), SURF_TILE), 'arm');
  }
  if (orm.kind === 'orm') {
    return copyOrm(await loadRgba(biomeFile(folder, orm.rel), SURF_TILE));
  }
  const rough = await loadRgba(biomeFile(folder, orm.roughnessRel), SURF_TILE);
  const ao = orm.aoRel ? await loadRgba(biomeFile(folder, orm.aoRel), SURF_TILE) : null;
  const metal = orm.metalnessRel
    ? await loadRgba(biomeFile(folder, orm.metalnessRel), SURF_TILE)
    : null;
  return composeOrmSeparate(rough, ao, metal);
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

  try {
  const colorAtlas = createAtlasBuffer(SURF_TILE, NEUTRAL.color);
  const normalAtlas = createAtlasBuffer(SURF_TILE, NEUTRAL.normal);
  const ormAtlas = createAtlasBuffer(SURF_TILE, NEUTRAL.orm);
  const specAtlas = createAtlasBuffer(SURF_TILE, NEUTRAL.spec);
  const dispAtlas = createAtlasBuffer(DISP_TILE, NEUTRAL.disp);

  let hasRealDisp = false;

  for (let slot = 0; slot < BIOME_ORDER.length; slot++) {
    const folder = BIOME_ORDER[slot];
    console.log(`\nPacking biome slot ${slot}: ${folder}`);
    const maps = scanTerrainBiomeFolder(join(terrainRoot, folder));
    console.log(formatBiomeScanLog(maps));

    const color = await loadRgba(biomeFile(folder, maps.colorRel), SURF_TILE);
    const normal = await loadRgba(biomeFile(folder, maps.normalRel), SURF_TILE);
    const orm = await loadOrm(folder, maps);
    const spec = maps.specRel
      ? await loadRgba(biomeFile(folder, maps.specRel), SURF_TILE)
      : (() => {
          const n = new Uint8ClampedArray(SURF_TILE * SURF_TILE * 4);
          n.fill(255);
          return n;
        })();

    blitTile(colorAtlas, SURF_TILE, slot, color);
    blitTile(normalAtlas, SURF_TILE, slot, normal);
    blitTile(ormAtlas, SURF_TILE, slot, orm);
    blitTile(specAtlas, SURF_TILE, slot, spec);

    if (!SKIP_DISP.has(folder) && maps.displacementRel) {
      const dispPath = biomeFile(folder, maps.displacementRel);
      const disp = await loadRgba(dispPath, DISP_TILE);
      blitTile(dispAtlas, DISP_TILE, slot, disp);
      hasRealDisp = true;
    } else if (SKIP_DISP.has(folder)) {
      console.log('  disp: skipped biome');
    } else {
      console.log('  disp: none (neutral)');
    }
  }

  // Remaining empty slots stay neutral-filled via createAtlasBuffer background.
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
  await writeFileRobust(r8Path, atlasToR8(dispAtlas));
  console.log(`Wrote ${r8Path} (${dispAtlas.size}×${dispAtlas.size} R8)`);

  console.log('\nEncoding KTX2…');
  await encodeKtx2(
    toktx,
    join(outDir, 'color.ktx2'),
    ['--t2', '--encode', 'etc1s', '--qlevel', '128', '--assign_oetf', 'srgb', '--genmipmap', '--filter', 'lanczos4'],
    colorPng,
  );
  const linearKtxArgs = [
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
  ];
  for (const [name, png] of [
    ['normal', normalPng],
    ['orm', ormPng],
    ['spec', specPng],
  ]) {
    await encodeKtx2(toktx, join(outDir, `${name}.ktx2`), linearKtxArgs, png);
  }

  await writeFileRobust(
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

  console.log('\nDone. Play loads from public/textures/terrain/atlases/.');
  console.log(`Files: ${readdirSync(outDir).join(', ')}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
