// src/map/dataTexture.ts — shared setup for CPU-edited DataTextures (grids, masks, placeholders)
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  UnsignedByteType,
} from 'three';

/** Linear filtering, clamped edges, no color space, no mips: the contract of every data map. */
export function applyDataTextureDefaults(tex: DataTexture): void {
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = false;
}

/** Single-channel 8-bit texture over `data` (width × height bytes), uploaded on first use. */
export function createR8Texture(data: Uint8Array, width: number, height = width): DataTexture {
  const tex = new DataTexture(data, width, height, RedFormat, UnsignedByteType);
  applyDataTextureDefaults(tex);
  tex.needsUpdate = true;
  return tex;
}

/** `size` × `size` single-channel texture filled with `value` (255 = open / full, 0 = none). */
export function createFilledR8Texture(size: number, value: number): DataTexture {
  return createR8Texture(new Uint8Array(size * size).fill(value), size);
}

/** 1×1 stand-in bound where a real map is optional. */
export function createR8Placeholder(value: number): DataTexture {
  return createFilledR8Texture(1, value);
}
