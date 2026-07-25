#!/usr/bin/env node
/**
 * bake-play-props.mjs — in-place play prop bake: KTX2 textures + LOD chain
 *
 * Walks every .gltf under public/models/, writes sibling GLBs with:
 *   - ETC1S `baseColorTexture` (albedo + foliage alpha)
 *   - UASTC normal / occlusion / metallicRoughness
 *   - `KHR_texture_basisu` required (no PNG/JPEG fallback)
 *   - LOD chain: canonical `.glb` (lod0) + `_lod1.glb` + `_lod2.glb`
 *
 * Geometry stays uncompressed (Draco/Meshopt optional later).
 *
 * Requirements:
 *   - `toktx` on PATH (KTX-Software)
 *   - `@gltf-transform/cli` via npx
 *
 * Usage:
 *   node scripts/bake-play-props.mjs
 *   node scripts/bake-play-props.mjs --one public/models/fern/Fern_1.gltf
 *   node scripts/bake-play-props.mjs --keep-sources   # leave .gltf/.bin/.png after bake
 *   node scripts/bake-play-props.mjs --clean-only     # delete sidecars when .glb already exists
 *   node scripts/bake-play-props.mjs --no-lod         # lod0 only (skip simplify variants)
 *   node scripts/bake-play-props.mjs --from-glb       # emit _lod1/_lod2 from existing lod0 .glb (no sources)
 */
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modelsRoot = join(root, 'public', 'models');

const ETC1S_QUALITY = 128;
const ENCODE_JOBS = 8;
const UASTC_LEVEL = '2';

/**
 * lod0 = canonical basename.glb; lod1/2 = basename_lodN.glb
 *
 * Texture size is the real disk/VRAM win (Nature props are texture-heavy).
 * Geometry: --error 1 lets meshoptimizer reach the ratio when topology allows;
 * leaf-card trees often plateau around ~80–90% tris regardless (seam-locked).
 */
const LOD_LEVELS = [
  { lod: 0, ratio: 1.0, error: 0.0005, maxTexture: 2048 },
  { lod: 1, ratio: 0.35, error: 1, maxTexture: 1024 },
  { lod: 2, ratio: 0.1, error: 1, maxTexture: 512 },
];

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function parseArgs(argv) {
  const opts = { one: null, keepSources: false, cleanOnly: false, noLod: false, fromGlb: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--keep-sources') opts.keepSources = true;
    else if (a === '--clean-only') opts.cleanOnly = true;
    else if (a === '--no-lod') opts.noLod = true;
    else if (a === '--from-glb') opts.fromGlb = true;
    else if (a === '--one') opts.one = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(
        `Usage: node scripts/bake-play-props.mjs [--one <gltf|glb>] [--keep-sources] [--clean-only] [--no-lod] [--from-glb]`,
      );
      process.exit(0);
    }
  }
  return opts;
}

function collectGltfs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collectGltfs(full, out);
    else if (/\.gltf$/i.test(name)) out.push(full);
  }
  return out;
}

/** Canonical lod0 GLBs only (skip *_lod1 / *_lod2 siblings). */
function collectLod0Glbs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collectLod0Glbs(full, out);
    else if (/\.glb$/i.test(name) && !/_lod[12]\.glb$/i.test(name)) out.push(full);
  }
  return out;
}

