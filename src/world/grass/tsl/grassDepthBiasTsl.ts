// src/world/grass/tsl/grassDepthBiasTsl.ts — pull grass depth toward camera over terrain z-fight
import { cameraFar, cameraNear, float, positionView, viewZToPerspectiveDepth } from 'three/tsl';
import type { SpriteNodeMaterial } from 'three/webgpu';

/** View-space pull toward camera (m) — wins depth test over coplanar terrain when pitched down. */
const GRASS_TERRAIN_DEPTH_BIAS_M = 0.35;

/** Apply TSL depth bias + polygon offset so grass draws over terrain at the same XZ. */
export function applyGrassTerrainDepthBias(material: SpriteNodeMaterial): void {
  const biasedViewZ = positionView.z.add(float(GRASS_TERRAIN_DEPTH_BIAS_M));
  material.depthNode = viewZToPerspectiveDepth(biasedViewZ, cameraNear, cameraFar);
  material.polygonOffset = true;
  material.polygonOffsetFactor = -4;
  material.polygonOffsetUnits = -10;
}
