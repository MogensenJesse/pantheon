// src/world/grass/compute/shared/vegetationCompactTsl.ts — shared init jitter + compact keep/draw
import { float, floor, hash, instanceIndex, vec2 } from 'three/tsl';
import { grassSharedUniforms } from '../../config/grassUniforms';
import type { TslNode } from '../../tsl/tslNode';
import {
  vegetationClumpMask,
  vegetationKeepFailReason,
  vegetationStochasticKeep,
} from './vegetationVisibilityTsl';

/** Jittered wrap-tile grid offset (grass + flowers). Optional atlas wrap-noise. */
export function vegetationJitteredGridOffset(params: {
  perSide: TslNode;
  spacing: TslNode;
  halfTile: TslNode;
  tileSize: TslNode;
  windTex: TslNode | null;
  wrapNoiseChannel: (atlas: TslNode) => TslNode;
}): { offsetX: TslNode; offsetZ: TslNode; atlas: TslNode | null } {
  const row = floor(float(instanceIndex).div(params.perSide));
  const col = float(instanceIndex).mod(params.perSide);
  const randX = hash(instanceIndex.add(4321));
  const randZ = hash(instanceIndex.add(1234));
  let offsetX = col
    .mul(params.spacing)
    .sub(params.halfTile)
    .add(randX.mul(params.spacing.mul(0.5)));
  let offsetZ = row
    .mul(params.spacing)
    .sub(params.halfTile)
    .add(randZ.mul(params.spacing.mul(0.5)));

  let atlas: TslNode | null = null;
  if (params.windTex) {
    const tileUv = (vec2 as any)(
      offsetX.add(params.halfTile).div(params.tileSize),
      offsetZ.add(params.halfTile).div(params.tileSize),
    )
      .abs()
      .fract();
    atlas = params.windTex.sample(tileUv);
    const wrapNoise = params.wrapNoiseChannel(atlas).sub(0.5);
    offsetX = offsetX.add(wrapNoise.mul(17).fract());
    offsetZ = offsetZ.add(wrapNoise.mul(13).fract());
  }
  return { offsetX, offsetZ, atlas };
}

/** Frustum/biome/stochastic keep + cull-debug draw mask. Pack formats stay per-system. */
export function vegetationCompactKeep(params: {
  wrappedX: TslNode;
  wrappedZ: TslNode;
  yOffset: TslNode;
  grassWeight: TslNode;
  inAnnulus: TslNode;
  transitionStrength: (grassWeight: TslNode) => TslNode;
  buildVisibility: (
    offsetX: TslNode,
    offsetZ: TslNode,
    yOffset: TslNode,
    grassWeight: TslNode,
  ) => { visible: TslNode; reason: TslNode };
  previousKeep: TslNode;
  bladeHeight: TslNode;
  cellSpacing: TslNode;
}): {
  worldX: TslNode;
  worldZ: TslNode;
  isVisible: TslNode;
  kept: TslNode;
  drawInstance: TslNode;
  reason: TslNode;
  debugOn: TslNode;
  clumpMask: TslNode;
} {
  const { uPlayerPosition, uGrassCullDebug } = grassSharedUniforms as any;
  const worldX = params.wrappedX.add(uPlayerPosition.x);
  const worldZ = params.wrappedZ.add(uPlayerPosition.z);
  const visibility = params.buildVisibility(
    params.wrappedX,
    params.wrappedZ,
    params.yOffset,
    params.grassWeight,
  );
  const isVisible = visibility.visible;
  const debugOn = uGrassCullDebug.greaterThan(float(0.5));
  const clump = vegetationClumpMask(worldX, worldZ);
  const keep = vegetationStochasticKeep({
    worldX,
    worldZ,
    worldY: params.yOffset,
    annulusWeight: params.inAnnulus,
    biomeStrength: params.transitionStrength(params.grassWeight),
    bladeHeight: params.bladeHeight,
    previousKeep: params.previousKeep,
    cellSpacing: params.cellSpacing,
    clumpMask: clump.keepMask,
  });
  const kept = isVisible.mul(keep);
  const reason = vegetationKeepFailReason(isVisible, keep, visibility.reason);
  const drawInstance = debugOn.select(isVisible, kept);
  return {
    worldX,
    worldZ,
    isVisible,
    kept,
    drawInstance,
    reason,
    debugOn,
    clumpMask: clump.heightMask,
  };
}
