// src/world/water/loadWaterNormals.ts — tiling normal map for WaterMesh ripples
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  RepeatWrapping,
  type Texture,
  TextureLoader,
} from 'three';

const WATER_NORMALS_PATH = 'textures/water/waternormals.jpg';

export async function loadWaterNormals(): Promise<Texture> {
  const loader = new TextureLoader();
  const tex = await loader.loadAsync(WATER_NORMALS_PATH);
  // Normal data is linear, not sRGB — leave colorSpace as default (no transform).
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.magFilter = LinearFilter;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}
