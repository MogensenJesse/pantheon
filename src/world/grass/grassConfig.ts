// src/world/grass/grassConfig.ts — player-follow grass tile constants
import { VISUAL } from '../../config/visualTuning';
import { devSettings } from '../../core/GameState';
import { deriveGrassFieldLayout, syncGrassFieldDerived } from './grassFieldMetrics';

const WORKGROUP_SIZE = 64;

function grassSource() {
  const g = import.meta.env.DEV ? devSettings.grass : VISUAL.grass;
  syncGrassFieldDerived(g);
  return g;
}

export function readGrassFieldDerived() {
  const g = grassSource();
  return deriveGrassFieldLayout({
    fieldRadius: g.fieldRadius,
    lod0Radius: g.lod0Radius,
    densityPerM2: g.densityPerM2,
    maxInstances: g.maxInstances,
    wrapTileExtentM: g.wrapTileExtentM,
  });
}

export function readGrassConfig() {
  const g = grassSource();
  const layout = readGrassFieldDerived();
  return {
    SEGMENTS: g.segments,
    BLADE_WIDTH: g.bladeWidth,
    BLADE_HEIGHT: g.bladeHeight,
    TILE_SIZE: layout.tileSize,
    BLADES_PER_SIDE: layout.bladesPerSide,
    FIELD_RADIUS: layout.fieldRadius,
    LOD0_RADIUS: layout.lod0Radius,
    DENSITY_PER_M2: layout.densityPerM2,
    INSTANCE_COUNT: layout.instanceCount,
    LOD_FAR_SEGMENTS: g.lodFarSegments,
    LOD_RADIUS: layout.lodRadius,
    LOD_DUAL_DRAW: g.lodDualDraw,
    WORKGROUP_SIZE,
  };
}

export function grassLodDualDrawEnabled(): boolean {
  return readGrassConfig().LOD_DUAL_DRAW !== false;
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
  get FIELD_RADIUS() {
    return readGrassConfig().FIELD_RADIUS;
  },
  get LOD0_RADIUS() {
    return readGrassConfig().LOD0_RADIUS;
  },
  get DENSITY_PER_M2() {
    return readGrassConfig().DENSITY_PER_M2;
  },
  get INSTANCE_COUNT() {
    return readGrassConfig().INSTANCE_COUNT;
  },
  get LOD_FAR_SEGMENTS() {
    return readGrassConfig().LOD_FAR_SEGMENTS;
  },
  get LOD_RADIUS() {
    return readGrassConfig().LOD_RADIUS;
  },
  get LOD_DUAL_DRAW() {
    return readGrassConfig().LOD_DUAL_DRAW;
  },
  WORKGROUP_SIZE,
} as const;

export function grassInstanceCount(): number {
  return readGrassConfig().INSTANCE_COUNT;
}

export function grassTileSpacing(): number {
  return readGrassConfig().TILE_SIZE / readGrassConfig().BLADES_PER_SIDE;
}

export function grassTileHalfSize(): number {
  return readGrassConfig().TILE_SIZE * 0.5;
}
