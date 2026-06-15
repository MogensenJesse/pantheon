// src/world/terrain/terrainFallbacks.ts — 1×1 placeholder maps when glTF assets are missing
import { Color, DataTexture } from 'three';
import { configureColorTexture, configureDataTexture } from './terrainTextureConfigure';
import type { TerrainGltfFolder } from './terrainTextureManifest';

export const FALLBACK_COLORS: Record<TerrainGltfFolder, number> = {
  shore: 0x8a9a5b,
  forest: 0x2d7020,
  hills: 0x8c6c35,
  mountain: 0xa09080,
  path: 0x8a7658,
  meadow: 0x6a9a4b,
  snow: 0xe8eef5,
};

export function createFallbackColor(hex: number): DataTexture {
  const color = new Color(hex);
  const data = new Uint8Array([
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
    255,
  ]);
  const tex = new DataTexture(data, 1, 1);
  configureColorTexture(tex);
  return tex;
}

export function createFallbackNormal(): DataTexture {
  const data = new Uint8Array([128, 128, 255, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}

export function createFallbackOrm(): DataTexture {
  const data = new Uint8Array([128, 255, 0, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}

export function createFallbackSpec(): DataTexture {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}

export function createFallbackDisplacement(): DataTexture {
  // Black — unipolar disp.r * scale = 0 when no height map is loaded
  const data = new Uint8Array([0, 0, 0, 255]);
  const tex = new DataTexture(data, 1, 1);
  configureDataTexture(tex);
  return tex;
}
