// src/world/grass/grassConfig.ts — player-follow grass tile constants
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';

const WORKGROUP_SIZE = 64;

function grassSource() {
  return import.meta.env.DEV ? devSettings.grass : VISUAL.grass;
}

export function readGrassConfig() {
  const g = grassSource();
  return {
    SEGMENTS: g.segments,
    BLADE_WIDTH: g.bladeWidth,
    BLADE_HEIGHT: g.bladeHeight,
    TILE_SIZE: g.tileSize,
    BLADES_PER_SIDE: g.bladesPerSide,
    WORKGROUP_SIZE,
  };
}

/** Runtime accessors — DEV panel writes `devSettings.grass`, prod uses `VISUAL.grass`. */
export const GRASS_CONFIG = {
  get SEGMENTS() {
    return readGrassConfig().SEGMENTS;
  },
  get BLADE_WIDTH() {
    return readGrassConfig().BLADE_WIDTH;
  },
  get BLADE_HEIGHT() {
    return readGrassConfig().BLADE_HEIGHT;
  },
  get TILE_SIZE() {
    return readGrassConfig().TILE_SIZE;
  },
  get BLADES_PER_SIDE() {
    return readGrassConfig().BLADES_PER_SIDE;
  },
  WORKGROUP_SIZE,
} as const;

export function grassInstanceCount(): number {
  const n = Math.floor(GRASS_CONFIG.BLADES_PER_SIDE);
  return n * n;
}

export function grassTileSpacing(): number {
  return GRASS_CONFIG.TILE_SIZE / GRASS_CONFIG.BLADES_PER_SIDE;
}

export function grassTileHalfSize(): number {
  return GRASS_CONFIG.TILE_SIZE * 0.5;
}
