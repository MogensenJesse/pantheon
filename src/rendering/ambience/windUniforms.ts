// src/rendering/ambience/windUniforms.ts — the shader side of the one wind that grass, flowers, trees and smoke share
//
// Written once a frame by `ambienceView`. The grass system's own wind uniforms (`grassSharedUniforms`) use these
// same nodes for direction and boost, so nothing else decides which way the wind blows.

import { Vector2 } from 'three';
import { uniform } from 'three/tsl';
import { ambience } from './ambienceState';

export const windUniforms = {
  /** Unit direction the wind blows toward, in (x, z). The cloud heading until the first frame sets it. */
  uWindDirection: uniform(new Vector2(ambience.windDirX, ambience.windDirZ)),
  /** Render-rate wind clock (s): smooth, stops while paused, and is written on maps without grass too. */
  uWindClock: uniform(0),
  /** Wind strength over calm (1 = calm weather). */
  uWindBoost: uniform(1),
};
