// src/world/terrain/loaders/terrainTextureConfigure.ts
import { RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

export function configureColorTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
}
