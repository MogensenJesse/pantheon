// src/world/grass/config/flowerUniforms.ts — per-ring flower layout uniforms

import { uniform } from 'three/tsl';

export interface FlowerRingUniforms {
  uFlowersPerSide: ReturnType<typeof uniform>;
  uInnerRadius: ReturnType<typeof uniform>;
  uOuterRadius: ReturnType<typeof uniform>;
  uTileSize: ReturnType<typeof uniform>;
  uFadeBandM: ReturnType<typeof uniform>;
  uFadeInBandM: ReturnType<typeof uniform>;
}

export function createFlowerRingUniforms(layout: {
  flowersPerSide: number;
  innerRadius: number;
  outerRadius: number;
  tileSize: number;
  fadeBandM?: number;
  fadeInBandM?: number;
}): FlowerRingUniforms {
  return {
    uFlowersPerSide: uniform(layout.flowersPerSide),
    uInnerRadius: uniform(layout.innerRadius),
    uOuterRadius: uniform(layout.outerRadius),
    uTileSize: uniform(layout.tileSize),
    uFadeBandM: uniform(layout.fadeBandM ?? 0),
    uFadeInBandM: uniform(layout.fadeInBandM ?? 0),
  };
}

export function applyFlowerRingUniforms(
  ringUniforms: FlowerRingUniforms,
  layout: {
    flowersPerSide: number;
    innerRadius: number;
    outerRadius: number;
    tileSize: number;
    fadeBandM?: number;
    fadeInBandM?: number;
  },
): void {
  ringUniforms.uFlowersPerSide.value = layout.flowersPerSide;
  ringUniforms.uInnerRadius.value = layout.innerRadius;
  ringUniforms.uOuterRadius.value = layout.outerRadius;
  ringUniforms.uTileSize.value = layout.tileSize;
  ringUniforms.uFadeBandM.value = layout.fadeBandM ?? 0;
  ringUniforms.uFadeInBandM.value = layout.fadeInBandM ?? 0;
}
