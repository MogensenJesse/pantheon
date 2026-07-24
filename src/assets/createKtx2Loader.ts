// src/assets/createKtx2Loader.ts — shared KTX2/Basis loader after renderer.init()
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import type { WebGPURenderer } from 'three/webgpu';
import { BASIS_TRANSCODER_PATH } from './decoderPaths';

/**
 * Create a KTX2Loader with self-hosted Basis transcoder and WebGPU format detection.
 * Call only after `await renderer.init()`. Dispose when finished (or keep for session reuse).
 */
export function createKtx2Loader(renderer: WebGPURenderer): KTX2Loader {
  if (!renderer.isWebGPURenderer) {
    throw new Error('createKtx2Loader requires an initialized WebGPURenderer');
  }
  const loader = new KTX2Loader();
  loader.setTranscoderPath(BASIS_TRANSCODER_PATH);
  loader.detectSupport(renderer);
  return loader;
}
