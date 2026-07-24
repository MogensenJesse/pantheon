// src/world/water/mesh/pantheonWaterTypes.ts — shared runtime API for reflective + cheap water meshes
import type { Color, Mesh, Vector3 } from 'three';
import type { WaterShoreUniforms } from '../material/waterShoreUniforms';

export interface PantheonWaterSyncTarget {
  readonly isWaterMesh: true;
  resolutionScale: number;
  /** Reflective tier only — adaptive quality updates resolutionScale on this node. */
  waterReflector?: { resolutionScale: number } | null;
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
