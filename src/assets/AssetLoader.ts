// src/assets/AssetLoader.ts
import {
  Box3,
  type BufferGeometry,
  Group,
  LoadingManager,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  type Texture,
  Vector3,
} from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { WebGPURenderer } from 'three/webgpu';
import {
  type AssetRegistry,
  collectAssetLoadJobs,
  type NaturePropAssetEntry,
  type PropAssetExtract,
} from './assetManifest';
import { createKtx2Loader } from './createKtx2Loader';
import { DRACO_DECODER_PATH } from './decoderPaths';

const _rootInverse = new Matrix4();
const _localToRoot = new Matrix4();
const _box = new Box3();
const _center = new Vector3();

function disableMeshShadows(root: Object3D): void {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
    }
  });
}

/**
 * GLTF original name for a node. Three.js `GLTFLoader` stores the raw glTF
 * name in `userData.name` and puts a sanitized/unique string on `Object3D.name`
 * (dots stripped, duplicate Mid_4 → Mid_4_1, spaces → underscores).
 */
function gltfNodeName(obj: Object3D): string {
  const raw = obj.userData?.name;
  return typeof raw === 'string' && raw.length > 0 ? raw : obj.name;
}

/** Collect depth-first matches of a glTF node name under `root`. */
function findNodesByName(root: Object3D, nodeName: string): Object3D[] {
  const hits: Object3D[] = [];
  root.traverse((child) => {
    if (gltfNodeName(child) === nodeName) hits.push(child);
  });
  return hits;
}

/**
 * Bake each mesh into `root` local space and flatten under `root` at identity.
 * Required so editor `obj.scale.setScalar(entity.scale)` and play instancing
 * (which clones mesh geometry only) both see the normalized size — a parent
 * Group.scale alone is overwritten / ignored.
 */
function bakeMeshesToRootSpace(root: Group): void {
  root.updateMatrixWorld(true);
  _rootInverse.copy(root.matrixWorld).invert();

  const baked: Mesh[] = [];
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    _localToRoot.multiplyMatrices(_rootInverse, mesh.matrixWorld);
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(_localToRoot);
    const flat = new Mesh(geometry, mesh.material);
    flat.name = mesh.name;
    flat.castShadow = mesh.castShadow;
    flat.receiveShadow = mesh.receiveShadow;
    baked.push(flat);
  });

  while (root.children.length > 0) {
    root.remove(root.children[0]);
  }
  for (const mesh of baked) {
    root.add(mesh);
  }
  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
}

/**
 * Clone a source node into a Group and shift so the bounding-box foot sits at
 * local origin (XZ centered, min Y = 0) for map prop placement.
 * Optional `targetHeightM` uniformly scales to match shipped nature-pack sizes,
 * baked into geometry so registry roots stay at scale 1.
 */
function extractAndRecenter(source: Object3D, targetHeightM?: number): Group {
  const wrapper = new Group();
  const clone = source.clone(true);
  wrapper.add(clone);
  wrapper.updateMatrixWorld(true);

  _box.setFromObject(wrapper);
  if (_box.isEmpty()) return wrapper;

  _box.getCenter(_center);
  clone.position.x -= _center.x;
  clone.position.y -= _box.min.y;
  clone.position.z -= _center.z;

  if (targetHeightM !== undefined && targetHeightM > 0) {
    wrapper.updateMatrixWorld(true);
    _box.setFromObject(wrapper);
    const height = _box.max.y - _box.min.y;
    if (height > 1e-6) {
      clone.scale.multiplyScalar(targetHeightM / height);
      wrapper.updateMatrixWorld(true);
      _box.setFromObject(wrapper);
      clone.position.y -= _box.min.y;
    }
  }

  bakeMeshesToRootSpace(wrapper);

  wrapper.updateMatrixWorld(true);
  _box.setFromObject(wrapper);
  if (!_box.isEmpty()) {
    wrapper.position.y -= _box.min.y;
  }

  return wrapper;
}

function resolveExtractSource(root: Object3D, extract: PropAssetExtract): Object3D {
  const hits = findNodesByName(root, extract.nodeName);
  const index = extract.index ?? 0;
  const source = hits[index];
  if (!source) {
    throw new Error(
      `Pack extract miss: node "${extract.nodeName}" index ${index} (found ${hits.length})`,
    );
  }
  return source;
}

function registerEntries(
  registry: AssetRegistry,
  root: Object3D,
  entries: NaturePropAssetEntry[],
): void {
  disableMeshShadows(root);
  for (const entry of entries) {
    if (entry.extract) {
      const source = resolveExtractSource(root, entry.extract);
      registry.set(entry.key, extractAndRecenter(source, entry.targetHeightM));
    } else {
      registry.set(entry.key, extractAndRecenter(root, entry.targetHeightM));
    }
  }
}

/**
 * Load catalog GLBs (`KHR_texture_basisu`). Requires an initialized WebGPURenderer
 * so KTX2/Basis format detection can run (call after `initSceneSetup` / `renderer.init()`).
 * Draco + Basis WASM are self-hosted under `public/` (`npm run sync-decoders`).
 */
export async function loadAllAssets(
  renderer: WebGPURenderer,
  onProgress?: (loaded: number, total: number) => void,
): Promise<AssetRegistry> {
  const registry: AssetRegistry = new Map();
  const jobs = collectAssetLoadJobs();

  if (jobs.length === 0) {
    return registry;
  }

  const manager = new LoadingManager();
  manager.onProgress = (_url, itemsLoaded, itemsTotal) => {
    onProgress?.(itemsLoaded, itemsTotal);
  };

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(DRACO_DECODER_PATH);

  const ktx2Loader = createKtx2Loader(renderer);

  const gltfLoader = new GLTFLoader(manager);
  gltfLoader.setDRACOLoader(dracoLoader);
  gltfLoader.setKTX2Loader(ktx2Loader);

  return new Promise((resolve, reject) => {
    manager.onLoad = () => {
      dracoLoader.dispose();
      ktx2Loader.dispose();
      resolve(registry);
    };

    manager.onError = (url) => reject(new Error(`Failed to load asset: ${url}`));

    for (const { path, entries } of jobs) {
      const keys = entries.map((e) => e.key).join(',');
      gltfLoader.load(
        path,
        (gltf) => {
          try {
            registerEntries(registry, gltf.scene, entries);
          } catch (err) {
            console.error(`Asset register error [${keys}]:`, path, err);
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        },
        undefined,
        (err) => {
          console.error(`Asset load error [${keys}]:`, path, err);
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

/** Release geometry/material on a registry clone (textures stay shared with the registry). */
export function disposeObject3DClone(root: Object3D): void {
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) m?.dispose();
    } else {
      mat?.dispose();
    }
  });
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

type MaybeTexturedMaterial = Material &
  Partial<Record<(typeof TEXTURE_SLOTS)[number], Texture | null>>;

/**
 * Traverse every Object3D in `registry` and release GPU-backed resources owned
 * by the original GLTF roots: geometries, materials, and the textures hung off
 * material slots. WeakSets dedupe shared refs so each resource is disposed at
 * most once per call. Safe to invoke after map prop / landmark teardown: those
 * subsystems either clone (map props) or share (landmark) the registry's
 * geometry+material objects, but three.js dispose is idempotent and the
 * WeakSets here only guard the registry pass itself.
 *
 * NOTE: textures are shared by reference across material slots and across
 * registry vs map-prop-cloned materials. Only call this at end-of-session
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
