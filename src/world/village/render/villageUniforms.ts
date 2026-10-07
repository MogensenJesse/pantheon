// src/world/village/render/villageUniforms.ts — uniforms shared by the village materials
import { uniform } from 'three/tsl';

/** Seconds, advanced by the village each frame. */
export const uVillageTime = uniform(0);
/** Window glow intensity: 0 by day, rising through dusk to 1 at night. */
export const uVillageGlow = uniform(0);
