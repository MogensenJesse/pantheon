// src/rendering/sunDevState.ts — dev-panel directional light distance
import { VISUAL } from '../config/visualTuning';

export const sunDevState: { lightDistance: number } = {
  lightDistance: VISUAL.sky.sun.lightDistance,
};

export function resetSunDevState(): void {
  sunDevState.lightDistance = VISUAL.sky.sun.lightDistance;
}
