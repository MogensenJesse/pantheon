// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/vegetationWrapTsl.ts — tile wrap for player-follow vegetation
import { mix, mod } from 'three/tsl';

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
