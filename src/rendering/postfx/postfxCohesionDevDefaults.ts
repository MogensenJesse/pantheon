// src/rendering/postfx/postfxCohesionDevDefaults.ts — DEV cohesion tunables reset
import { VISUAL } from '../../config/visualTuning';
import type { PostFxCohesionDevSettings } from '../../core/GameState';

export function resetPostFxCohesionDev(target: PostFxCohesionDevSettings): void {
  Object.assign(target, structuredClone(VISUAL.postfx.cohesion));
}
