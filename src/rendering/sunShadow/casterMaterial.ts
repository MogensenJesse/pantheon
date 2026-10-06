// src/rendering/sunShadow/casterMaterial.ts — WebGPU-safe sun shadow caster depth material
//
// Caster-side (shadow map projection). Receivers live in syncSunShadowReceivers + sunShadowTsl.
//
// Shadow pass calls _getShadowNodes() on the caster's material from the render list
// (snapshot at _projectObject time). Swapping mesh.material in onBeforeShadow is too
// late. Instead: normalize GLTF texture slots, then swap casters to a shared depth
// material in scene.onBeforeRender when scene.overrideMaterial is the shadow pass.

import type { Camera, Material, Mesh, Scene } from 'three';
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
/** Shadow cameras whose casters use their `coarse` material when they have one. */
const coarseShadowCameras = new WeakSet<Camera>();

/** Whole-map cascade texels are metres wide: cutout casters point-sample needles and sparkle per bake. */
export function registerCoarseShadowCamera(camera: Camera): void {
  coarseShadowCameras.add(camera);
}

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
      const coarse = coarseShadowCameras.has(args[2] as Camera);
      for (const mesh of shadowCastMeshes) {
        if (!mesh.castShadow) continue;
        const custom = mesh.userData.__shadowCastMaterial as Material | Material[] | undefined;
        const coarseCustom = coarse
          ? (mesh.userData.__shadowCastMaterialCoarse as Material | Material[] | undefined)
          : undefined;
        mesh.material = coarseCustom ?? custom ?? shared;
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

interface ShadowCasterMaterials {
  /** Foliage cutout caster for the far / near / cloud shadow passes. */
  cast?: Material | Material[];
  /** Mip-averaged caster for coarse shadow cameras (world cascade). */
  coarse?: Material | Material[];
}

/**
 * Prepare a mesh for sun shadow-map casting on WebGPU. `casters` swap in only during shadow
 * passes, so the visible material can still sample `shadow(sun)` without a usage conflict.
 */
export function configureMeshShadowCast(mesh: Mesh, casters: ShadowCasterMaterials = {}): void {
  if (!mesh.userData.__shadowCastConfigured) {
    mesh.userData.__shadowCastConfigured = true;
    normalizeMaterialTextureSlots(mesh.material);
    mesh.userData.__shadowVisibleMaterial = mesh.material;
    shadowCastMeshes.add(mesh);
  }
  for (const [key, material] of [
    ['__shadowCastMaterial', casters.cast],
    ['__shadowCastMaterialCoarse', casters.coarse],
  ] as const) {
    if (material) mesh.userData[key] = material;
    else delete mesh.userData[key];
  }
}

/** Drop a mesh from the shadow-pass material swap set (call on dispose / rebuild). */
export function unregisterMeshShadowCast(mesh: Mesh): void {
  shadowCastMeshes.delete(mesh);
  delete mesh.userData.__shadowCastConfigured;
  delete mesh.userData.__shadowVisibleMaterial;
  delete mesh.userData.__shadowCastMaterial;
  delete mesh.userData.__shadowCastMaterialCoarse;
}
