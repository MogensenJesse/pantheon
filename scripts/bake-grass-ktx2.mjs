#!/usr/bin/env node
/**
 * bake-grass-ktx2.mjs — convert grass PNGs to KTX2 (UASTC) for play runtime.
 *
 * Requires: KTX-Software `toktx` on PATH (https://github.com/KhronosGroup/KTX-Software).
 *
 * Outputs (no PNG fallback in play):
 *   public/textures/grass/noise-atlas.ktx2  — linear data atlas
 *   public/textures/grass/edelweiss.ktx2    — sRGB alpha-cutout sprite
 *
 * Usage: node scripts/bake-grass-ktx2.mjs
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const grassDir = join(root, 'public', 'textures', 'grass');

const jobs = [
  {
    infile: join(grassDir, 'noise-atlas.png'),
    outfile: join(grassDir, 'noise-atlas.ktx2'),
    // Linear data channels (wind/jitter) — no mips (runtime LinearFilter only).
    args: [
      '--t2',
      '--encode',
      'uastc',
      '--uastc_quality',
      '2',
      '--assign_oetf',
      'linear',
      '--zcmp',
      '18',
    ],
  },
  {
    infile: join(grassDir, 'edelweiss.png'),
    outfile: join(grassDir, 'edelweiss.ktx2'),
    // sRGB albedo + alpha cutout — no mips (configureAlphaCutoutTexture).
    args: [
      '--t2',
      '--encode',
      'uastc',
      '--uastc_quality',
      '2',
      '--assign_oetf',
      'srgb',
      '--zcmp',
      '18',
    ],
  },
];

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
  const result = spawnSync(toktx, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`toktx failed (exit ${result.status}): toktx ${args.join(' ')}`);
  }
}

const toktx = resolveToktx();
console.log(`Using ${toktx}`);

for (const job of jobs) {
  if (!existsSync(job.infile)) {
    throw new Error(`Missing source PNG: ${job.infile}`);
  }
  console.log(`Encoding ${job.infile} → ${job.outfile}`);
  runToktx(toktx, [...job.args, job.outfile, job.infile]);
  if (!existsSync(job.outfile)) {
    throw new Error(`toktx did not write ${job.outfile}`);
  }
}

console.log('Done. Play loaders expect .ktx2 only — delete the PNGs after verifying in-game.');
