// src/world/grass/compute/shared/vegetationWrapTsl.ts — tile wrap for player-follow vegetation
import { max, mix, mod, step } from 'three/tsl';
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

/**
 * 1 when this instance jumped across the wrap (new world cell). Do not use the
 * field-wide `moved` mask — that would reset every blade whenever the player walks.
 */
export function vegetationOffsetWrapped(
  offsetX: TslNode,
  offsetZ: TslNode,
  wrappedX: TslNode,
  wrappedZ: TslNode,
  deltaX: TslNode,
  deltaZ: TslNode,
  tileSize: TslNode,
): TslNode {
  const preX = offsetX.sub(deltaX);
  const preZ = offsetZ.sub(deltaZ);
  const jump = max(wrappedX.sub(preX).abs(), wrappedZ.sub(preZ).abs());
  return step(tileSize.mul(0.25), jump);
}

/** Wrap + teleport flag for one instance. Shared by grass and flower compact. */
export function vegetationWrapSlot(
  offsetX: TslNode,
  offsetZ: TslNode,
  uPlayerDeltaXZ: TslNode,
  uTileSize: TslNode,
  moveEpsSq: TslNode,
): {
  moved: TslNode;
  wrapped: { x: TslNode; z: TslNode };
  isWrapped: TslNode;
} {
  const moved = vegetationMovedMask(uPlayerDeltaXZ, moveEpsSq);
  const wrapped = wrapVegetationOffsetConditional(
    offsetX,
    offsetZ,
    uPlayerDeltaXZ.x,
    uPlayerDeltaXZ.y,
    uTileSize,
    moved,
  );
  const isWrapped = vegetationOffsetWrapped(
    offsetX,
    offsetZ,
    wrapped.x,
    wrapped.z,
    uPlayerDeltaXZ.x,
    uPlayerDeltaXZ.y,
    uTileSize,
  );
  return { moved, wrapped, isWrapped };
}
