// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/compute/shared/vegetationWrapTsl.ts — tile wrap for player-follow vegetation
import { mix, mod, step } from 'three/tsl';

/** 1 when player XZ delta exceeds moveEpsSq, else 0. */
export function vegetationMovedMask(uPlayerDeltaXZ, moveEpsSq) {
  const deltaSq = uPlayerDeltaXZ.x
    .mul(uPlayerDeltaXZ.x)
    .add(uPlayerDeltaXZ.y.mul(uPlayerDeltaXZ.y));
  return step(moveEpsSq, deltaSq);
}

/** Wrap local XZ offset when the player moves (same math as grass SSBO). */
export function wrapVegetationOffset(offsetX, offsetZ, deltaX, deltaZ, tileSize) {
  const halfTile = tileSize.mul(0.5);
  const wrappedX = mod(offsetX.sub(deltaX).add(halfTile), tileSize).sub(halfTile);
  const wrappedZ = mod(offsetZ.sub(deltaZ).add(halfTile), tileSize).sub(halfTile);
  return { wrappedX, wrappedZ };
}

export function wrapVegetationOffsetConditional(offsetX, offsetZ, deltaX, deltaZ, tileSize, moved) {
  const { wrappedX, wrappedZ } = wrapVegetationOffset(offsetX, offsetZ, deltaX, deltaZ, tileSize);
  return {
    x: mix(offsetX, wrappedX, moved),
    z: mix(offsetZ, wrappedZ, moved),
  };
}
