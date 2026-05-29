// src/rendering/sunDevState.ts — dev-panel sun azimuth
import { VISUAL } from '../config/visualTuning';

export const sunDevState: { azimuthDeg: number; lightDistance: number } = {
  azimuthDeg: VISUAL.sky.sun.azimuthDeg,
  lightDistance: VISUAL.sky.sun.lightDistance,
};

export function resetSunDevState(): void {
  sunDevState.azimuthDeg = VISUAL.sky.sun.azimuthDeg;
  sunDevState.lightDistance = VISUAL.sky.sun.lightDistance;
}
