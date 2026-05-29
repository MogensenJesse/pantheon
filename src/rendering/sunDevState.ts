// src/rendering/sunDevState.ts — dev-panel sun azimuth
import { SUN_DEFAULTS } from './skyDefaults';

export const sunDevState = {
  azimuthDeg: SUN_DEFAULTS.azimuthDeg,
  lightDistance: SUN_DEFAULTS.lightDistance,
};

export function resetSunDevState(): void {
  sunDevState.azimuthDeg = SUN_DEFAULTS.azimuthDeg;
  sunDevState.lightDistance = SUN_DEFAULTS.lightDistance;
}
