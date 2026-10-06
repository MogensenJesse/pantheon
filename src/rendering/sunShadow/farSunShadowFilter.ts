// src/rendering/sunShadow/farSunShadowFilter.ts — far-map Vogel PCF filter + its live radius
// @ts-nocheck — TSL node parameter typings incomplete in three r186
import type { DirectionalLight } from 'three';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { createVogelPcfFilter } from './vogelPcfFilter';

const SAMPLE_COUNT = 8;

/** DEV slider writes this live. */
const uFarCoverageRadiusTexels = uniform(VISUAL.shadows.lighting.farCoverageRadiusTexels);

/** Small-radius PCF: the near cascade owns contact softness, so the far map must not stack more. */
const FarCoverageShadowFilter = createVogelPcfFilter(SAMPLE_COUNT, uFarCoverageRadiusTexels);

export function configureFarSunShadowFilter(light: DirectionalLight): void {
  light.shadow.filterNode = FarCoverageShadowFilter;
}

export function readFarCoverageRadiusTexels(): number {
  return uFarCoverageRadiusTexels.value as number;
}

export function setFarCoverageRadiusTexels(radiusTexels: number): void {
  uFarCoverageRadiusTexels.value = radiusTexels;
}
