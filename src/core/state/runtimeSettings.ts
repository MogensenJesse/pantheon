// src/core/state/runtimeSettings.ts — mutable runtime mirror of VISUAL (prod + DEV)

import { VISUAL } from '../../config/visualTuning';
import { cloneFlowerSettings } from '../../world/grass/config/flowerConfig';
import { syncAllGrassRingsDerived } from '../../world/grass/config/grassFieldMetrics';
import type {
  GrassDevSettings,
  GrassFoliageLightingSettings,
  GrassRingDerivedLayout,
  PostFxCohesionDevSettings,
  PostFxDevSettings,
  PostFxGradeDevSettings,
  RuntimeSettings,
  TerrainDevSettings,
  WaterDevSettings,
} from './settingsTypes';

function emptyRingDerived(): GrassRingDerivedLayout {
  return {
    innerRadius: 0,
    outerRadius: 0,
    tileSize: 0,
    bladesPerSide: 0,
    instanceCount: 0,
  };
}

function createGrassFromVisual(): GrassDevSettings {
  return {
    rings: structuredClone(VISUAL.grass.rings) as GrassDevSettings['rings'],
    ringDerived: [emptyRingDerived(), emptyRingDerived(), emptyRingDerived()],
    maxInstancesPerRing: VISUAL.grass.maxInstancesPerRing,
    bladeHeight: VISUAL.grass.bladeHeight,
    windStrength: VISUAL.grass.windStrength,
    windSpeed: VISUAL.grass.windSpeed,
    cullPadNdcX: VISUAL.grass.cullPadNdcX,
    cullPadNdcYNear: VISUAL.grass.cullPadNdcYNear,
    cullPadNdcYFar: VISUAL.grass.cullPadNdcYFar,
    bladeMinScale: VISUAL.grass.bladeMinScale,
    bladeMaxScale: VISUAL.grass.bladeMaxScale,
    colorMixFactor: VISUAL.grass.colorMixFactor,
    colorVariationStrength: VISUAL.grass.colorVariationStrength,
    baseWindShade: VISUAL.grass.baseWindShade,
    baseShadeHeight: VISUAL.grass.baseShadeHeight,
    baseBending: VISUAL.grass.baseBending,
    biomeGrassThreshold: VISUAL.grass.biomeGrassThreshold,
    biomeGrassFadeWidth: VISUAL.grass.biomeGrassFadeWidth,
    transitionMinBladeScale: VISUAL.grass.transitionMinBladeScale,
    surfaceBias: VISUAL.grass.surfaceBias,
    trailGrowthRate: VISUAL.grass.trailGrowthRate,
    trailMinScale: VISUAL.grass.trailMinScale,
    trailRadius: VISUAL.grass.trailRadius,
    trailKDown: VISUAL.grass.trailKDown,
    playerGlowMul: VISUAL.grass.playerGlowMul,
    foliageLighting: structuredClone(VISUAL.grass.foliageLighting) as GrassFoliageLightingSettings,
    baseColor: VISUAL.grass.baseColor,
    tipColor: VISUAL.grass.tipColor,
    enabled: true,
    dirty: false,
    flowers: cloneFlowerSettings(VISUAL.grass.flowers),
  };
}

export const runtimeSettings: RuntimeSettings = {
  terrain: {
    biomes: structuredClone(VISUAL.terrain.biomes),
    snow: { ...VISUAL.terrain.snow },
    displacementEnabled: VISUAL.terrain.displacementEnabled,
    showLodBounds: false,
    dirty: false,
  } satisfies TerrainDevSettings,
  water: {
    size: VISUAL.water.size,
    alpha: VISUAL.water.alpha,
    distortionDay: VISUAL.water.distortionDay,
    distortionNight: VISUAL.water.distortionNight,
    resolutionScale: VISUAL.water.resolutionScale,
    shoreDepth: { ...VISUAL.water.shoreDepth },
    tide: { ...VISUAL.water.tide },
  } satisfies WaterDevSettings,
  grass: createGrassFromVisual(),
  postfx: {
    cohesion: structuredClone(VISUAL.postfx.cohesion) as PostFxCohesionDevSettings,
    grade: structuredClone(VISUAL.postfx.grade) as PostFxGradeDevSettings,
  } satisfies PostFxDevSettings,
};

syncAllGrassRingsDerived(
  runtimeSettings.grass.rings,
  runtimeSettings.grass.ringDerived,
  runtimeSettings.grass.maxInstancesPerRing,
);
