// src/world/grass/loadGrassWindAtlas.ts — optional tileable wind noise (Revo-style)
//
// Source asset (MIT Revo Realms, feat/new-world):
//   packed_rgba.png → public/textures/grass/noise-atlas.png
//   https://github.com/alezen9/revo-realms/tree/feat/new-world/public/textures/new-world/noise
//
// Revo ships `noise_atlas.ktx2` at runtime; we use the PNG packed atlas for WebGPU TextureLoader.
import { LinearFilter, RepeatWrapping, Texture, TextureLoader } from 'three';

/** Vite-served path under `public/textures/grass/noise-atlas.png`. */
export const GRASS_WIND_ATLAS_PATH = '/textures/grass/noise-atlas.png';

/**
 * Loads the wind noise atlas when present.
 * Returns null on 404 / network error (compute falls back to procedural hash).
 */
export function loadGrassWindAtlas(): Promise<Texture | null> {
  return new Promise((resolve) => {
    const loader = new TextureLoader();
    loader.load(
      GRASS_WIND_ATLAS_PATH,
      (tex) => {
        tex.wrapS = RepeatWrapping;
        tex.wrapT = RepeatWrapping;
        tex.minFilter = LinearFilter;
        tex.magFilter = LinearFilter;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      () => resolve(null),
    );
  });
}
