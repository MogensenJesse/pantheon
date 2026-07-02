// src/world/water/disposePantheonWater.ts — tear down WaterMesh + planar reflector
import type { Material, Mesh, Object3D } from 'three';
import { resetWaterReflectionQualityState } from './updateWaterReflectionQuality';

/**
 * Disposes the WaterMesh geometry/material plus the planar reflector target the
 * material attaches as a child on first compile (mirrorSampler.target). Safe to
 * call on the plain Object3D the terrain context stores it as.
 */
export function disposePantheonWater(water: Object3D): void {
  resetWaterReflectionQualityState();
  water.traverse((obj) => {
    const mesh = obj as Mesh;
    if (mesh.isMesh) {
      mesh.geometry?.dispose();
      const mat = mesh.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) {
        for (const m of mat) m.dispose();
      } else mat?.dispose();
    }
    // Reflector render targets expose dispose() on the node/target object.
    const disposable = obj as unknown as { dispose?: () => void };
    if (!('isMesh' in obj) && typeof disposable.dispose === 'function') {
      disposable.dispose();
    }
  });
}
