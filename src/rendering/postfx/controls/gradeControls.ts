// src/rendering/postfx/controls/gradeControls.ts — procedural color grade + LUT tunables
import type { Color, Texture } from 'three';
import { devSettings } from '../../../core/GameState';
import type { PostFxGradeScalars } from '../../PostFX';
import {
  createPostGradeUniforms,
  type PostGradeUniforms,
  setPostGradeLutTexture,
} from '../postGrade';

/** Procedural color grade + LUT tunables (applied after `renderOutput`, before DoF). */
export function createGradeControls() {
  const gradeUniforms: PostGradeUniforms = createPostGradeUniforms();
  let gradeEnabledBySync = gradeUniforms.uGradeEnabled.value as number;
  let lutEnabledBySync = gradeUniforms.uLutEnabled.value as number;

  /**
   * Applies synced enable flags. Perf **Disable grade** zeros procedural grade *and* LUT
   * so the isolate still kills the whole display-referred stack.
   */
  const applyDebug = () => {
    if (import.meta.env.DEV && devSettings.renderDebug.disableGrade) {
      gradeUniforms.uGradeEnabled.value = 0;
      gradeUniforms.uLutEnabled.value = 0;
      return;
    }
    gradeUniforms.uGradeEnabled.value = gradeEnabledBySync;
    gradeUniforms.uLutEnabled.value = lutEnabledBySync;
  };

  return {
    gradeUniforms,
    setGradeScalars: (scalars: PostFxGradeScalars) => {
      if (scalars.enabled !== undefined) {
        gradeEnabledBySync = scalars.enabled;
      }
      if (scalars.saturation !== undefined) {
        gradeUniforms.uGradeSaturation.value = scalars.saturation;
      }
      if (scalars.contrast !== undefined) {
        gradeUniforms.uGradeContrast.value = scalars.contrast;
      }
      if (
        scalars.liftR !== undefined ||
        scalars.liftG !== undefined ||
        scalars.liftB !== undefined
      ) {
        const lift = gradeUniforms.uGradeLift.value as Color;
        if (scalars.liftR !== undefined) lift.r = scalars.liftR;
        if (scalars.liftG !== undefined) lift.g = scalars.liftG;
        if (scalars.liftB !== undefined) lift.b = scalars.liftB;
      }
      if (scalars.warmth !== undefined) {
        gradeUniforms.uGradeWarmth.value = scalars.warmth;
      }
      if (scalars.warmthTint !== undefined) {
        (gradeUniforms.uGradeWarmthTint.value as Color).set(scalars.warmthTint);
      }
      if (scalars.lutEnabled !== undefined) {
        lutEnabledBySync = scalars.lutEnabled;
      }
      if (scalars.lutStrength !== undefined) {
        gradeUniforms.uLutStrength.value = scalars.lutStrength;
      }
      applyDebug();
    },
    setGradeLut: (lutTexture: Texture | null, size?: number) => {
      setPostGradeLutTexture(gradeUniforms, lutTexture);
      if (size !== undefined) {
        gradeUniforms.uLutSize.value = size;
      }
    },
    applyDebug,
  };
}
