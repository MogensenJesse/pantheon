// src/rendering/sunDevState.ts — sun rig (elevation/azimuth like webgpu_sky.html)
import { SUN_DEFAULTS } from './skyDefaults';

export const sunDevState = {
  elevationDeg: SUN_DEFAULTS.elevationDeg,
  azimuthDeg: SUN_DEFAULTS.azimuthDeg,
  lightDistance: SUN_DEFAULTS.lightDistance,
};

export function resetSunDevState(): void {
  sunDevState.elevationDeg = SUN_DEFAULTS.elevationDeg;
  sunDevState.azimuthDeg = SUN_DEFAULTS.azimuthDeg;
  sunDevState.lightDistance = SUN_DEFAULTS.lightDistance;
}
