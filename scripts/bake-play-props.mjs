#!/usr/bin/env node
/**
 * bake-play-props.mjs — in-place play prop bake: KTX2 textures → self-contained .glb
 *
 * Walks every .gltf under public/models/, writes a sibling .glb with:
 *   - ETC1S `baseColorTexture` (albedo + foliage alpha)
 *   - UASTC normal / occlusion / metallicRoughness
 *   - `KHR_texture_basisu` required (no PNG/JPEG fallback)
 *
 * Does **not** emit LOD names (see `scripts/optimize-assets.cjs` for that lab tool).
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

const MAX_TEXTURE_SIZE = 2048;
const ETC1S_QUALITY = 128;
const ENCODE_JOBS = 8;
const UASTC_LEVEL = '2';

const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function parseArgs(argv) {
  const opts = { one: null, keepSources: false, cleanOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--keep-sources') opts.keepSources = true;
    else if (a === '--clean-only') opts.cleanOnly = true;
    else if (a === '--one') opts.one = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/bake-play-props.mjs [--one <gltf>] [--keep-sources] [--clean-only]`);
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

function bakeOne(gltfPath) {
  const outGlb = outGlbPath(gltfPath);
  const rel = relative(root, gltfPath);
  const tmp = mkdtempSync(join(tmpdir(), 'pantheon-prop-'));
  try {
    const welded = join(tmp, 'welded.glb');
    const pruned = join(tmp, 'pruned.glb');
    const resized = join(tmp, 'resized.glb');
    const etc1s = join(tmp, 'etc1s.glb');
    const uastc = join(tmp, 'uastc.glb');

    console.log(`\n=== ${rel} ===`);
    const srcBytes = statSync(gltfPath).size;
    // Folder size hint (gltf alone is tiny; textures dominate)
    console.log(`  source entry ${mb(srcBytes)} MB (gltf json only)`);

    runGltfTransform(['weld', gltfPath, welded], 'weld');
    runGltfTransform(['prune', welded, pruned], 'prune');
    runGltfTransform(
      [
        'resize',
        pruned,
        resized,
        '--width',
        String(MAX_TEXTURE_SIZE),
        '--height',
        String(MAX_TEXTURE_SIZE),
      ],
      'resize',
    );
    runGltfTransform(
      [
        'etc1s',
        resized,
        etc1s,
        '--slots',
        'baseColorTexture',
        '--quality',
        String(ETC1S_QUALITY),
        '--jobs',
        String(ENCODE_JOBS),
      ],
      'etc1s',
    );
    runGltfTransform(
      [
        'uastc',
        etc1s,
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
      'uastc',
    );

    const staging = `${outGlb}.tmp`;
    copyFileSync(uastc, staging);
    if (existsSync(outGlb)) unlinkSync(outGlb);
    renameSync(staging, outGlb);

    console.log(`  → ${relative(root, outGlb)} (${mb(statSync(outGlb).size)} MB)`);
    return outGlb;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function cleanSidecarsForGlb(glbPath) {
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

  let gltfs;
  if (opts.one) {
    const one = resolve(root, opts.one);
    if (!existsSync(one)) throw new Error(`Not found: ${one}`);
    gltfs = [one];
  } else {
    gltfs = collectGltfs(modelsRoot).sort();
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

  if (gltfs.length === 0) {
    console.log('No .gltf files found under public/models (already baked?).');
    return;
  }

  console.log(`Baking ${gltfs.length} glTF(s) → GLB + KTX2 (mixed ETC1S/UASTC)…`);
  mkdirSync(modelsRoot, { recursive: true });

  const baked = [];
  for (const gltf of gltfs) {
    baked.push(bakeOne(gltf));
  }

  if (!opts.keepSources) {
    console.log('\nRemoving PNG/JPEG/.bin/.gltf sidecars…');
    // Clean after all bakes so shared family textures stay until every glTF in the folder is done.
    for (const glb of baked) cleanSidecarsForGlb(glb);
  } else {
    console.log('\nKept sources (--keep-sources).');
  }

  console.log('\nDone. Update assetManifest paths to .glb if you have not already.');
}

main();
