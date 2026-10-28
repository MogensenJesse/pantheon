// @ts-nocheck — TSL node typings incomplete in three r186
// src/life/particles/groundNode.ts — the height of the ground under a point, as a shader node, for specks to ride on
//
// The sampler the grass stands on, so a speck rides the ground the player sees (the village's levelled pads included).
// Over water it is the water level: nothing sinks under the lake.
import { float, max, vec2 } from 'three/tsl';
import { createTerrainSurfaceHeightTsl } from '../../world/terrain/tsl/terrainSurfaceHeightTsl';

/** `(x, z) => node`: the world Y of the ground (or the water) at a world point, in metres. */
export type GroundNode = (x, z) => unknown;

export function createGroundNode(terrain, waterLevelM: number): GroundNode {
  const { sampleTerrainSurfaceY } = createTerrainSurfaceHeightTsl({
    uniforms: terrain.splatMaterial.terrainUniforms,
    // as the grass: the village's levelled ground when the map has a detail layer
    macroHeight: terrain.fine?.macroHeight ?? terrain.splatMaterial.macroHeight,
  });
  const water = float(waterLevelM);
  return (x, z) => max(sampleTerrainSurfaceY(vec2(x, z)), water);
}
