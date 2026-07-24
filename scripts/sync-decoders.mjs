#!/usr/bin/env node
/**
 * sync-decoders.mjs — copy three.js Basis + Draco WASM into public/ for Vite.
 *
 * Sources (installed `three` package):
 *   node_modules/three/examples/jsm/libs/basis/*
 *   node_modules/three/examples/jsm/libs/draco/gltf/*
 *
 * Destinations (served at runtime):
 *   public/basis/          → KTX2Loader.setTranscoderPath('/basis/')
 *   public/draco/gltf/     → DRACOLoader.setDecoderPath('/draco/gltf/')
 *
 * Re-run after upgrading `three` so decoder versions stay aligned.
 *
 * Usage: node scripts/sync-decoders.mjs
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const threeLibs = join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs');

const copies = [
  {
    from: join(threeLibs, 'basis'),
    to: join(root, 'public', 'basis'),
    required: ['basis_transcoder.js', 'basis_transcoder.wasm'],
  },
  {
    from: join(threeLibs, 'draco', 'gltf'),
    to: join(root, 'public', 'draco', 'gltf'),
    required: ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'],
  },
];

function assertRequired(dir, files) {
  for (const name of files) {
    if (!existsSync(join(dir, name))) {
      throw new Error(`Missing ${name} in ${dir}`);
    }
  }
}

for (const { from, to, required } of copies) {
  if (!existsSync(from)) {
    throw new Error(
      `Source not found: ${from}\nInstall dependencies first (npm install) so three ships Basis/Draco.`,
    );
  }
  assertRequired(from, required);

  mkdirSync(dirname(to), { recursive: true });
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });

  const names = readdirSync(to).join(', ');
  console.log(`Synced ${from} → ${to} (${names})`);
}

console.log('Done. Decoders are under public/basis and public/draco/gltf.');
