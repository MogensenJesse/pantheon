// src/rendering/loadNightHdri.ts — night sky EXR + PMREM environment map
import {
  EquirectangularReflectionMapping,
  PMREMGenerator,
  type CubeTexture,
  type RenderTarget,
  type Texture,
  type WebGPURenderer,
} from 'three/webgpu';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { VISUAL } from '../config/visualTuning';

export interface NightHdriAssets {
  equirectTexture: Texture;
  envMap: CubeTexture;
  pmremTarget: RenderTarget;
  dispose: () => void;
}

export async function loadNightHdri(renderer: WebGPURenderer): Promise<NightHdriAssets> {
  const loader = new EXRLoader();
  const equirectTexture = await loader.loadAsync(VISUAL.sky.nightHdri.path);
  equirectTexture.mapping = EquirectangularReflectionMapping;
  equirectTexture.needsUpdate = true;

  const pmremGenerator = new PMREMGenerator(renderer);
  const pmremTarget = pmremGenerator.fromEquirectangular(equirectTexture);
  const envMap = pmremTarget.texture as CubeTexture;

  return {
    equirectTexture,
    envMap,
    pmremTarget,
    dispose: () => {
      pmremGenerator.dispose();
      pmremTarget.dispose();
      equirectTexture.dispose();
    },
  };
}
