#!/usr/bin/env node
/**
 * optimize-assets.cjs — **LOD lab tool** (raw Poly Haven → lod0/1/2 GLBs).
 *
 * Not used by play mode. For shipping play props in place under `public/models/`,
 * use `npm run bake:play-props` (`scripts/bake-play-props.mjs`) instead.
 *
 * Batch-processes a folder of glTF/GLB models (e.g. Polyhaven downloads) into
 * a LOD chain with compressed textures and geometry, ready for Three.js.
 *
 * Pipeline per model, per LOD level:
 *   weld -> simplify (meshoptimizer quadric decimation) -> resize textures
 *   -> KTX2/Basis compress textures -> meshopt/draco compress geometry
 *
 * Requirements:
 *   npm install -g @gltf-transform/cli
 *   KTX-Software installed for --texture ktx2 (https://github.com/KhronosGroup/KTX-Software/releases)
 *     - on Windows: install the .exe and make sure `toktx` is on PATH
 *     - on Mac: `brew install ktx`
 *   (If you skip KTX-Software, set TEXTURE_COMPRESS below to 'webp' instead —
 *   smaller download, but not GPU-compressed like KTX2/Basis.)
 *
 * Usage:
 *   node optimize-assets.js <input-folder> <output-folder>
 *
 * Example:
 *   node optimize-assets.js ./raw-models ./public/models
 *
 * Output naming, per source file "fir_tree_01.glb":
 *   fir_tree_01_lod0.glb   - high detail, ratio 1.0  (close-up / hero trees)
 *   fir_tree_01_lod1.glb   - mid detail,  ratio 0.35 (mid-distance)
 *   fir_tree_01_lod2.glb   - low detail,  ratio 0.1  (far / background forest)
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---- Config -----------------------------------------------------------

const LOD_LEVELS = [
  { suffix: 'lod0', ratio: 1.0, error: 0.0005 }, // weld + cleanup only, minimal simplification
  { suffix: 'lod1', ratio: 0.35, error: 0.002 },
  { suffix: 'lod2', ratio: 0.1, error: 0.01 },
];

// 'ktx2' needs KTX-Software (`ktx` binary) installed and on PATH.
// Fall back to 'webp' if you don't want that dependency yet.
//
// IMPORTANT: UASTC is a fixed ~8 bits/pixel format. Even with Zstandard
// supercompression it is often BIGGER than the original JPEG, since JPEG's
// compression ratio on photographic content is much higher. UASTC exists to
// save GPU memory/bandwidth at render time, not to shrink your download.
// ETC1S is the one that actually gives you a smaller file on disk.
//
// 'ktx2-mixed' follows glTF-Transform's own recommended split: ETC1S (small,
// lossy) for baseColorTexture, UASTC (bigger, precise) only for
// normal/occlusion/roughness maps where banding actually matters visually.
// 'ktx2-etc1s' compresses every texture with ETC1S — smallest files, use this
// if download size is your main constraint (likely the right call for trees
// viewed at any distance beyond "hero" close-ups).
const TEXTURE_COMPRESS = 'ktx2-mixed'; // 'ktx2-mixed' | 'ktx2-etc1s' | 'ktx2-uastc' | 'webp' | 'none'
const MAX_TEXTURE_SIZE = 2048; // clamp Polyhaven's 4K/8K sources down

// Flip this to true only for your final production export. RDO + level 4 is
// dramatically slower (rate-distortion optimization is one of the most
// CPU-heavy steps in the whole Basis Universal encoder) for a fairly modest
// extra size reduction. Keep it false while iterating so runs stay fast.
const PRODUCTION_QUALITY = false;

// ETC1S quality: 1-255. gltf-transform's own docs example uses 255 (max
// quality, worst size reduction) — 128 is the actual ETC1S default and gives
// a real size win. Drop lower (e.g. 90) for background/distant assets.
const ETC1S_QUALITY = 128;

// How many ktx processes to run concurrently per compression call. Bump this
// to roughly your CPU's core count to compress multiple textures in parallel
// instead of one at a time.
const ENCODE_JOBS = 8;

// ---- Helpers ------------------------------------------------------------

const NPX_CMD = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args, label) {
  console.log(`  $ gltf-transform ${args.join(' ')}`);
  try {
    execFileSync(NPX_CMD, ['--yes', '@gltf-transform/cli', ...args], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
  } catch (err) {
    throw new Error(`Step failed (${label}): ${err.message}`);
  }
}

function fileSizeKB(filePath) {
  return (fs.statSync(filePath).size / 1024).toFixed(1);
}

function processModel(inputPath, outputDir) {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  console.log(`\n=== ${baseName} ===`);
  const originalKB = fileSizeKB(inputPath);

  for (const lod of LOD_LEVELS) {
    const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'gltf-'));
    let current = inputPath;

    // 1. Weld vertices (required before simplify, also helps dedup regardless)
    const welded = path.join(tmpDir, 'welded.glb');
    run(['weld', current, welded], 'weld');
    current = welded;

    // 2. Simplify geometry to target ratio (skip actual decimation at lod0,
    //    weld+prune is still worth doing to strip duplicate verts)
    if (lod.ratio < 1.0) {
      const simplified = path.join(tmpDir, 'simplified.glb');
      run(
        [
          'simplify',
          current,
          simplified,
          '--ratio',
          String(lod.ratio),
          '--error',
          String(lod.error),
        ],
        'simplify'
      );
      current = simplified;
    }

    // 3. Prune unused data (orphaned nodes/accessors after simplification)
    const pruned = path.join(tmpDir, 'pruned.glb');
    run(['prune', current, pruned], 'prune');
    current = pruned;

    // 4. Resize textures down from Polyhaven's 4K/8K source
    const resized = path.join(tmpDir, 'resized.glb');
    run(
      [
        'resize',
        current,
        resized,
        '--width',
        String(MAX_TEXTURE_SIZE),
        '--height',
        String(MAX_TEXTURE_SIZE),
      ],
      'resize'
    );
    current = resized;

    // 5. Texture compression
    if (TEXTURE_COMPRESS === 'ktx2-mixed') {
      // ETC1S for color data, UASTC for normal/occlusion/roughness — this is
      // the split gltf-transform's own docs recommend.
      const step1 = path.join(tmpDir, 'tex_etc1s.glb');
      run(
        [
          'etc1s',
          current,
          step1,
          '--slots',
          'baseColorTexture',
          '--quality',
          String(ETC1S_QUALITY),
          '--jobs',
          String(ENCODE_JOBS),
        ],
        'etc1s'
      );
      const step2 = path.join(tmpDir, 'tex_uastc.glb');
      const uastcArgs = [
        'uastc',
        step1,
        step2,
        '--slots',
        '{normalTexture,occlusionTexture,metallicRoughnessTexture}',
        '--level',
        PRODUCTION_QUALITY ? '4' : '2',
        '--zstd',
        '18',
        '--jobs',
        String(ENCODE_JOBS),
      ];
      if (PRODUCTION_QUALITY) {
        uastcArgs.push('--rdo', '--rdo-lambda', '4');
      }
      run(uastcArgs, 'uastc');
      current = step2;
    } else if (TEXTURE_COMPRESS === 'ktx2-etc1s') {
      const compressed = path.join(tmpDir, 'texcompressed.glb');
      run(
        [
          'etc1s',
          current,
          compressed,
          '--quality',
          String(ETC1S_QUALITY),
          '--jobs',
          String(ENCODE_JOBS),
        ],
        'etc1s'
      );
      current = compressed;
    } else if (TEXTURE_COMPRESS === 'ktx2-uastc') {
      const compressed = path.join(tmpDir, 'texcompressed.glb');
      const uastcArgs = [
        'uastc',
        current,
        compressed,
        '--level',
        PRODUCTION_QUALITY ? '4' : '2',
        '--zstd',
        '18',
        '--jobs',
        String(ENCODE_JOBS),
      ];
      if (PRODUCTION_QUALITY) {
        uastcArgs.push('--rdo', '--rdo-lambda', '4');
      }
      run(uastcArgs, 'uastc');
      current = compressed;
    } else if (TEXTURE_COMPRESS === 'webp') {
      const compressed = path.join(tmpDir, 'texcompressed.glb');
      run(['webp', current, compressed], 'webp');
      current = compressed;
    }

    // 6. Geometry compression (meshopt is a good default: smaller than raw,
    //    decodes fast, plays nicely with the KTX2 texture pipeline)
    const finalPath = path.join(outputDir, `${baseName}_${lod.suffix}.glb`);
    run(['meshopt', current, finalPath], 'meshopt');

    console.log(
      `  -> ${lod.suffix}: ${originalKB} KB -> ${fileSizeKB(finalPath)} KB`
    );

    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function main() {
  const [, , inputArg, outputArg] = process.argv;
  if (!inputArg || !outputArg) {
    console.error('Usage: node optimize-assets.js <input-folder> <output-folder>');
    process.exit(1);
  }

  const inputDir = path.resolve(inputArg);
  const outputDir = path.resolve(outputArg);

  if (!fs.existsSync(inputDir)) {
    console.error(`Input folder not found: ${inputDir}`);
    process.exit(1);
  }
  fs.mkdirSync(outputDir, { recursive: true });

  const files = fs
    .readdirSync(inputDir)
    .filter((f) => /\.(glb|gltf)$/i.test(f));

  if (files.length === 0) {
    console.error(`No .glb/.gltf files found in ${inputDir}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} model(s). Texture compression: ${TEXTURE_COMPRESS}`);

  for (const file of files) {
    processModel(path.join(inputDir, file), outputDir);
  }

  console.log('\nDone. Drop the output folder into your Three.js public/assets path.');
}

main();