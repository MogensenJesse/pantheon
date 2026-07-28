// src/dev/panel/devPanelWaterSpecs.ts — RangeSpec tables for the Water dev panel
import { VISUAL } from '../../config/visualTuning';
import type { WaterShoreDevSettings, WaterTideDevSettings } from '../../core/GameState';
import type { RangeSpec } from '../bindRange';

const SD = VISUAL.water.shoreDepth;
const TD = VISUAL.water.tide;

export const WATER_SPECS: RangeSpec[] = [
  {
    id: 'dev-water-size',
    label: 'Ripple scale',
    min: 0.5,
    max: 12,
    step: 0.1,
    defaultValue: VISUAL.water.size,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-water-alpha',
    label: 'Opacity',
    min: 0.4,
    max: 1,
    step: 0.01,
    defaultValue: VISUAL.water.alpha,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-water-distortion-day',
    label: 'Distortion (day)',
    min: 0,
    max: 8,
    step: 0.1,
    defaultValue: VISUAL.water.distortionDay,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-water-distortion-night',
    label: 'Distortion (night)',
    min: 0,
    max: 8,
    step: 0.1,
    defaultValue: VISUAL.water.distortionNight,
    format: (v) => v.toFixed(1),
  },
  {
    id: 'dev-water-reflection-plane-offset',
    label: 'Reflection plane offset (m)',
    min: -2,
    max: 2,
    step: 0.05,
    defaultValue: VISUAL.water.reflectionPlaneOffsetM,
    format: (v) => v.toFixed(2),
  },
  {
    id: 'dev-water-resolution',
    label: 'Reflection scale (max)',
    min: 0.15,
    max: 0.75,
    step: 0.01,
    defaultValue: VISUAL.water.resolutionScale,
    format: (v) => v.toFixed(2),
  },
];

export type WaterSliderKey =
  | 'size'
  | 'alpha'
  | 'distortionDay'
  | 'distortionNight'
  | 'reflectionPlaneOffsetM'
  | 'resolutionScale';

export const KEY_MAP: Record<string, WaterSliderKey> = {
  'dev-water-size': 'size',
  'dev-water-alpha': 'alpha',
  'dev-water-distortion-day': 'distortionDay',
  'dev-water-distortion-night': 'distortionNight',
  'dev-water-reflection-plane-offset': 'reflectionPlaneOffsetM',
  'dev-water-resolution': 'resolutionScale',
};

export interface ShoreSpec extends RangeSpec {
  key: keyof Pick<
    WaterShoreDevSettings,
    | 'absorption'
    | 'coastFadeM'
    | 'shallowDepthM'
    | 'refractionDepthM'
    | 'shadowOpacityBoost'
    | 'refractionStrength'
    | 'refractionOffset'
    | 'refractionOpacity'
    | 'fogBypassStrength'
    | 'mapBoundsFadeM'
    | 'openOceanDepthM'
  >;
}

export const SHORE_SPECS: ShoreSpec[] = [
  {
    id: 'dev-shore-absorption',
    label: 'Depth absorption',
    min: 0.05,
    max: 1,
    step: 0.01,
    defaultValue: SD.absorption,
    format: (v) => v.toFixed(2),
    key: 'absorption',
  },
  {
    id: 'dev-shore-coast-fade',
    label: 'Coast fade (m)',
    min: 0.1,
    max: 4,
    step: 0.1,
    defaultValue: SD.coastFadeM,
    format: (v) => v.toFixed(1),
    key: 'coastFadeM',
  },
  {
    id: 'dev-shore-shallow-depth',
    label: 'Shallow tint depth (m)',
    min: 0.5,
    max: 20,
    step: 0.5,
    defaultValue: SD.shallowDepthM,
    format: (v) => v.toFixed(1),
    key: 'shallowDepthM',
  },
  {
    id: 'dev-shore-refraction-depth',
    label: 'Refraction depth (m)',
    min: 0.5,
    max: 20,
    step: 0.5,
    defaultValue: SD.refractionDepthM,
    format: (v) => v.toFixed(1),
    key: 'refractionDepthM',
  },
  {
    id: 'dev-shore-shadow-opacity',
    label: 'Shadow opacity boost',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultValue: SD.shadowOpacityBoost,
    format: (v) => v.toFixed(2),
    key: 'shadowOpacityBoost',
  },
  {
    id: 'dev-shore-refraction-strength',
    label: 'Refraction strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SD.refractionStrength,
    format: (v) => v.toFixed(2),
    key: 'refractionStrength',
  },
  {
    id: 'dev-shore-refraction-offset',
    label: 'Refraction UV offset',
    min: 0,
    max: 5,
    step: 0.1,
    defaultValue: SD.refractionOffset,
    format: (v) => v.toFixed(1),
    key: 'refractionOffset',
  },
  {
    id: 'dev-shore-refraction-opacity',
    label: 'Refraction opacity lock',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: SD.refractionOpacity,
    format: (v) => v.toFixed(2),
    key: 'refractionOpacity',
  },
  {
    id: 'dev-shore-fog-bypass',
    label: 'Shore fog bypass',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: SD.fogBypassStrength,
    format: (v) => v.toFixed(2),
    key: 'fogBypassStrength',
  },
  {
    id: 'dev-shore-map-bounds-fade',
    label: 'Map edge ocean fade (m)',
    min: 10,
    max: 200,
    step: 5,
    defaultValue: SD.mapBoundsFadeM,
    format: (v) => v.toFixed(0),
    key: 'mapBoundsFadeM',
  },
  {
    id: 'dev-shore-open-ocean-depth',
    label: 'Open ocean depth (m)',
    min: 8,
    max: 80,
    step: 1,
    defaultValue: SD.openOceanDepthM,
    format: (v) => v.toFixed(0),
    key: 'openOceanDepthM',
  },
];

