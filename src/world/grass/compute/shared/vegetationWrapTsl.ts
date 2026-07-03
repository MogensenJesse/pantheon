// src/world/grass/compute/shared/vegetationWrapTsl.ts — tile wrap for player-follow vegetation
import { mix, mod, step } from 'three/tsl';
import type { TslNode } from '../../tsl/tslNode';

/** 1 when player XZ delta exceeds moveEpsSq, else 0. */
export function vegetationMovedMask(uPlayerDeltaXZ: TslNode, moveEpsSq: TslNode): TslNode {
  const deltaSq = uPlayerDeltaXZ.x
    .mul(uPlayerDeltaXZ.x)
    .add(uPlayerDeltaXZ.y.mul(uPlayerDeltaXZ.y));
  return step(moveEpsSq, deltaSq);
}

/** Wrap local XZ offset when the player moves (same math as grass SSBO). */
export function wrapVegetationOffset(
  offsetX: TslNode,
  offsetZ: TslNode,
  deltaX: TslNode,
  deltaZ: TslNode,
  tileSize: TslNode,
): { wrappedX: TslNode; wrappedZ: TslNode } {
  const halfTile = tileSize.mul(0.5);
  const wrappedX = mod(offsetX.sub(deltaX).add(halfTile), tileSize).sub(halfTile);
  const wrappedZ = mod(offsetZ.sub(deltaZ).add(halfTile), tileSize).sub(halfTile);
  return { wrappedX, wrappedZ };
}

export function wrapVegetationOffsetConditional(
  offsetX: TslNode,
  offsetZ: TslNode,
  deltaX: TslNode,
  deltaZ: TslNode,
  tileSize: TslNode,
  moved: TslNode,
): { x: TslNode; z: TslNode } {
  const { wrappedX, wrappedZ } = wrapVegetationOffset(offsetX, offsetZ, deltaX, deltaZ, tileSize);
  return {
    x: mix(offsetX, wrappedX, moved),
    z: mix(offsetZ, wrappedZ, moved),
  };
}
