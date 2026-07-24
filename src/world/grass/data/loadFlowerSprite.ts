// src/world/grass/data/loadFlowerSprite.ts — edelweiss billboard sprite (Revo Realms KTX2)
//
// Source asset (MIT Revo Realms, feat/new-world):
//   edelweiss.png → bake → public/textures/grass/edelweiss.ktx2
//   https://github.com/alezen9/revo-realms/tree/feat/new-world/public/textures/new-world/flowers
//
// Rebuild: `npm run bake:grass-ktx2` (requires `toktx`). No PNG fallback.

import { SRGBColorSpace, type Texture } from 'three';
import type { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { configureAlphaCutoutTexture } from '../../../rendering/loaders/configureAlphaCutoutTexture';

export const FLOWER_SPRITE_PATH = '/textures/grass/edelweiss.ktx2';

/** Load the flower sprite (required). Fail-fast if missing / decode fails. */
export async function loadFlowerSprite(ktx2Loader: KTX2Loader): Promise<Texture> {
  const tex = await ktx2Loader.loadAsync(FLOWER_SPRITE_PATH);
  tex.colorSpace = SRGBColorSpace;
  configureAlphaCutoutTexture(tex);
  tex.needsUpdate = true;
  return tex;
}
