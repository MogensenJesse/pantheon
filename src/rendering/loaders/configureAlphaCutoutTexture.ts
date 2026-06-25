// src/rendering/loaders/configureAlphaCutoutTexture.ts — MASK foliage sampling (no mipmap bleed)
import { LinearFilter, type Texture } from 'three';

/** Stop mip levels from averaging opaque texels with black transparent padding on cutout maps. */
export function configureAlphaCutoutTexture(texture: Texture): void {
  texture.generateMipmaps = false;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
}
