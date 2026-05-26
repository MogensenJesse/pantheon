// src/rendering/loadSkyHDRI.ts — equirectangular morning sky HDRI (EXR)
import { EquirectangularReflectionMapping, type Texture } from 'three';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const SKY_HDRI_PATH = 'models/sky/MorningSkyHDRI011B_4K_HDR.exr';

export async function loadSkyHDRI(): Promise<Texture> {
  const loader = new EXRLoader();
  const texture = await loader.loadAsync(SKY_HDRI_PATH);
  texture.mapping = EquirectangularReflectionMapping;
  return texture;
}
