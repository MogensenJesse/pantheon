// src/rendering/postfx/syncPostFxGrade.ts — per-frame elevation-driven post-grade sync
import type { PostFXContext } from '../PostFX';
import { samplePostFxGrade } from './postfxGrade';

/** Single entry: procedural grade scalars keyed on sun elevation. */
export function syncPostFxGrade(postFX: PostFXContext, elevationDeg: number): void {
  const sample = samplePostFxGrade(elevationDeg);
  postFX.setGradeScalars(sample);
}
