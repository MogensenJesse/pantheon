// src/world/water/config/waterExtent.ts — play ocean diameter from map scale and view distance
import { CAMERA_FAR } from '../../../rendering/sceneConstants';
import { WORLD } from '../../WorldConfig';

/** World-fixed ocean disc diameter — must exceed visible range from peaks (endless horizon). */
export function playWaterPlaneDiameter(): number {
  // SIZE*8 still left a dark band under aurora from high lookouts; push past far plane harder.
  return Math.max(CAMERA_FAR * 3, WORLD.SIZE * 12);
}