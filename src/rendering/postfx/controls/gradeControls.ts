// src/rendering/postfx/controls/gradeControls.ts — procedural color grade + LUT tunables
import type { Color, Texture } from 'three';
import { devSettings } from '../../../core/GameState';
import type { PostFxGradeRegionScalars, PostFxGradeScalars } from '../../PostFX';
import {
  createPostGradeUniforms,
  type PostGradeRegionUniforms,
  type PostGradeUniforms,
  setPostGradeLutTexture,
} from '../postGrade';

function applyRegion(
  uniforms: PostGradeRegionUniforms,
  partial: Partial<PostFxGradeRegionScalars> | undefined,
): void {
  if (!partial) return;
  if (partial.saturation !== undefined) uniforms.saturation.value = partial.saturation;
  if (partial.contrast !== undefined) uniforms.contrast.value = partial.contrast;
  if (
    partial.liftR !== undefined ||
    partial.liftG !== undefined ||
    partial.liftB !== undefined
  ) {
    const lift = uniforms.lift.value as Color;
    if (partial.liftR !== undefined) lift.r = partial.liftR;
    if (partial.liftG !== undefined) lift.g = partial.liftG;
    if (partial.liftB !== undefined) lift.b = partial.liftB;
  }
}

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
      applyRegion(gradeUniforms.shadows, scalars.shadows);
      applyRegion(gradeUniforms.midtones, scalars.midtones);
      applyRegion(gradeUniforms.highlights, scalars.highlights);
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
