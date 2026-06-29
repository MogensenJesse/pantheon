// src/world/water/waterReflectionLayers.ts — layer mask for slim water reflector pass
import type { Camera, Object3D, PerspectiveCamera } from 'three';

/**
 * Layer used only by the water planar reflector virtual camera.
 * Sky, terrain, and clouds are on layer 0 + this layer; grass/props/player stay on layer 0 only.
 */
export const WATER_REFLECTION_LAYER = 2;

export const WATER_REFLECTION_LAYER_MASK = 1 << WATER_REFLECTION_LAYER;

/** Enable the reflection layer on the main gameplay camera (layer 0 remains default). */
export function enableWaterReflectionOnCamera(camera: PerspectiveCamera): void {
  camera.layers.enable(WATER_REFLECTION_LAYER);
}

/** Tag an object (and descendants) for the water reflector without removing layer 0 visibility. */
export function enableWaterReflectionLayer(object: Object3D): void {
  object.traverse((node) => {
    node.layers.enable(WATER_REFLECTION_LAYER);
  });
}

/** Keep grass/props off the reflection layer (layer 0 only). */
export function disableWaterReflectionLayer(object: Object3D): void {
  object.traverse((node) => {
    node.layers.disable(WATER_REFLECTION_LAYER);
  });
}

type ReflectorBase = {
  getVirtualCamera: (camera: Camera) => Camera;
};

/**
 * Restrict the reflector's virtual camera to WATER_REFLECTION_LAYER so grass/props are not re-drawn.
 */
export function patchReflectorVirtualCameraLayers(reflector: ReflectorBase): void {
  const original = reflector.getVirtualCamera.bind(reflector);
  reflector.getVirtualCamera = (camera: Camera) => {
    const virtual = original(camera);
    virtual.layers.mask = WATER_REFLECTION_LAYER_MASK;
    return virtual;
  };
}
