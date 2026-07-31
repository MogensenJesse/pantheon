// src/rendering/sunShadow/coverageShadowFilter.ts — cheap far-cascade Vogel PCF
// @ts-nocheck — TSL node parameter typings incomplete in r185
import { farCoverageUniforms } from './farCoverageUniforms';
import { createVogelCoverageFilter } from './vogelCoverageFilterTsl';

const SAMPLE_COUNT = 8;

/**
 * Small-radius Vogel PCF for the wide/far sun map (godrays, cloud receive, ground beyond near).
 * Radius from `farCoverageRadiusTexels` (live). Avoids stacking far soft PCSS over near contact.
 */
export const CoverageShadowFilter = createVogelCoverageFilter(
  SAMPLE_COUNT,
  farCoverageUniforms.uFarCoverageRadiusTexels,
);
