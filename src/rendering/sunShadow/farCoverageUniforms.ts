// src/rendering/sunShadow/farCoverageUniforms.ts — live far-map CoverageShadowFilter radius
import { uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

const L = VISUAL.shadows.lighting;

/** Shared by CoverageShadowFilter — DEV slider writes live. */
export const farCoverageUniforms = {
  uFarCoverageRadiusTexels: uniform(L.farCoverageRadiusTexels),
};

export function readFarCoverageRadiusTexels(): number {
  return farCoverageUniforms.uFarCoverageRadiusTexels.value as number;
}

export function setFarCoverageRadiusTexels(radiusTexels: number): void {
  farCoverageUniforms.uFarCoverageRadiusTexels.value = radiusTexels;
}

export function resetFarCoverageRadiusTexels(): void {
  setFarCoverageRadiusTexels(L.farCoverageRadiusTexels);
}
