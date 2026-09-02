// src/world/grass/config/flowerUniforms.ts — per-ring flower layout uniforms

import { uniform } from 'three/tsl';
import type { FlowerRingDerived } from './flowerConfig';

export interface FlowerRingUniforms {
  uFlowersPerSide: ReturnType<typeof uniform>;
  uInnerRadius: ReturnType<typeof uniform>;
  uOuterRadius: ReturnType<typeof uniform>;
  uTileSize: ReturnType<typeof uniform>;
  uFadeBandM: ReturnType<typeof uniform>;
  uFadeInBandM: ReturnType<typeof uniform>;
}

export function applyFlowerRingUniforms(
  ringUniforms: FlowerRingUniforms,
  layout: FlowerRingDerived,
): void {
  ringUniforms.uFlowersPerSide.value = layout.flowersPerSide;
  ringUniforms.uInnerRadius.value = layout.innerRadius;
  ringUniforms.uOuterRadius.value = layout.outerRadius;
  ringUniforms.uTileSize.value = layout.tileSize;
  ringUniforms.uFadeBandM.value = layout.fadeBandM;
  ringUniforms.uFadeInBandM.value = layout.fadeInBandM;
}

export function createFlowerRingUniforms(layout: FlowerRingDerived): FlowerRingUniforms {
  const ringUniforms: FlowerRingUniforms = {
    uFlowersPerSide: uniform(layout.flowersPerSide),
    uInnerRadius: uniform(layout.innerRadius),
    uOuterRadius: uniform(layout.outerRadius),
    uTileSize: uniform(layout.tileSize),
    uFadeBandM: uniform(layout.fadeBandM),
    uFadeInBandM: uniform(layout.fadeInBandM),
  };
  applyFlowerRingUniforms(ringUniforms, layout);
  return ringUniforms;
}
