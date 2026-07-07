// src/world/grass/compute/shared/vegetationSsboResources.ts — shared SSBO indirect + visibility setup
import type { DataTexture } from 'three';
import { instancedArray, storage, texture, uint } from 'three/tsl';
import { IndirectStorageBufferAttribute } from 'three/webgpu';
import type { TslNode } from '../../tsl/tslNode';
import {
  createAppendCompact,
  createComputeInitIndirect,
  vegetationDrawIndirectStruct,
} from './vegetationIndirectTsl';
import {
  createBuildVisibility,
  createInAnnulusMask,
  createSampleGrassData,
  createTransitionStrength,
} from './vegetationVisibilityTsl';
import type { ComputeNode } from 'three/webgpu';

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
  sampleGrassData: (worldX: TslNode, worldZ: TslNode) => {
    heightNorm: TslNode;
    grassWeight: TslNode;
    yOffset: TslNode;
    surfaceXZ: TslNode;
  };
  buildVisibility: (
    offsetX: TslNode,
    offsetZ: TslNode,
    yOffset: TslNode,
    grassWeight: TslNode,
  ) => { visible: TslNode; reason: TslNode; outsideAnn: TslNode };
}

/** Shared annulus mask, biome transition, height sample, and frustum visibility for compact kernels. */
export function createVegetationVisibilityContext(params: {
  grassDataMap: DataTexture;
  uInnerRadius: TslNode;
  uOuterRadius: TslNode;
  uWorldSize: TslNode;
  uHeightScale: TslNode;
  uSurfaceBias: TslNode | null;
  grassThreshold: TslNode;
  fadeWidth: TslNode;
  uPlayerPosition: TslNode;
  frustumBoundsRadius: TslNode;
  sampleTerrainSurfaceY?: ((worldXZ: TslNode) => TslNode) | null;
  sampleTerrainSurfacePosition?: ((worldXZ: TslNode) => TslNode) | null;
}): VegetationVisibilityContext {
  const grassDataTex = texture(params.grassDataMap);
  const inAnnulusMask = createInAnnulusMask(params.uInnerRadius, params.uOuterRadius);
  const transitionStrength = createTransitionStrength(params.grassThreshold, params.fadeWidth);
  const sampleGrassData = createSampleGrassData(
    grassDataTex,
    params.uWorldSize,
    params.uHeightScale,
    params.uSurfaceBias,
    params.sampleTerrainSurfaceY ?? null,
    params.sampleTerrainSurfacePosition ?? null,
  );
  const buildVisibility = createBuildVisibility({
    inAnnulusMask,
    transitionStrength,
    uPlayerPosition: params.uPlayerPosition,
    frustumBoundsRadius: params.frustumBoundsRadius,
  });
  return { inAnnulusMask, transitionStrength, sampleGrassData, buildVisibility };
}
