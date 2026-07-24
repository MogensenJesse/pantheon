// src/world/water/sync/waterCoastProximity.ts — horizontal distance from player to nearest submerged terrain
import { VISUAL } from '../../../config/visualTuning';

const { coastProbeDirs, coastProbeStepM, coastMaxSearchM } = VISUAL.water.adaptive;

/**
 * Returns horizontal distance (m) from (px, pz) to the nearest point where macro terrain
 * is at or below the water surface. When the player stands over water, returns 0.
 * If no water is found within the search radius, returns `coastMaxSearchM + 1`.
 */
export function coastDistanceM(
  px: number,
  pz: number,
  getWorldY: (x: number, z: number) => number,
  waterY: number,
): number {
  if (getWorldY(px, pz) <= waterY) {
    return 0;
  }

  const dirs = coastProbeDirs;
  const stepM = coastProbeStepM;
  const maxSearchM = coastMaxSearchM;

  for (let r = stepM; r <= maxSearchM; r += stepM) {
    for (let d = 0; d < dirs; d++) {
      const angle = (d / dirs) * Math.PI * 2;
      const x = px + Math.cos(angle) * r;
      const z = pz + Math.sin(angle) * r;
      if (getWorldY(x, z) <= waterY) {
        return r;
      }
    }
  }

  return maxSearchM + 1;
}
