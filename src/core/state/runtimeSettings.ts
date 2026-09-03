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

export const runtimeSettings: RuntimeSettings = {
  terrain: {
    biomes: structuredClone(VISUAL.terrain.biomes),
    snow: cloneSnowTune(VISUAL.terrain.snow),
    stylize: cloneTerrainStylizeTune(VISUAL.terrain.stylize),
    chisel: cloneTerrainChiselTune(VISUAL.terrain.chisel),
    dirty: false,
  } satisfies TerrainDevSettings,
  water: {
    size: VISUAL.water.size,
    alpha: VISUAL.water.alpha,
    distortionDay: VISUAL.water.distortionDay,
    distortionNight: VISUAL.water.distortionNight,
    reflectionPlaneOffsetM: VISUAL.water.reflectionPlaneOffsetM,
    resolutionScale: VISUAL.water.resolutionScale,
    shoreDepth: { ...VISUAL.water.shoreDepth },
    tide: { ...VISUAL.water.tide },
  } satisfies WaterDevSettings,
  grass: createGrassFromVisual(),
  postfx: {
    grade: structuredClone(VISUAL.postfx.grade) as PostFxGradeDevSettings,
  } satisfies PostFxDevSettings,
};
