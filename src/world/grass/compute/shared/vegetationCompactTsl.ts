// src/world/grass/compute/shared/vegetationCompactTsl.ts - shared compact keep/draw
import { float } from 'three/tsl';
import { grassSharedUniforms } from '../../config/grassUniforms';
import type { TslNode } from '../../tsl/tslNode';
import {
  type VegetationVisibilitySample,
  vegetationClumpFromBaked,
  vegetationKeepFailReason,
  vegetationStochasticKeep,
} from './vegetationVisibilityTsl';

/** Frustum/biome/stochastic keep + cull-debug draw mask. Pack formats stay per-system. */
export function vegetationCompactKeep(params: {
  wrappedX: TslNode;
  wrappedZ: TslNode;
  worldX: TslNode;
  worldZ: TslNode;
  yOffset: TslNode;
  grassWeight: TslNode;
  inAnnulus: TslNode;
  biomeStrength: TslNode;
  buildVisibility: (sample: VegetationVisibilitySample) => {
    visible: TslNode;
    reason: TslNode;
  };
  previousKeep: TslNode;
  bladeHeight: TslNode;
  cellSpacing: TslNode;
  clumpRaw: TslNode;
}): {
  kept: TslNode;
  drawInstance: TslNode;
  reason: TslNode;
  debugOn: TslNode;
  clumpMask: TslNode;
} {
  const visibility = params.buildVisibility({
    offsetX: params.wrappedX,
    offsetZ: params.wrappedZ,
    worldX: params.worldX,
    worldZ: params.worldZ,
    yOffset: params.yOffset,
    grassWeight: params.grassWeight,
    annulusWeight: params.inAnnulus,
    biomeStrength: params.biomeStrength,
  });
  const isVisible = visibility.visible;
  const clump = vegetationClumpFromBaked(params.clumpRaw);
  const keep = vegetationStochasticKeep({
    worldX: params.worldX,
    worldZ: params.worldZ,
    worldY: params.yOffset,
    annulusWeight: params.inAnnulus,
    biomeStrength: params.biomeStrength,
    bladeHeight: params.bladeHeight,
    previousKeep: params.previousKeep,
    cellSpacing: params.cellSpacing,
    clumpMask: clump.keepMask,
  });
  const kept = isVisible.mul(keep);
  if (import.meta.env.DEV) {
    const { uGrassCullDebug } = grassSharedUniforms as any;
    const debugOn = uGrassCullDebug.greaterThan(float(0.5));
    const reason = vegetationKeepFailReason(isVisible, keep, visibility.reason);
    return {
      kept,
      drawInstance: debugOn.select(isVisible, kept),
      reason,
      debugOn,
      clumpMask: clump.heightMask,
    };
  }
  return {
    kept,
    drawInstance: kept,
    reason: float(0),
    debugOn: float(0),
    clumpMask: clump.heightMask,
  };
}