// src/world/mapProps/mapPropPlacement.ts — authored map prop instance transforms
import type { MapEntity } from '../../map/MapTypes';

export interface MapPropPlacement {
  x: number;
  z: number;
  yRotation: number;
  scale: number;
  /** Authored vertical offset above terrain surface (metres). */
  surfaceLift: number;
}

export function entityToPlacement(e: Extract<MapEntity, { type: 'prop' }>): MapPropPlacement {
  return {
    x: e.x,
    z: e.z,
    yRotation: e.rotY,
    scale: e.scale,
    surfaceLift: e.surfaceLift ?? 0,
  };
}
