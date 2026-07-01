// src/map/mapUvTsl.ts — shared world XZ → painted map texture UV (terrain + grass)
import { Fn, vec2 } from 'three/tsl';

type TslNode = any;

/** World XZ → [0,1]² painted map UV (terrain splat + grass compute). */
export const terrainMapUv = Fn(([worldSize, worldXZ]: TslNode[]) =>
  worldXZ.div(worldSize).add(0.5),
);

/** Scalar X/Z components → same map UV as `terrainMapUv`. */
export function worldXZToMapUv(worldX: TslNode, worldZ: TslNode, uWorldSize: TslNode) {
  return terrainMapUv(uWorldSize, vec2(worldX, worldZ));
}
