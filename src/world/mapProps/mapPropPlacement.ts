// src/world/mapProps/mapPropPlacement.ts — authored map prop instance transforms
export interface MapPropPlacement {
  x: number;
  z: number;
  yRotation: number;
  scale: number;
  instanceIndex: number;
}

/** @deprecated Use MapPropPlacement */
export type Placement = MapPropPlacement;
