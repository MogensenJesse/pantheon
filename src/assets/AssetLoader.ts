// src/assets/AssetLoader.ts
import { LoadingManager, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { collectAllAssetPaths, type AssetRegistry } from './assetManifest';

export async function loadAllAssets(
  onProgress?: (loaded: number, total: number) => void,
): Promise<AssetRegistry> {
  const registry: AssetRegistry = new Map();
  const entries = collectAllAssetPaths();

  const manager = new LoadingManager();
  manager.onProgress = (_url, itemsLoaded, itemsTotal) => {
    onProgress?.(itemsLoaded, itemsTotal);
  };

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setDRACOLoader(dracoLoader);

  return new Promise((resolve, reject) => {
    manager.onLoad = () => {
      dracoLoader.dispose();
      resolve(registry);
    };

    manager.onError = (url) => reject(new Error(`Failed to load asset: ${url}`));

    for (const { key, path } of entries) {
      gltfLoader.load(
        path,
        (gltf) => {
          const root = gltf.scene;
          root.traverse((child) => {
            const mesh = child as import('three').Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = false;
              mesh.receiveShadow = false;
            }
          });
          registry.set(key, root);
        },
        undefined,
        (err) => {
          console.error(`Asset load error [${key}]:`, path, err);
          reject(err);
        },
      );
    }
  });
}

export function cloneFromRegistry(registry: AssetRegistry, key: string): Object3D {
  const src = registry.get(key);
  if (!src) throw new Error(`Missing asset: ${key}`);
  return src.clone(true);
}
