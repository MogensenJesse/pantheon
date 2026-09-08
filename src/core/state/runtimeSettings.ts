// src/core/state/runtimeSettings.ts — mutable runtime mirror of VISUAL (prod + DEV)

import { VISUAL } from '../../config/visualTuning';
import {
  cloneSnowTune,
  cloneTerrainChiselTune,
  cloneTerrainStylizeTune,
} from '../../world/terrain/config/terrainBiomeTuning';
import type {
  GrassDevSettings,
  PostFxDevSettings,
  PostFxGradeDevSettings,
  RuntimeSettings,
  TerrainDevSettings,
  WaterDevSettings,
} from './settingsTypes';

export function createGrassFromVisual(): GrassDevSettings {
  return {
    ...(structuredClone(VISUAL.grass) as Omit<
      GrassDevSettings,
      'enabled' | 'cullDebug' | 'lodColorDebug' | 'dirty'
    >),
    enabled: true,
    cullDebug: false,
    lodColorDebug: false,
    dirty: false,
  };
}

function createGradeDevFromVisual(): PostFxGradeDevSettings {
  return structuredClone(VISUAL.postfx.grade) as PostFxGradeDevSettings;
}

function createWaterDevFromVisual(): WaterDevSettings {
  return {
    size: VISUAL.water.size,
    alpha: VISUAL.water.alpha,
    reflectionPlaneOffsetM: VISUAL.water.reflectionPlaneOffsetM,
    resolutionScale: VISUAL.water.resolutionScale,
    stops: structuredClone(VISUAL.water.stops) as WaterDevSettings['stops'],
    shoreDepth: { ...VISUAL.water.shoreDepth },
    tide: { ...VISUAL.water.tide },
  };
}

export const runtimeSettings: RuntimeSettings = {
  terrain: {
    biomes: structuredClone(VISUAL.terrain.biomes),
    snow: cloneSnowTune(VISUAL.terrain.snow),
    stylize: cloneTerrainStylizeTune(VISUAL.terrain.stylize),
    chisel: cloneTerrainChiselTune(VISUAL.terrain.chisel),
    dirty: false,
  } satisfies TerrainDevSettings,
  water: createWaterDevFromVisual(),
  grass: createGrassFromVisual(),
  postfx: {
    grade: createGradeDevFromVisual(),
  } satisfies PostFxDevSettings,
};
