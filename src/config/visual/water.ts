// src/config/visual/water.ts — ocean mesh, shore depth, tide

import type { WaterReflectClouds, WaterReflectProps, WaterTier } from './types.ts';

export const water = {
  tier: 'reflective' as WaterTier,
  /** `proxy` = one sphere/cluster; `full` = main-pass mesh; `off` = sky+terrain. */
  reflectClouds: 'proxy' as WaterReflectClouds,
  reflectCloudProxyScale: 0.9,
  reflectProps: 'large' as WaterReflectProps,
  resolutionScale: 0.33,
  /** Floor on reflection mix — avoids void-black at grazing angles. */
  minReflectionMix: 0.22,
  /**
   * Mirror plane offset (m) relative to surface; tide adds in same direction.
   * Negative lifts plane toward shore (2× image shift closes low-res seam).
   */
  reflectionPlaneOffsetM: -0.05,
  receiveShadow: true,
  size: 4,
  alpha: 1,
  distortionDay: 3.7,
  distortionNight: 8,
  day: {
    waterColor: '#06283a',
    sunColor: '#fff3df',
  },
  night: {
    waterColor: '#050a14',
    sunColor: '#2a3344',
  },
  edgeFadeStartRatio: 0.72,
  edgeFadeEndRatio: 1.0,
  adaptive: {
    minScale: 0.15,
    inlandFloor: 0,
    shoreDistanceStart: 25,
    shoreDistanceEnd: 80,
    coastProbeDirs: 12,
    coastProbeStepM: 32,
    coastMaxSearchM: 192,
    pitchLowDeg: -5,
    pitchHighDeg: 15,
    viewWaterNearM: 60,
    viewWaterFarM: 320,
    dampLambda: 6,
  },
  shoreDepth: {
    enabled: true,
    absorption: 0.6,
    coastFadeM: 1,
    shallowDepthM: 4,
    refractionDepthM: 6,
    shallowColor: '#2a8a7a',
    shallowColorNight: '#0d3d35',
    shadowOpacityBoost: 0.6,
    refractionStrength: 1,
    refractionOffset: 5,
    refractionOpacity: 1,
    fogBypassStrength: 0.9,
    /** Fade to open-ocean depth outside map edge. */
    mapBoundsFadeM: 115,
    openOceanDepthM: 70,
  },
  tide: {
    enabled: true,
    waveSpeed: 0.7,
    waveAmplitude: 0.25,
    foamColor: '#ffffff',
    foamWidthM: 0.5,
    foamRippleAmplitude: 0.2,
    foamRippleScale: 0.1,
    foamRippleSpeed: 0.4,
    foamPatchVariation: 1,
    foamPatchScale: 0.35,
    foamOpacityMin: 0.6,
    foamWidthMinRatio: 0.65,
    shoreSlopeStepM: 4,
    shoreMaxSlope: 6,
    coastFlattenM: 6,
    runUpM: 0.1,
    runUpPeriodSec: 7,
    wetSandDarken: 0.4,
    wetSandMinM: 2,
    wetSandM: 6,
    wetSandPhaseLagRad: Math.PI / 2,
  },
} as const;
