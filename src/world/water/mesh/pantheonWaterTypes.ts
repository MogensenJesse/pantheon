// src/world/water/mesh/pantheonWaterTypes.ts — shared runtime API for reflective + cheap water meshes
import type { Color, Mesh, Object3D, Vector3 } from 'three';
import type { WaterShoreUniforms } from '../material/waterShoreUniforms';

export interface PantheonWaterSyncTarget {
  readonly isWaterMesh: true;
  resolutionScale: number;
  /** Reflective tier only — adaptive quality updates resolutionScale on this node. */
  waterReflector?: { resolutionScale: number } | null;
  /**
   * Reflective tier only — the reflector's mirror/clip plane object, parented to the water mesh.
   * Local +Z maps to world +Y (mesh is rotated -PI/2 on X), so `position.z` shifts plane height.
   */
  reflectorTarget?: Object3D | null;
  sunDirection: { value: Vector3 };
  waterColor: { value: Color };
  sunColor: { value: Color };
  distortionScale: { value: number };
  size: { value: number };
  alpha: { value: number };
  uSunIntensity: { value: number };
  uShadowFloor: { value: number };
  /** Shore-depth GPU uniforms when play water was built with height map. */
  shoreUniforms?: WaterShoreUniforms | null;
}

export type PantheonWaterInstance = Mesh & PantheonWaterSyncTarget;
