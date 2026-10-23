// src/life/animals/animalKit.ts — loads the modelled animals (public/models/animals/<key>.glb)
//
// Each model key (`MODEL_KEYS`) looks for `models/animals/<key>.glb`. See animalModelFromScene.ts for what a file
// must hold. A key with no file keeps its stand-in.

import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { WebGPURenderer } from 'three/webgpu';
import { createKtx2Loader } from '../../assets/createKtx2Loader';
import { modelFromScene } from './animalModelFromScene';
import { type AnimalModel, MODEL_KEYS } from './animalModels';

const PATH = (key: string) => `models/animals/${key}.glb`;

/**
 * Load the modelled animals. A missing file is normal (the stand-in stays) and only one line says which; a file that
 * loads but has no mesh is reported as a problem.
 */
export async function loadAnimalKit(renderer: WebGPURenderer): Promise<Map<string, AnimalModel>> {
  const loader = new GLTFLoader();
  loader.setKTX2Loader(createKtx2Loader(renderer));
  const models = new Map<string, AnimalModel>();
  const missing: string[] = [];
  await Promise.all(
    MODEL_KEYS.map(async (key) => {
      let scene: Object3D;
      try {
        scene = (await loader.loadAsync(PATH(key))).scene;
      } catch {
        missing.push(key);
        return;
      }
      const model = modelFromScene(key, scene);
      if (model) models.set(key, model);
      else console.warn(`[life] ${PATH(key)} has no mesh; keeping the stand-in for ${key}`);
    }),
  );
  if (missing.length > 0) {
    console.info(
      `[life] no modelled animals yet for: ${missing.sort().join(', ')} (stand-ins in use)`,
    );
  }
  return models;
}
