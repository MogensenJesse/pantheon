// src/world/mapProps/mapPropPlacement.ts — authored map prop instance transforms
export interface MapPropPlacement {
  x: number;
  z: number;
  yRotation: number;
  scale: number;
  /** Authored vertical offset above terrain surface (metres). */
  surfaceLift: number;
}
