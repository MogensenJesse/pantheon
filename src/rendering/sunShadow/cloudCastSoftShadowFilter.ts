// src/rendering/sunShadow/cloudCastSoftShadowFilter.ts — fixed-radius Vogel soft for cloud cast map
// @ts-nocheck — TSL node parameter typings incomplete in three r186
import { reference, renderGroup } from 'three/tsl';
import { createVogelPcfFilter } from './vogelPcfFilter';

/** Fewer taps ring in the penumbra at the shipped softness. */
const SAMPLE_COUNT = 12;

/**
 * Compare-sampler Vogel PCF at `shadow.radius` (cloud cast softness — not PCSS / contact uniforms).
 * Fixed phi — temporal rotation would shimmer under wind drift.
 */
export const CloudCastSoftShadowFilter = createVogelPcfFilter(SAMPLE_COUNT, ({ shadow }) =>
  reference('radius', 'float', shadow).setGroup(renderGroup),
);
