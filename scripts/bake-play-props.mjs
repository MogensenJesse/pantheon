#!/usr/bin/env node
/**
 * bake-play-props.mjs — CLI entry for in-place play prop bake (KTX2 + LOD chain)
 *
 * Shared pipeline: scripts/lib/playPropBake.mjs
 *
 * Usage:
 *   node scripts/bake-play-props.mjs
 *   node scripts/bake-play-props.mjs --one public/models/fern/Fern_1.gltf
 *   node scripts/bake-play-props.mjs --keep-sources
 *   node scripts/bake-play-props.mjs --clean-only
 *   node scripts/bake-play-props.mjs --no-lod
 *   node scripts/bake-play-props.mjs --from-glb
 */
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  bakeFromGlb,
  bakeLodSiblingsFromGlb,
  bakeOne,
  cleanSidecarsForGlb,
  collectGltfs,
  collectLod0Glbs,
} from './lib/playPropBake.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modelsRoot = join(root, 'public', 'models');

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

  if (opts.one) {
    const one = resolve(root, opts.one);
    if (!existsSync(one)) throw new Error(`Not found: ${one}`);
    if (/\.glb$/i.test(one) && !/_lod[12]\.glb$/i.test(one) && !opts.fromGlb) {
      const written = bakeFromGlb(one, { noLod: opts.noLod });
      if (!opts.keepSources) {
        console.log('\nRemoving PNG/JPEG/.bin/.gltf sidecars…');
        const lod0 = written.find((p) => !/_lod[12]\.glb$/i.test(p));
        if (lod0) cleanSidecarsForGlb(lod0);
      }
      console.log('\nDone. Canonical .glb = lod0; siblings *_lod1.glb / *_lod2.glb for mid/far.');
      return;
    }
  }

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
