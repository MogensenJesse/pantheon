// src/map/mapUvTsl.ts — shared world XZ → map texture UV (terrain + grass)
import { Fn, vec2 } from 'three/tsl';
import { mapGridSize } from './MapTypes';

type TslNode = any;

/**
 * World XZ → [0,1]² UV for rasters that cover the world edge-to-edge (texel i spans
 * [i, i+1) of the world). Prop exclusion/AO and the guide glow are baked this way.
 */
export const terrainMapUv = Fn(([worldSize, worldXZ]: TslNode[]) =>
  worldXZ.div(worldSize).add(0.5),
);

/** Scalar X/Z components → same map UV as `terrainMapUv`. */
export function worldXZToMapUv(worldX: TslNode, worldZ: TslNode, uWorldSize: TslNode) {
  return terrainMapUv(uWorldSize, vec2(worldX, worldZ));
}

/**
 * World XZ → UV for node-aligned grid textures (height, biome/path/meadow/water masks, grass
 * data): texel i holds the value at world `i / (N - 1)`, so its centre sits at `(i + 0.5) / N`.
 * Matches the CPU `worldToGridFrac` / mesh nodes; `terrainMapUv` is off by up to half a texel
 * at the map edges.
 */
export function terrainGridUv(
  worldSize: TslNode,
  worldXZ: TslNode,
  gridSize: number = mapGridSize(),
) {
  const n = Math.max(2, gridSize);
  return worldXZ
    .div(worldSize)
    .add(0.5)
    .mul((n - 1) / n)
    .add(0.5 / n);
}

/** Scalar X/Z components → same grid UV as `terrainGridUv`. */
export function worldXZToGridUv(worldX: TslNode, worldZ: TslNode, uWorldSize: TslNode) {
  return terrainGridUv(uWorldSize, vec2(worldX, worldZ));
}
