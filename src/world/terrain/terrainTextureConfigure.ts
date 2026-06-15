// src/world/terrain/terrainTextureConfigure.ts
import { NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

export function configureColorTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
}

export function configureDataTexture(texture: Texture): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = NoColorSpace;
  texture.needsUpdate = true;
}
