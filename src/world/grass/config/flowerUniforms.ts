// src/world/grass/config/flowerUniforms.ts — flower field layout uniforms

import { uniform } from 'three/tsl';
import type { FlowerRingDerived } from './flowerConfig';

type FloatUniform = ReturnType<typeof uniform<'float'>>;

export interface FlowerRingUniforms {
  uFlowersPerSide: FloatUniform;
  uOuterRadius: FloatUniform;
  uTileSize: FloatUniform;
}

export function applyFlowerRingUniforms(
  ringUniforms: FlowerRingUniforms,
  layout: FlowerRingDerived,
): void {
  ringUniforms.uFlowersPerSide.value = layout.flowersPerSide;
  ringUniforms.uOuterRadius.value = layout.outerRadius;
  ringUniforms.uTileSize.value = layout.tileSize;
}

export function createFlowerRingUniforms(layout: FlowerRingDerived): FlowerRingUniforms {
  const ringUniforms: FlowerRingUniforms = {
    uFlowersPerSide: uniform(layout.flowersPerSide),
    uOuterRadius: uniform(layout.outerRadius),
    uTileSize: uniform(layout.tileSize),
  };
  applyFlowerRingUniforms(ringUniforms, layout);
  return ringUniforms;
}
