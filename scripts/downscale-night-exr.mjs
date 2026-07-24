#!/usr/bin/env node
/**
 * downscale-night-exr.mjs — shrink the night sky EXR for PMREM + equirect background.
 *
 * Source today is 8192×4096 (~87 MB). Three.js PMREM is happiest around 1k–2k
 * equirect; we ship 4096×2048 HalfFloat-compatible EXR (ZIP) in place.
 *
 * Requires: hdrify (devDependency). Re-run if you replace the master EXR.
 *
 * Usage:
 *   node scripts/downscale-night-exr.mjs
 *   node scripts/downscale-night-exr.mjs --width 2048   # optional; height = width/2
 */
import { readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureNonNegativeFinite, readExr, writeExr } from 'hdrify';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(root, 'public', 'textures', 'environment', 'night-sky.exr');
const DEFAULT_WIDTH = 4096;

function parseWidth(argv) {
  const i = argv.indexOf('--width');
  if (i === -1) return DEFAULT_WIDTH;
  const n = Number(argv[i + 1]);
  if (!Number.isFinite(n) || n < 64 || n % 2 !== 0) {
    throw new Error('--width must be an even integer >= 64 (equirect 2:1)');
  }
  return n;
}

/** Integer-factor box filter (best when srcW/dstW and srcH/dstH are integers). */
function downsampleBox(src, dstW, dstH) {
  const { width: srcW, height: srcH, data } = src;
  if (srcW % dstW !== 0 || srcH % dstH !== 0) {
    throw new Error(
      `Source ${srcW}x${srcH} is not an integer multiple of ${dstW}x${dstH}; refuse non-box resize`,
    );
  }
  const sx = srcW / dstW;
  const sy = srcH / dstH;
  const samples = sx * sy;
  const out = new Float32Array(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const x0 = x * sx;
      const y0 = y * sy;
      for (let j = 0; j < sy; j++) {
        for (let i = 0; i < sx; i++) {
          const si = ((y0 + j) * srcW + (x0 + i)) * 4;
          r += data[si];
          g += data[si + 1];
          b += data[si + 2];
          a += data[si + 3];
        }
      }
      const di = (y * dstW + x) * 4;
      out[di] = r / samples;
      out[di + 1] = g / samples;
      out[di + 2] = b / samples;
      out[di + 3] = a / samples;
    }
  }

  return {
    width: dstW,
    height: dstH,
    data: out,
    linearColorSpace: src.linearColorSpace,
  };
}

function mb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

const dstW = parseWidth(process.argv.slice(2));
const dstH = dstW / 2;

console.log(`Reading ${TARGET}…`);
const raw = readFileSync(TARGET);
const src = readExr(new Uint8Array(raw));
ensureNonNegativeFinite(src.data);
console.log(`  source: ${src.width}×${src.height}, ${mb(raw.length)} MB on disk`);

if (src.width === dstW && src.height === dstH) {
  console.log('Already at target resolution — nothing to do.');
  process.exit(0);
}

console.log(`Downsampling → ${dstW}×${dstH} (box filter)…`);
const dst = downsampleBox(src, dstW, dstH);
ensureNonNegativeFinite(dst.data);

// compression: 3 = ZIP (scanline); good size/compat for HalfFloat-like data
const encoded = writeExr(dst, { compression: 3 });
const tmp = `${TARGET}.tmp`;
writeFileSync(tmp, encoded);
try {
  unlinkSync(TARGET);
} catch {
  // first bake / missing file
}
renameSync(tmp, TARGET);

console.log(`Wrote ${TARGET}`);
console.log(`  output: ${dstW}×${dstH}, ${mb(encoded.length)} MB on disk`);
console.log(`  reduction: ${mb(raw.length)} MB → ${mb(encoded.length)} MB`);
