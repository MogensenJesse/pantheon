// src/rendering/layers/waterReflectionLayers.ts — layer mask for slim water reflector pass
import type { Camera, Object3D, PerspectiveCamera } from 'three';
import type { NodeFrame } from 'three/webgpu';

/**
 * Layer used only by the water planar reflector virtual camera.
 * Sky + macro terrain are on layer 0 + this layer; reflection-only proxies use this layer alone.
 * Grass/props stay on layer 0 only.
 * Player orb, residue orbs, sparkles, and the guide ribbon opt into this layer.
 */
export const WATER_REFLECTION_LAYER = 2;

export const WATER_REFLECTION_LAYER_MASK = 1 << WATER_REFLECTION_LAYER;

/**
 * Main gameplay camera stays on layer 0 only.
 * Dual-tagged (0|2) objects remain visible via layer 0; reflection-only proxies (layer 2 alone)
 * must not be enabled here or they would draw in the main pass.
 */
export function enableWaterReflectionOnCamera(_camera: PerspectiveCamera): void {
  // Intentionally no-op — see comment above.
}

/** Tag an object (and descendants) for the water reflector without removing layer 0 visibility. */
export function enableWaterReflectionLayer(object: Object3D): void {
  object.traverse((node) => {
    node.layers.enable(WATER_REFLECTION_LAYER);
  });
}

/**
 * Reflection-pass only — disables layer 0 so the main camera never draws this object.
 * Used for cheap cloud cluster proxies in the planar reflector.
 */
export function enableWaterReflectionOnlyLayer(object: Object3D): void {
  object.traverse((node) => {
    node.layers.disable(0);
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
  updateBefore: (frame: NodeFrame) => boolean | undefined;
};

/**
 * Restrict the reflector's virtual camera to WATER_REFLECTION_LAYER so grass/props are not re-drawn.
 *
 * Also keeps the reflector's nested render from poisoning the main pass's pipeline keys. That render sees no
 * lights (they are on layer 0 only), and three caches the scene's environment key per `info.calls`; a nested
 * render leaves `info.calls` unchanged for the rest of the main pass, so every object drawn after the water
 * got the no-lights key. Under the surface the reflector skips its render, so those objects flipped back to
 * the real key and every transparent object (sun, clouds, particles, beacons) rebuilt its pipeline, with
 * shader modules recompiled, on each crossing. Bumping the counter makes the next draw recompute the key.
 */
export function patchReflectorVirtualCameraLayers(reflector: ReflectorBase): void {
  const original = reflector.getVirtualCamera.bind(reflector);
  reflector.getVirtualCamera = (camera: Camera) => {
    const virtual = original(camera);
    virtual.layers.mask = WATER_REFLECTION_LAYER_MASK;
    return virtual;
  };
  const updateBefore = reflector.updateBefore.bind(reflector);
  reflector.updateBefore = (frame: NodeFrame) => {
    const result = updateBefore(frame);
    // `calls` is typed read-only; it is only a counter.
    const info = frame.renderer?.info as { calls: number } | undefined;
    if (info) info.calls++;
    return result;
  };
}
