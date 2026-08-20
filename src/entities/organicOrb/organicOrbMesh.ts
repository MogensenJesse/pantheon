// src/entities/organicOrb/organicOrbMesh.ts — shared player/residue sphere geometry
import { SphereGeometry } from 'three';

export const ORGANIC_ORB_SPHERE_SEGMENTS = 32;

export function createOrganicOrbGeometry(radius: number): SphereGeometry {
  return new SphereGeometry(radius, ORGANIC_ORB_SPHERE_SEGMENTS, ORGANIC_ORB_SPHERE_SEGMENTS);
}
