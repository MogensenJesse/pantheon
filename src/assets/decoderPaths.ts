// src/assets/decoderPaths.ts — self-hosted Basis + Draco URLs under public/

/**
 * Basis Universal transcoder for `KTX2Loader` (synced via `npm run sync-decoders`).
 * Trailing slash required by three.js loader path joining.
 */
export const BASIS_TRANSCODER_PATH = '/basis/';

/**
 * Draco glTF decoder for `DRACOLoader` (synced via `npm run sync-decoders`).
 * Use the `gltf/` build for `KHR_draco_mesh_compression`.
 */
export const DRACO_DECODER_PATH = '/draco/gltf/';
