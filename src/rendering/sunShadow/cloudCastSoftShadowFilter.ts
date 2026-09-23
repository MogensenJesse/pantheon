// src/rendering/sunShadow/cloudCastSoftShadowFilter.ts — fixed-radius Vogel soft for cloud cast map
// @ts-nocheck — TSL node parameter typings incomplete in r185
import { reference, renderGroup } from 'three/tsl';
import { createVogelCoverageFilter } from './vogelCoverageFilterTsl';

/** Dense enough for castShadowSoftness ≈ 96 texels without sparse ring banding. */
const SAMPLE_COUNT = 24;

/**
 * Compare-sampler Vogel PCF at `shadow.radius` (cloud cast softness — not PCSS / contact uniforms).
 * Fixed phi — temporal rotation would shimmer under wind drift.
 */
export const CloudCastSoftShadowFilter = createVogelCoverageFilter(SAMPLE_COUNT, ({ shadow }) =>
  reference('radius', 'float', shadow).setGroup(renderGroup),
);
