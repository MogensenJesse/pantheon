// src/world/grass/data/loadFlowerSprite.ts — edelweiss billboard sprite (Revo Realms)
//
// Source asset (MIT Revo Realms, feat/new-world):
//   public/textures/new-world/flowers/edelweiss.png → public/textures/grass/edelweiss.png
//   https://github.com/alezen9/revo-realms/tree/feat/new-world/public/textures/new-world/flowers
import { SRGBColorSpace, type Texture, TextureLoader } from 'three';
import { configureAlphaCutoutTexture } from '../../../rendering/loaders/configureAlphaCutoutTexture';

export const FLOWER_SPRITE_PATH = '/textures/grass/edelweiss.png';

/** Loads the flower sprite when present. Returns null on 404 / network error. */
export function loadFlowerSprite(): Promise<Texture | null> {
  return new Promise((resolve) => {
    const loader = new TextureLoader();
    loader.load(
      FLOWER_SPRITE_PATH,
      (tex) => {
        tex.colorSpace = SRGBColorSpace;
        configureAlphaCutoutTexture(tex);
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      () => resolve(null),
    );
  });
}
