// src/world/grass/render/flowerGeometry.ts — camera-facing sprite quad, pivot at the ground
import { PlaneGeometry } from 'three';

/** 1×1 XY quad. Bottom edge at y=0 so SpriteNodeMaterial sits on terrain Y. */
export function createFlowerGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(1, 1);
  geometry.translate(0, 0.5, 0);
  return geometry;
}
