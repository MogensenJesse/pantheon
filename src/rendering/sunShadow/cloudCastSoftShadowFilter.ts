// src/rendering/sunShadow/cloudCastSoftShadowFilter.ts — fixed-radius Vogel soft for cloud cast map
// @ts-nocheck — TSL node parameter typings incomplete in r185
import { reference, renderGroup } from 'three/tsl';
import { createVogelCoverageFilter } from './vogelCoverageFilterTsl';

/**
 * 12 taps at shipped softness 64. 24 covered a ~96 texel kernel;
 * fewer taps can ring in the penumbra.
 */
const SAMPLE_COUNT = 12;

/**
 * Compare-sampler Vogel PCF at `shadow.radius` (cloud cast softness — not PCSS / contact uniforms).
 * Fixed phi — temporal rotation would shimmer under wind drift.
 */
export const CloudCastSoftShadowFilter = createVogelCoverageFilter(SAMPLE_COUNT, ({ shadow }) =>
  reference('radius', 'float', shadow).setGroup(renderGroup),
);
