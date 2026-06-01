// src/world/grass/grassConfig.ts — player-follow grass tile constants
import { VISUAL } from '../../config/visualTuning';

export const GRASS_CONFIG = {
  SEGMENTS: 4,
  BLADE_WIDTH: 0.08,
  BLADE_HEIGHT: 1.25,
  BLADE_BOUNDING_SPHERE_RADIUS: 1.25,
  TILE_SIZE: 64,
  BLADES_PER_SIDE: VISUAL.grass.bladesPerSide,
  WORKGROUP_SIZE: 64,
} as const;

export function grassInstanceCount(): number {
  return GRASS_CONFIG.BLADES_PER_SIDE * GRASS_CONFIG.BLADES_PER_SIDE;
}

export function grassTileSpacing(): number {
  return GRASS_CONFIG.TILE_SIZE / GRASS_CONFIG.BLADES_PER_SIDE;
}

export function grassTileHalfSize(): number {
  return GRASS_CONFIG.TILE_SIZE * 0.5;
}
