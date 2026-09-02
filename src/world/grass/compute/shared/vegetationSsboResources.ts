// src/world/grass/compute/shared/vegetationSsboResources.ts — shared SSBO indirect + visibility setup
import type { DataTexture } from 'three';
import { float, instancedArray, storage, texture, uint } from 'three/tsl';
import type { ComputeNode } from 'three/webgpu';
import { IndirectStorageBufferAttribute } from 'three/webgpu';
import { grassSharedUniforms } from '../../config/grassUniforms';
import type { TslNode } from '../../tsl/tslNode';
import {
  createAppendCompact,
  createComputeInitIndirect,
  vegetationDrawIndirectStruct,
} from './vegetationIndirectTsl';
import {
  createBuildVisibility,
  createInAnnulusMask,
  createPropGrassInfluence,
  createSampleGrassClump,
  createSampleGrassData,
  createTransitionStrength,
  type VegetationVisibilitySample,
} from './vegetationVisibilityTsl';

export interface VegetationIndirectResources {
  visibleIndices: TslNode;
  drawIndirectAttr: IndirectStorageBufferAttribute;
  drawStorage: TslNode;
  appendCompact: (isVisible: TslNode) => void;
  computeInitIndirect: ComputeNode;
  slotCount: TslNode;
}

/** Indirect draw buffer, visible-index SSBO, and compaction helpers shared by grass + flowers. */
export function createVegetationIndirectResources(
  instanceCount: number,
  indexCount: number,
): VegetationIndirectResources {
  const visibleIndices = instancedArray(instanceCount, 'uint');
  const drawIndirectAttr = new IndirectStorageBufferAttribute(new Uint32Array(5), 5);
  const drawStorage = storage(drawIndirectAttr, vegetationDrawIndirectStruct, 1);
  return {
    visibleIndices,
    drawIndirectAttr,
    drawStorage,
    appendCompact: createAppendCompact(drawStorage, visibleIndices),
    computeInitIndirect: createComputeInitIndirect(drawStorage, indexCount),
    slotCount: uint(instanceCount),
  };
}

export interface VegetationVisibilityContext {
  inAnnulusMask: (offsetX: TslNode, offsetZ: TslNode) => TslNode;
  transitionStrength: (grassWeight: TslNode) => TslNode;
  sampleGrassData: (
    worldX: TslNode,
    worldZ: TslNode,
  ) => {
    heightNorm: TslNode;
    grassWeight: TslNode;
    yOffset: TslNode;
    clump: TslNode;
  };
  sampleGrassClump: (worldX: TslNode, worldZ: TslNode) => TslNode;
  buildVisibility: (sample: VegetationVisibilitySample) => {
    visible: TslNode;
    reason: TslNode;
  };
}

/** Shared annulus mask, biome transition, height sample, and frustum visibility for compact kernels. */
export function createVegetationVisibilityContext(params: {
  grassDataMap: DataTexture;
  uInnerRadius: TslNode;
  uOuterRadius: TslNode;
  uWorldSize: TslNode;
  uHeightScale: TslNode;
  uSurfaceBias: TslNode;
  grassThreshold: TslNode;
  fadeWidth: TslNode;
  frustumBoundsRadius: TslNode;
  uRingFadeBandM?: TslNode;
  uRingFadeInBandM?: TslNode;
  propExclusionMap: DataTexture;
  sampleTerrainSurfaceY: (worldXZ: TslNode) => TslNode;
}): VegetationVisibilityContext {
  const grassDataTex = texture(params.grassDataMap);
  const propExclusionTex = texture(params.propExclusionMap);
  const fadeBand = params.uRingFadeBandM ?? float(0);
  const fadeInBand = params.uRingFadeInBandM ?? float(0);
  const inAnnulusMask = createInAnnulusMask(
    params.uInnerRadius,
    params.uOuterRadius,
    fadeBand,
    fadeInBand,
  );
  const transitionStrength = createTransitionStrength(params.grassThreshold, params.fadeWidth);
  const sampleGrassData = createSampleGrassData(
    grassDataTex,
    params.uWorldSize,
    params.uHeightScale,
    params.uSurfaceBias,
    params.sampleTerrainSurfaceY,
  );
  const sampleGrassClump = createSampleGrassClump(grassDataTex, params.uWorldSize);
  const propGrassInfluenceFn = createPropGrassInfluence(propExclusionTex, params.uWorldSize);
  const buildVisibility = createBuildVisibility({
    frustumBoundsRadius: params.frustumBoundsRadius,
    propGrassInfluence: propGrassInfluenceFn,
    uPropGrassCullThreshold: grassSharedUniforms.uPropGrassCullThreshold as TslNode,
  });
  return { inAnnulusMask, transitionStrength, sampleGrassData, sampleGrassClump, buildVisibility };
}
