// src/world/grass/data/loadGrassWindAtlas.ts — tileable wind noise atlas (Revo-style KTX2)
//
// Source asset (MIT Revo Realms, feat/new-world):
//   packed_rgba.png → bake → public/textures/grass/noise-atlas.ktx2
//   https://github.com/alezen9/revo-realms/tree/feat/new-world/public/textures/new-world/noise
//
// Channel layout (RGBA):
//   .r — grass draw wind layer A (`grassWindTsl.ts`); flower init tile-wrap jitter (`flowerSsbo.ts`)
//   .g — grass draw wind layer B (`grassWindTsl.ts`)
//   .b — grass init tile-wrap jitter + blade scale noise (`grassSsbo.ts` computeInit)
//   .a — unused
//
// Rebuild: `npm run bake:grass-ktx2` (requires `toktx`). No PNG fallback.

import { LinearFilter, NoColorSpace, RepeatWrapping, type Texture } from 'three';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

/** Vite-served path under `public/textures/grass/noise-atlas.ktx2`. */
export const GRASS_WIND_ATLAS_PATH = '/textures/grass/noise-atlas.ktx2';

/** Load the wind noise atlas (required). Fail-fast if missing / decode fails. */
export async function loadGrassWindAtlas(ktx2Loader: KTX2Loader): Promise<Texture> {
  const tex = await ktx2Loader.loadAsync(GRASS_WIND_ATLAS_PATH);
  tex.colorSpace = NoColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
