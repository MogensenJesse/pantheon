// src/world/water/pantheonWaterTypes.ts — shared runtime API for reflective + cheap water meshes
import type { Color, Mesh, Vector3 } from 'three';
import type { WaterShoreUniforms } from './waterShoreUniforms';

export interface PantheonWaterSyncTarget {
  readonly isWaterMesh: true;
  resolutionScale: number;
  /** 0–1 runtime reflection strength (reflective tier only). */
  reflectorWeight: number;
  uReflectorWeight?: { value: number };
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
