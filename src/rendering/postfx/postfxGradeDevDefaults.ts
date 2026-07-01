// src/rendering/postfx/postfxGradeDevDefaults.ts — DEV grade tunables reset
import { VISUAL } from '../../config/visualTuning';
import type { PostFxGradeDevSettings } from '../../core/GameState';

export function resetPostFxGradeDev(target: PostFxGradeDevSettings): void {
  Object.assign(target, structuredClone(VISUAL.postfx.grade));
}
