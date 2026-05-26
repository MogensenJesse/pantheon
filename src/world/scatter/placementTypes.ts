// src/world/scatter/placementTypes.ts — shared scatter placement types
export interface Placement {
  x: number;
  z: number;
  yRotation: number;
  scale: number;
  instanceIndex: number;
}

export interface PlacementRules {
  count: number;
  heightMin: number;
  heightMax: number;
  minSpacing: number;
  landmarkClearance: number;
  scaleMin: number;
  scaleMax: number;
  surfaceLift?: number;
  region?: { centerX: number; centerZ: number; radius: number };
  pathCorridor?: boolean;
  pathExclusionRadius?: number;
}

export interface ScatterEntry {
  key: string;
  weight: number;
}

export interface ScatterConfig extends PlacementRules {
  entries: readonly ScatterEntry[];
}

export interface InstancedGroup {
  mesh: import('three').InstancedMesh;
  placements: Placement[];
  surfaceLift: number;
  isGrass?: boolean;
  cullCenterX?: number;
  cullCenterZ?: number;
}
