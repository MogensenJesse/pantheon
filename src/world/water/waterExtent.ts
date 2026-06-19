// src/world/water/waterExtent.ts — play ocean diameter from map scale and view distance
import { CAMERA_FAR } from '../../rendering/sceneConstants';
import { WORLD } from '../WorldConfig';

/** World-fixed ocean disc diameter — must exceed visible range from peaks and hide behind fog. */
export function playWaterPlaneDiameter(): number {
  return Math.max(CAMERA_FAR * 1.5, WORLD.SIZE * 8);
}
