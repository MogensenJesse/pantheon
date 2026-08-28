#!/usr/bin/env node
/**
 * scripts/lib/playPropBake.mjs — shared play LOD + KTX2 bake used by CLI and optimizer save
 *
 * Encoder: glTF-Transform etc1s/uastc (legacy toktx under the hood today).
 * Prefer a local `ktx` install for validation; keep toktx until this encoder is fully migrated.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectKtxTools,
  runGltfTransform,
  validateGlb,
  validateKtxGltfBasisu,
} from './ktxEncoder.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

export const ETC1S_QUALITY = 128;
export const ENCODE_JOBS = 8;
export const UASTC_LEVEL = '2';

export const LOD_LEVELS = [
  { lod: 0, ratio: 1.0, error: 0.0005, maxTexture: 2048 },
  { lod: 1, ratio: 0.35, error: 1, maxTexture: 1024 },
  { lod: 2, ratio: 0.1, error: 1, maxTexture: 512 },
];

export function countGlbPrimitives(glbPath) {
  const buf = readFileSync(glbPath);
  if (buf.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error(`Not a GLB: ${glbPath}`);
  }
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));
  const meshes = json.meshes ?? [];
  return meshes.reduce((n, mesh) => n + (mesh.primitives?.length ?? 0), 0);
}

export function assertLodChainAligned(lod0Path, siblingPaths) {
  const expected = countGlbPrimitives(lod0Path);
  for (const sibling of siblingPaths) {
    const got = countGlbPrimitives(sibling);
    if (got !== expected) {
      throw new Error(
        `LOD submesh count mismatch: lod0 has ${expected} primitives, ${basename(sibling)} has ${got}. Play instancing requires aligned mesh counts.`,
      );
    }
  }
}

export function mb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

export function lodOutPath(canonicalGlb, lod) {
  if (lod === 0) return canonicalGlb;
  return canonicalGlb.replace(/\.glb$/i, `_lod${lod}.glb`);
}

export function writeGlbAtomic(srcPath, destPath) {
  mkdirSync(dirname(destPath), { recursive: true });
  const staging = `${destPath}.tmp`;
  copyFileSync(srcPath, staging);
  if (existsSync(destPath)) unlinkSync(destPath);
  renameSync(staging, destPath);
}

export function compressTextures(current, tmp, tag, maxTexture) {
  const resized = join(tmp, `${tag}-resized.glb`);
  runGltfTransform(
    ['resize', current, resized, '--width', String(maxTexture), '--height', String(maxTexture)],
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

export function bakeLodLevel(gltfPath, tmp, lodLevel) {
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

/**
 * From an already-KTX2 lod0 .glb: weld → simplify → prune → ktxdecompress →
 * resize → etc1s/uastc. Does not rewrite lod0.
 */
export function bakeLodSiblingsFromGlb(lod0Glb, { onProgress } = {}) {
  const rel = relative(root, lod0Glb);
  const tmp = mkdtempSync(join(tmpdir(), 'pantheon-prop-lod-'));
  const written = [];

  try {
    onProgress?.('lod-siblings', `Generating lod1/lod2 from ${rel}`);
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

      const decompressed = join(tmp, `${tag}-ktxdecomp.glb`);
      runGltfTransform(['ktxdecompress', current, decompressed], `${tag} ktxdecompress`);
      current = decompressed;

      current = compressTextures(current, tmp, tag, level.maxTexture);

      const dest = lodOutPath(lod0Glb, level.lod);
      writeGlbAtomic(current, dest);
      written.push(dest);
      onProgress?.(`lod${level.lod}`, `Wrote ${relative(root, dest)}`);
      console.log(
        `  → ${relative(root, dest)} (${mb(statSync(dest).size)} MB) [lod${level.lod} ratio=${level.ratio} tex≤${level.maxTexture}]`,
      );
    }

    return written;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Optimizer save: compress the browser's already-optimized lod0 (no extra simplify),
 * then optionally derive lod1/lod2 from that lod0 once.
 */
export function bakeOptimizedLod0ToPlayChain(
  sourceGlb,
  destLod0,
  { emitLodChain = true, onProgress } = {},
) {
  const tools = detectKtxTools();
  if (!tools.canEncode) {
    throw new Error(
      'Project save needs `toktx` on PATH (gltf-transform ETC1S/UASTC). Install KTX-Software; `ktx` is used for validation only.',
    );
  }
  const tmp = mkdtempSync(join(tmpdir(), 'pantheon-optimizer-'));
  const written = [];
  try {
    onProgress?.('lod0', 'Compressing lod0 textures (no extra simplify)…');
    let current = sourceGlb;
    const welded = join(tmp, 'lod0-welded.glb');
    runGltfTransform(['weld', current, welded], 'lod0 weld');
    current = welded;
    const pruned = join(tmp, 'lod0-pruned.glb');
    runGltfTransform(['prune', current, pruned], 'lod0 prune');
    current = pruned;
    current = compressTextures(current, tmp, 'lod0', 2048);
    writeGlbAtomic(current, destLod0);
    written.push(destLod0);
    try {
      validateGlb(destLod0);
    } catch (err) {
      onProgress?.('validate', `lod0 validator warning: ${err.message}`);
    }
    if (tools.canValidateKtx) {
      try {
        validateKtxGltfBasisu(destLod0);
      } catch (err) {
        onProgress?.('validate', `ktx validate warning: ${err.message}`);
      }
    }
    if (emitLodChain) {
      const siblings = bakeLodSiblingsFromGlb(destLod0, { onProgress });
      assertLodChainAligned(destLod0, siblings);
      written.push(...siblings);
    }
    return written;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function cleanSidecarsForGlb(glbPath) {
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

  const stillHasGltf = readdirSync(dir).some((n) => /\.gltf$/i.test(n));
  if (stillHasGltf) return;

  for (const name of readdirSync(dir)) {
    if (!/\.(png|jpe?g|webp)$/i.test(name)) continue;
    const full = join(dir, name);
    unlinkSync(full);
    console.log(`  removed ${relative(root, full)}`);
  }

  const texDir = join(dir, 'textures');
  if (existsSync(texDir) && statSync(texDir).isDirectory()) {
    const nestedGltf = readdirSync(dir).some((n) => /\.gltf$/i.test(n));
    if (!nestedGltf) {
      rmSync(texDir, { recursive: true, force: true });
      console.log(`  removed ${relative(root, texDir)}/`);
    }
  }
}

export function collectGltfs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collectGltfs(full, out);
    else if (/\.gltf$/i.test(name)) out.push(full);
  }
  return out;
}

export function collectLod0Glbs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) collectLod0Glbs(full, out);
    else if (/\.glb$/i.test(name) && !/_lod[12]\.glb$/i.test(name)) out.push(full);
  }
  return out;
}

export function bakeOne(gltfPath, { noLod }) {
  const outGlb = gltfPath.replace(/\.gltf$/i, '.glb');
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

export function bakeFromGlb(glbPath, { noLod }) {
  const rel = relative(root, glbPath);
  const tmp = mkdtempSync(join(tmpdir(), 'pantheon-prop-'));
  const levels = noLod ? LOD_LEVELS.filter((l) => l.lod === 0) : LOD_LEVELS;
  const written = [];

  try {
    console.log(`\n=== ${rel} (from-glb full bake) ===`);
    const srcBytes = statSync(glbPath).size;
    console.log(`  source lod0 ${mb(srcBytes)} MB`);

    for (const level of levels) {
      const baked = bakeLodLevel(glbPath, tmp, level);
      const dest = lodOutPath(glbPath, level.lod);
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
