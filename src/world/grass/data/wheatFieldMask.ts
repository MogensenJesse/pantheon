// src/world/grass/data/wheatFieldMask.ts — wheat fields in the grass data map: B = 0 outside, floor..1 by ripeness inside
import { WORLD } from '../../../config/world';
import type { GridDirtyRegion } from '../../../map/authoring/gridDirtyRegion';

/** A rectangular plot (centre, yaw like the village's frames, half sides) and how ripe its wheat is, 0..1. */
export interface WheatField {
  id: number;
  x: number;
  z: number;
  rotY: number;
  halfW: number;
  halfD: number;
  ripeness: number;
}

/** Value of the B channel (0..1) for unripe wheat; anything above the edge test counts as field. */
export const WHEAT_FLOOR = 0.12;
const CHANNEL = 2;
const STRIDE = 4;

export function wheatByte(ripeness: number): number {
  const r = Math.max(0, Math.min(1, ripeness));
  return Math.round(255 * (WHEAT_FLOOR + (1 - WHEAT_FLOOR) * r));
}

/**
 * Write a field's rectangle into the B channel of the RGBA8 grass data (a texel grid spanning the world).
 * Returns the texel rectangle that changed, for a partial upload; null when the plot lies off the map.
 */
export function paintWheatField(
  data: Uint8Array,
  size: number,
  field: WheatField,
): GridDirtyRegion | null {
  const denom = Math.max(1, size - 1);
  const cos = Math.cos(field.rotY);
  const sin = Math.sin(field.rotY);
  const reach = Math.abs(field.halfW * cos) + Math.abs(field.halfD * sin);
  const reachZ = Math.abs(field.halfW * sin) + Math.abs(field.halfD * cos);
  const toTexel = (world: number) => (world / WORLD.SIZE + 0.5) * denom;
  const iMin = Math.max(0, Math.floor(toTexel(field.x - reach)));
  const iMax = Math.min(size - 1, Math.ceil(toTexel(field.x + reach)));
  const jMin = Math.max(0, Math.floor(toTexel(field.z - reachZ)));
  const jMax = Math.min(size - 1, Math.ceil(toTexel(field.z + reachZ)));
  if (iMax < iMin || jMax < jMin) return null;
  const value = wheatByte(field.ripeness);
  for (let j = jMin; j <= jMax; j++) {
    const dz = (j / denom - 0.5) * WORLD.SIZE - field.z;
    for (let i = iMin; i <= iMax; i++) {
      const dx = (i / denom - 0.5) * WORLD.SIZE - field.x;
      // Inverse of the village's localToWorld.
      const lx = dx * cos - dz * sin;
      const lz = dx * sin + dz * cos;
      if (Math.abs(lx) <= field.halfW && Math.abs(lz) <= field.halfD) {
        data[(j * size + i) * STRIDE + CHANNEL] = value;
      }
    }
  }
  return { iMin, iMax, jMin, jMax };
}
