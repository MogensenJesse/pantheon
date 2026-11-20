// src/world/water/sync/syncWaterWaves.ts — the water disc follows the camera, so its fine rings are where the swell is seen
import type { Object3D } from 'three';

/** Moves the disc under the camera in x and z (the swell is anchored in the world, not to the mesh). */
export function followCameraWithWater(water: Object3D, camera: Object3D): void {
  water.position.x = camera.position.x;
  water.position.z = camera.position.z;
}