function mb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function runGltfTransform(args, label) {
  console.log(`  $ gltf-transform ${args.join(' ')}`);
  try {
    execFileSync(NPX, ['--yes', '@gltf-transform/cli', ...args], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } catch (err) {
    throw new Error(`Step failed (${label}): ${err.message}`);
  }
}

function outGlbPath(gltfPath) {
  return gltfPath.replace(/\.gltf$/i, '.glb');
}

function lodOutPath(canonicalGlb, lod) {
  if (lod === 0) return canonicalGlb;
  return canonicalGlb.replace(/\.glb$/i, `_lod${lod}.glb`);
}

function writeGlbAtomic(srcPath, destPath) {
  const staging = `${destPath}.tmp`;
  copyFileSync(srcPath, staging);
  if (existsSync(destPath)) unlinkSync(destPath);
  renameSync(staging, destPath);
}

/** resize (PNG/JPEG only) → etc1s baseColor → uastc normals/ORM. */
function compressTextures(current, tmp, tag, maxTexture) {
  const resized = join(tmp, `${tag}-resized.glb`);
  runGltfTransform(
    [
      'resize',
      current,
      resized,
      '--width',
      String(maxTexture),
      '--height',
      String(maxTexture),
    ],
    `${tag} resize ${maxTexture}`,
  );
  current = resized;

  const etc1s = join(tmp, `${tag}-etc1s.glb`);
  runGltfTransform(
    [
      'etc1s',
      current,
      etc1s,
      '--slots',
      'baseColorTexture',
      '--quality',
      String(ETC1S_QUALITY),
      '--jobs',
      String(ENCODE_JOBS),
    ],
    `${tag} etc1s`,
  );
  current = etc1s;

  const uastc = join(tmp, `${tag}-uastc.glb`);
  runGltfTransform(
    [
      'uastc',
      current,
      uastc,
      '--slots',
      '{normalTexture,occlusionTexture,metallicRoughnessTexture}',
      '--level',
      UASTC_LEVEL,
      '--zstd',
      '18',
      '--jobs',
      String(ENCODE_JOBS),
    ],
    `${tag} uastc`,
  );
  return uastc;
}

/**
 * Per LOD from .gltf sources: weld → simplify (lod1/2) → prune → resize → etc1s → uastc.
 */
function bakeLodLevel(gltfPath, tmp, lodLevel) {
  const { lod, ratio, error, maxTexture } = lodLevel;
  const tag = lod === 0 ? 'lod0' : `lod${lod}`;
  let current = gltfPath;

  const welded = join(tmp, `${tag}-welded.glb`);
  runGltfTransform(['weld', current, welded], `${tag} weld`);
  current = welded;

  if (ratio < 1.0) {
    const simplified = join(tmp, `${tag}-simplified.glb`);
    runGltfTransform(
      ['simplify', current, simplified, '--ratio', String(ratio), '--error', String(error)],
      `${tag} simplify`,
    );
    current = simplified;
  }

  const pruned = join(tmp, `${tag}-pruned.glb`);
  runGltfTransform(['prune', current, pruned], `${tag} prune`);
  current = pruned;

  return compressTextures(current, tmp, tag, maxTexture);
}

function bakeOne(gltfPath, { noLod }) {
  const outGlb = outGlbPath(gltfPath);
  const rel = relative(root, gltfPath);
  const tmp = mkdtempSync(join(tmpdir(), 'pantheon-prop-'));
  const levels = noLod ? LOD_LEVELS.filter((l) => l.lod === 0) : LOD_LEVELS;
  const written = [];

  try {
    console.log(`\n=== ${rel} ===`);
    const srcBytes = statSync(gltfPath).size;
    console.log(`  source entry ${mb(srcBytes)} MB (gltf json only)`);

    for (const level of levels) {
      const baked = bakeLodLevel(gltfPath, tmp, level);
      const dest = lodOutPath(outGlb, level.lod);
      writeGlbAtomic(baked, dest);
      written.push(dest);
      console.log(
        `  → ${relative(root, dest)} (${mb(statSync(dest).size)} MB)${level.lod === 0 ? ' [lod0]' : ` [lod${level.lod} ratio=${level.ratio} tex≤${level.maxTexture}]`}`,
      );
    }

    return written;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * From an already-KTX2 lod0 .glb: weld → simplify → prune → ktxdecompress →
 * resize → etc1s/uastc. Texture downscale is the main size/VRAM win.
 */
function bakeLodSiblingsFromGlb(lod0Glb) {
  const rel = relative(root, lod0Glb);
  const tmp = mkdtempSync(join(tmpdir(), 'pantheon-prop-lod-'));
  const written = [];

  try {
    console.log(`\n=== ${rel} (from-glb LOD) ===`);
    console.log(`  lod0 ${mb(statSync(lod0Glb).size)} MB`);

    for (const level of LOD_LEVELS) {
      if (level.lod === 0) continue;
      const tag = `lod${level.lod}`;
      let current = lod0Glb;

      const welded = join(tmp, `${tag}-welded.glb`);
      runGltfTransform(['weld', current, welded], `${tag} weld`);
      current = welded;

      const simplified = join(tmp, `${tag}-simplified.glb`);
      runGltfTransform(
        [
          'simplify',
          current,
          simplified,
          '--ratio',
          String(level.ratio),
          '--error',
          String(level.error),
        ],
        `${tag} simplify`,
      );
      current = simplified;

      const pruned = join(tmp, `${tag}-pruned.glb`);
      runGltfTransform(['prune', current, pruned], `${tag} prune`);
      current = pruned;

      // resize only works on PNG/JPEG — decompress Basis first.
      const decompressed = join(tmp, `${tag}-ktxdecomp.glb`);
      runGltfTransform(['ktxdecompress', current, decompressed], `${tag} ktxdecompress`);
      current = decompressed;

      current = compressTextures(current, tmp, tag, level.maxTexture);

      const dest = lodOutPath(lod0Glb, level.lod);
      writeGlbAtomic(current, dest);
      written.push(dest);
      console.log(
        `  → ${relative(root, dest)} (${mb(statSync(dest).size)} MB) [lod${level.lod} ratio=${level.ratio} tex≤${level.maxTexture}]`,
      );
    }

    return written;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function cleanSidecarsForGlb(glbPath) {
  // Only strip sources for canonical lod0 (not *_lod1 / *_lod2 siblings).
  if (/_lod[12]\.glb$/i.test(glbPath)) return;

  const dir = dirname(glbPath);
  const base = glbPath.replace(/\.glb$/i, '');
  const gltf = `${base}.gltf`;
  const bin = `${base}.bin`;
  for (const p of [gltf, bin]) {
    if (existsSync(p)) {
      unlinkSync(p);
      console.log(`  removed ${relative(root, p)}`);
    }
  }

  // Shared family textures: only delete image sidecars when no .gltf remains in the folder.
  const stillHasGltf = readdirSync(dir).some((n) => /\.gltf$/i.test(n));
  if (stillHasGltf) return;

  for (const name of readdirSync(dir)) {
    if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
    const full = join(dir, name);
    unlinkSync(full);
    console.log(`  removed ${relative(root, full)}`);
  }

  // stone-pack style nested textures/
  const texDir = join(dir, 'textures');
  if (existsSync(texDir) && statSync(texDir).isDirectory()) {
    const nestedGltf = readdirSync(dir).some((n) => /\.gltf$/i.test(n));
    if (!nestedGltf) {
      rmSync(texDir, { recursive: true, force: true });
      console.log(`  removed ${relative(root, texDir)}/`);
    }
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!existsSync(modelsRoot)) {
    throw new Error(`Missing ${modelsRoot}`);
  }

  if (opts.cleanOnly) {
    const glbs = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.glb$/i.test(name)) glbs.push(full);
      }
    };
    walk(modelsRoot);
    console.log(`Cleaning sidecars for ${glbs.length} .glb file(s)…`);
    for (const glb of glbs) cleanSidecarsForGlb(glb);
    console.log('Done.');
    return;
  }

  // --from-glb: emit mid/far LOD siblings from existing KTX2 lod0 GLBs (no .gltf sources needed).
  if (opts.fromGlb) {
    let glbs;
    if (opts.one) {
      const one = resolve(root, opts.one);
      if (!existsSync(one)) throw new Error(`Not found: ${one}`);
      if (!/\.glb$/i.test(one) || /_lod[12]\.glb$/i.test(one)) {
        throw new Error(`--from-glb --one expects a canonical lod0 .glb, got: ${opts.one}`);
      }
      glbs = [one];
    } else {
      glbs = collectLod0Glbs(modelsRoot).sort();
    }
    if (glbs.length === 0) {
      console.log('No lod0 .glb files found under public/models.');
      return;
    }
    console.log(`Generating lod1/lod2 for ${glbs.length} lod0 GLB(s)…`);
    for (const glb of glbs) {
      bakeLodSiblingsFromGlb(glb);
    }
    console.log('\nDone. Canonical .glb unchanged; siblings *_lod1.glb / *_lod2.glb written.');
    return;
  }

  let gltfs;
  if (opts.one) {
    const one = resolve(root, opts.one);
    if (!existsSync(one)) throw new Error(`Not found: ${one}`);
    gltfs = [one];
  } else {
    gltfs = collectGltfs(modelsRoot).sort();
  }

  if (gltfs.length === 0) {
    console.log(
      'No .gltf files found under public/models (already baked?). Use --from-glb to emit LOD siblings from existing .glb files.',
    );
    return;
  }

  const lodNote = opts.noLod ? 'lod0 only (--no-lod)' : 'lod0 + lod1 + lod2';
  console.log(`Baking ${gltfs.length} glTF(s) → GLB + KTX2 (${lodNote})…`);
  mkdirSync(modelsRoot, { recursive: true });

  const bakedCanonical = [];
  for (const gltf of gltfs) {
    const written = bakeOne(gltf, { noLod: opts.noLod });
    // Sidecar cleanup keys off canonical lod0 path.
    const lod0 = written.find((p) => !/_lod[12]\.glb$/i.test(p));
    if (lod0) bakedCanonical.push(lod0);
  }

  if (!opts.keepSources) {
    console.log('\nRemoving PNG/JPEG/.bin/.gltf sidecars…');
    for (const glb of bakedCanonical) cleanSidecarsForGlb(glb);
  } else {
    console.log('\nKept sources (--keep-sources).');
  }

  console.log('\nDone. Canonical .glb = lod0; siblings *_lod1.glb / *_lod2.glb for mid/far.');
}

main();
