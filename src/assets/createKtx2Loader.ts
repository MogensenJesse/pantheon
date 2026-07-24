// src/assets/createKtx2Loader.ts — shared KTX2/Basis loader after renderer.init()
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { WebGPURenderer } from 'three/webgpu';
import { BASIS_TRANSCODER_PATH } from './decoderPaths';

let shared: { renderer: WebGPURenderer; loader: KTX2Loader } | null = null;

/**
 * Session-shared KTX2Loader (self-hosted Basis + WebGPU format detection).
 * Call only after `await renderer.init()`. Do not dispose the returned loader —
 * Three warns when multiple instances are active; play loads props + terrain in parallel.
 */
export function createKtx2Loader(renderer: WebGPURenderer): KTX2Loader {
  if (!renderer.isWebGPURenderer) {
    throw new Error('createKtx2Loader requires an initialized WebGPURenderer');
  }
  if (shared?.renderer === renderer) {
    return shared.loader;
  }
  shared?.loader.dispose();
  const loader = new KTX2Loader();
  loader.setTranscoderPath(BASIS_TRANSCODER_PATH);
  loader.detectSupport(renderer);
  shared = { renderer, loader };
  return loader;
}
