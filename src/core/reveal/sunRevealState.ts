// src/core/reveal/sunRevealState.ts — shared animated sun position (leaf module, no PostFX/rendering deps)
import { VISUAL } from '../../config/visualTuning';
import { NIGHT_BASELINE_ELEVATION_DEG } from '../../rendering/sky/skyDefaults';

/**
 * Animated sun position (degrees), shared by the game loop, day cycle, and sun-direction math.
 * Kept in its own leaf module (no PostFX/pipeline imports) so `sunSpherical.ts` can read it
 * without creating an import cycle back through `WorldReveal.ts` -> `PostFX.ts`.
 */
export const sunRevealState: { elevationDeg: number; azimuthDeg: number } = {
  elevationDeg: NIGHT_BASELINE_ELEVATION_DEG,
  azimuthDeg: VISUAL.sky.cycle.azimuthEast,
};
