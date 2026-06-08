// src/world/water/pantheonWaterTypes.ts — shared runtime API for reflective + cheap water meshes
import type { Color, Mesh, Vector3 } from 'three';

export interface PantheonWaterSyncTarget {
  readonly isWaterMesh: true;
  resolutionScale: number;
  sunDirection: { value: Vector3 };
  waterColor: { value: Color };
  sunColor: { value: Color };
  distortionScale: { value: number };
  size: { value: number };
  alpha: { value: number };
}

export type PantheonWaterInstance = Mesh & PantheonWaterSyncTarget;
