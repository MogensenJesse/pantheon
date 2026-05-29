// src/ui/dev/postFxDev.ts — DEV post-FX screen defaults (from visualTuning)
import { VISUAL } from '../../config/visualTuning';
import type { PostFXContext } from '../../rendering/PostFX';

export function resetPostFxDev(postFX: PostFXContext): void {
  postFX.setPixelSize(VISUAL.postFx.pixelSize);
  postFX.setColorLevels(VISUAL.postFx.colorLevels);
}
