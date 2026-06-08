// src/rendering/shadowCastConfig.ts — WebGPU-safe shadow cast setup
//
// Shadow pass calls _getShadowNodes() on the caster's material from the render list
// (snapshot at _projectObject time). Swapping mesh.material in onBeforeShadow is too
// late. Instead: normalize GLTF texture slots, then swap casters to a shared depth
// material in scene.onBeforeRender when scene.overrideMaterial is the shadow pass.

import type { Material, Mesh, Object3D, Scene } from 'three';
import { NodeMaterial } from 'three/webgpu';

const SHADOW_TEXTURE_SLOTS = [
  'map',
  'alphaMap',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
] as const;

const shadowCastMeshes = new Set<Mesh>();
const sceneHooksInstalled = new WeakSet<Scene>();

let shadowCastMaterial: NodeMaterial | null = null;

/** Single opaque depth material shared by all shadow casters (no textures, no custom nodes). */
export function getShadowCastMaterial(): NodeMaterial {
  if (!shadowCastMaterial) {
    shadowCastMaterial = new NodeMaterial();
    shadowCastMaterial.fog = false;
  }
  return shadowCastMaterial;
}

/** Coerce undefined texture slots to null (Three.js treats `undefined !== null` as hasMap). */
export function normalizeMaterialTextureSlots(material: Material | Material[]): void {
  const mats = Array.isArray(material) ? material : [material];
  for (const mat of mats) {
    const record = mat as unknown as Record<string, unknown>;
    for (const slot of SHADOW_TEXTURE_SLOTS) {
      if (record[slot] === undefined) {
        record[slot] = null;
      }
    }
  }
}

function isShadowPassRender(scene: Scene): boolean {
  const override = scene.overrideMaterial as { isShadowPassMaterial?: boolean } | null;
  return override?.isShadowPassMaterial === true;
}

/** Swap casters to depth material before shadow-camera render-list projection. */
export function installShadowCastSceneHooks(scene: Scene): void {
  if (sceneHooksInstalled.has(scene)) return;
  sceneHooksInstalled.add(scene);

  const prevBefore = scene.onBeforeRender;
  const prevAfter = scene.onAfterRender;

  scene.onBeforeRender = (...args) => {
    const sceneRef = args[1] as Scene;
    if (isShadowPassRender(sceneRef)) {
      const shared = getShadowCastMaterial();
      for (const mesh of shadowCastMeshes) {
        if (!mesh.castShadow) continue;
        mesh.material = shared;
      }
    }
    prevBefore?.(...args);
  };

  scene.onAfterRender = (...args) => {
    for (const mesh of shadowCastMeshes) {
      const visible = mesh.userData.__shadowVisibleMaterial as Material | Material[] | undefined;
      if (visible !== undefined) {
        mesh.material = visible;
      }
    }
    prevAfter?.(...args);
  };
}

/** Prepare a mesh for sun shadow-map casting on WebGPU. */
export function configureMeshShadowCast(mesh: Mesh): void {
  if (mesh.userData.__shadowCastConfigured) return;
  mesh.userData.__shadowCastConfigured = true;

  normalizeMaterialTextureSlots(mesh.material);
  mesh.userData.__shadowVisibleMaterial = mesh.material;
  shadowCastMeshes.add(mesh);
}

/** Walk a subtree and configure every mesh that casts shadows. */
export function configureObjectShadowCast(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh || !mesh.castShadow) return;
    configureMeshShadowCast(mesh);
  });
}