export interface TideSpec extends RangeSpec {
  key: keyof Pick<
    WaterTideDevSettings,
    | 'waveSpeed'
    | 'waveAmplitude'
    | 'foamDepth'
    | 'foamRippleAmplitude'
    | 'foamRippleScale'
    | 'foamRippleSpeed'
    | 'foamPatchVariation'
    | 'foamPatchScale'
    | 'foamOpacityMin'
    | 'foamDepthMinRatio'
    | 'foamFogHazeStrength'
    | 'foamFogColorTint'
    | 'foamWaterlineBias'
  >;
}

export const TIDE_SPECS: TideSpec[] = [
  {
    id: 'dev-tide-wave-speed',
    label: 'Wave speed',
    min: 0.2,
    max: 3,
    step: 0.1,
    defaultValue: TD.waveSpeed,
    format: (v) => v.toFixed(1),
    key: 'waveSpeed',
  },
  {
    id: 'dev-tide-wave-amplitude',
    label: 'Wave amplitude (m)',
    min: 0,
    max: 0.25,
    step: 0.01,
    defaultValue: TD.waveAmplitude,
    format: (v) => v.toFixed(2),
    key: 'waveAmplitude',
  },
  {
    id: 'dev-tide-foam-depth',
    label: 'Shore stripe depth (m)',
    min: 0.01,
    max: 0.2,
    step: 0.01,
    defaultValue: TD.foamDepth,
    format: (v) => v.toFixed(2),
    key: 'foamDepth',
  },
  {
    id: 'dev-tide-foam-ripple-amp',
    label: 'Foam ripple (m)',
    min: 0,
    max: 0.12,
    step: 0.005,
    defaultValue: TD.foamRippleAmplitude,
    format: (v) => v.toFixed(3),
    key: 'foamRippleAmplitude',
  },
  {
    id: 'dev-tide-foam-ripple-scale',
    label: 'Foam ripple scale',
    min: 0.05,
    max: 0.6,
    step: 0.01,
    defaultValue: TD.foamRippleScale,
    format: (v) => v.toFixed(2),
    key: 'foamRippleScale',
  },
  {
    id: 'dev-tide-foam-ripple-speed',
    label: 'Foam ripple speed',
    min: 0.2,
    max: 3,
    step: 0.1,
    defaultValue: TD.foamRippleSpeed,
    format: (v) => v.toFixed(1),
    key: 'foamRippleSpeed',
  },
  {
    id: 'dev-tide-foam-patch-var',
    label: 'Foam patch variation',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: TD.foamPatchVariation,
    format: (v) => v.toFixed(2),
    key: 'foamPatchVariation',
  },
  {
    id: 'dev-tide-foam-patch-scale',
    label: 'Foam patch scale',
    min: 0.04,
    max: 0.35,
    step: 0.01,
    defaultValue: TD.foamPatchScale,
    format: (v) => v.toFixed(2),
    key: 'foamPatchScale',
  },
  {
    id: 'dev-tide-foam-opacity-min',
    label: 'Thin foam opacity',
    min: 0.05,
    max: 0.85,
    step: 0.02,
    defaultValue: TD.foamOpacityMin,
    format: (v) => v.toFixed(2),
    key: 'foamOpacityMin',
  },
  {
    id: 'dev-tide-foam-depth-min',
    label: 'Thin foam depth ratio',
    min: 0.1,
    max: 0.9,
    step: 0.02,
    defaultValue: TD.foamDepthMinRatio,
    format: (v) => v.toFixed(2),
    key: 'foamDepthMinRatio',
  },
  {
    id: 'dev-tide-foam-fog-haze',
    label: 'Foam night haze fade',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: TD.foamFogHazeStrength,
    format: (v) => v.toFixed(2),
    key: 'foamFogHazeStrength',
  },
  {
    id: 'dev-tide-foam-fog-tint',
    label: 'Foam fog color tint',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: TD.foamFogColorTint,
    format: (v) => v.toFixed(2),
    key: 'foamFogColorTint',
  },
  {
    id: 'dev-tide-foam-waterline-bias',
    label: 'Foam waterline overlap (m)',
    min: -0.12,
    max: 0.06,
    step: 0.005,
    defaultValue: TD.foamWaterlineBias,
    format: (v) => v.toFixed(3),
    key: 'foamWaterlineBias',
  },
];
