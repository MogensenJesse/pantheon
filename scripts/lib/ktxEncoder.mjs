// scripts/lib/ktxEncoder.mjs — detect ktx / toktx and invoke local glTF-Transform
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const GLTF_TRANSFORM_BIN = join(
  root,
  'node_modules',
  '@gltf-transform',
  'cli',
  'bin',
  'cli.js',
);
export const GLTF_VALIDATOR = join(root, 'node_modules', 'gltf-validator', 'index.js');

function findOnPath(cmd) {
  const bin = process.platform === 'win32' ? 'where' : 'which';
  try {
    const out = execFileSync(bin, [cmd], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: process.platform === 'win32',
    });
    return out.split(/\r?\n/).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

/** Path to `toktx` (PATH first, then the default Windows install); throws when missing. */
export function resolveToktx() {
  const found = findOnPath('toktx');
  if (found && existsSync(found)) return found;
  const fallback = 'C:Program FilesKTX-Software\bin\toktx.exe';
  if (existsSync(fallback)) return fallback;
  throw new Error('toktx not found on PATH (install KTX-Software)');
}

/** Run `toktx` with inherited stdio; throws on a non-zero exit. */
export function runToktx(toktx, args, { echo = false } = {}) {
  if (echo) console.log(`  $ toktx ${args.join(' ')}`);
  const result = spawnSync(toktx, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`toktx failed (exit ${result.status}): toktx ${args.join(' ')}`);
  }
}

export function detectKtxTools() {
  const ktx = findOnPath('ktx');
  const toktx = findOnPath('toktx');
  return {
    ktx,
    toktx,
    encoder: toktx ? 'toktx' : ktx ? 'ktx' : null,
    canEncode: Boolean(toktx),
    canValidateKtx: Boolean(ktx),
    gltfTransform: existsSync(GLTF_TRANSFORM_BIN),
    validator: existsSync(join(root, 'node_modules', 'gltf-validator')),
  };
}

export function runGltfTransform(args, label, { silent = false } = {}) {
  if (!existsSync(GLTF_TRANSFORM_BIN)) {
    throw new Error('Pinned @gltf-transform/cli is not installed (node_modules)');
  }
  if (!silent) console.log(`  $ gltf-transform ${args.join(' ')}`);
  try {
    execFileSync(process.execPath, [GLTF_TRANSFORM_BIN, ...args], {
      stdio: silent ? 'pipe' : 'inherit',
      cwd: root,
    });
  } catch (err) {
    throw new Error(`Step failed (${label}): ${err.message}`);
  }
}

export function validateGlb(glbPath) {
  runGltfTransform(['validate', glbPath], `validate ${glbPath}`, { silent: true });
}

export function validateKtxGltfBasisu(ktxPath) {
  const tools = detectKtxTools();
  if (!tools.ktx) return false;
  try {
    execFileSync(tools.ktx, ['validate', '--gltf-basisu', ktxPath], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}
