// src/assets/AssetLoader.ts
import {
  BufferGeometry,
  LoadingManager,
  Material,
  Mesh,
  Object3D,
  Texture,
} from 'three';
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

// Texture slots three.js stock materials may hold. Disposed once each via WeakSet.
const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'specularMap',
  'envMap',
  'gradientMap',
] as const;

type MaybeTexturedMaterial = Material & Partial<Record<(typeof TEXTURE_SLOTS)[number], Texture | null>>;

/**
 * Traverse every Object3D in `registry` and release GPU-backed resources owned
 * by the original GLTF roots: geometries, materials, and the textures hung off
 * material slots. WeakSets dedupe shared refs so each resource is disposed at
 * most once per call. Safe to invoke after scatterer/landmark teardown: those
 * subsystems either clone (scatterer) or share (landmark) the registry's
 * geometry+material objects, but three.js dispose is idempotent and the
 * WeakSets here only guard the registry pass itself.
 *
 * NOTE: textures are shared by reference across material slots and across
 * registry vs scatterer-cloned materials. Only call this at end-of-session
 * (pagehide / hot reload), never mid-session.
 */
export function disposeAssetRegistry(registry: AssetRegistry): void {
  const seenGeometry = new WeakSet<BufferGeometry>();
  const seenMaterial = new WeakSet<Material>();
  const seenTexture = new WeakSet<Texture>();

  const disposeTextures = (mat: MaybeTexturedMaterial) => {
    for (const slot of TEXTURE_SLOTS) {
      const tex = mat[slot];
      if (tex && !seenTexture.has(tex)) {
        seenTexture.add(tex);
        tex.dispose();
      }
    }
  };

  const disposeMaterial = (mat: Material) => {
    if (seenMaterial.has(mat)) return;
    seenMaterial.add(mat);
    disposeTextures(mat as MaybeTexturedMaterial);
    mat.dispose();
  };

  for (const root of registry.values()) {
    root.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;

      const geom = mesh.geometry as BufferGeometry | undefined;
      if (geom && !seenGeometry.has(geom)) {
        seenGeometry.add(geom);
        geom.dispose();
      }

      const mat = mesh.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) {
        for (const m of mat) {
          if (m) disposeMaterial(m);
        }
      } else if (mat) {
        disposeMaterial(mat);
      }
    });
  }

  registry.clear();
}
