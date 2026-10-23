// src/world/village/render/villageUniforms.ts — uniforms shared by the village materials
import { Vector2 } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';

/** Seconds, advanced by the village each frame. */
export const uVillageTime = uniform(0);
/** Window glow intensity: 0 by day, rising through dusk to 1 at night. */
export const uVillageGlow = uniform(0);
/** The wind the smoke drifts with (x, z), eased toward the real wind so a gust bends the plume instead of swinging it. */
export const uSmokeWind = uniform(new Vector2(-VISUAL.life.SMOKE_WIND.WIND_MUL, 0));
