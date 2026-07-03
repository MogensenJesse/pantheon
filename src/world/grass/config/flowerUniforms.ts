// src/world/grass/config/flowerUniforms.ts — per-ring flower layout uniforms

import { uniform } from 'three/tsl';

export interface FlowerRingUniforms {
  uFlowersPerSide: ReturnType<typeof uniform>;
  uInnerRadius: ReturnType<typeof uniform>;
  uOuterRadius: ReturnType<typeof uniform>;
  uTileSize: ReturnType<typeof uniform>;
}

export function createFlowerRingUniforms(layout: {
  flowersPerSide: number;
  innerRadius: number;
  outerRadius: number;
  tileSize: number;
}): FlowerRingUniforms {
  return {
    uFlowersPerSide: uniform(layout.flowersPerSide),
    uInnerRadius: uniform(layout.innerRadius),
    uOuterRadius: uniform(layout.outerRadius),
    uTileSize: uniform(layout.tileSize),
  };
}

export function applyFlowerRingUniforms(
  ringUniforms: FlowerRingUniforms,
  layout: {
    flowersPerSide: number;
    innerRadius: number;
    outerRadius: number;
    tileSize: number;
  },
): void {
  ringUniforms.uFlowersPerSide.value = layout.flowersPerSide;
  ringUniforms.uInnerRadius.value = layout.innerRadius;
  ringUniforms.uOuterRadius.value = layout.outerRadius;
  ringUniforms.uTileSize.value = layout.tileSize;
}
