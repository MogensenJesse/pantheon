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

export type WaterSliderKey = 'size' | 'alpha' | 'reflectionPlaneOffsetM' | 'resolutionScale';

export const KEY_MAP: Record<string, WaterSliderKey> = {
  'dev-water-size': 'size',
  'dev-water-alpha': 'alpha',
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
    | 'foamWidthM'
    | 'foamRippleAmplitude'
    | 'foamRippleScale'
    | 'foamRippleSpeed'
    | 'foamPatchVariation'
    | 'foamPatchScale'
    | 'foamOpacityMin'
    | 'foamWidthMinRatio'
    | 'runUpM'
    | 'runUpPeriodSec'
    | 'wetSandDarken'
    | 'wetSandMinM'
    | 'wetSandM'
    | 'wetSandPhaseLagRad'
    | 'coastFlattenM'
    | 'shoreSlopeStepM'
    | 'shoreMaxSlope'
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
    id: 'dev-tide-foam-width',
    label: 'Water lace width (m)',
    min: 0.04,
    max: 1.2,
    step: 0.02,
    defaultValue: TD.foamWidthM,
    format: (v) => v.toFixed(2),
    key: 'foamWidthM',
  },
  {
    id: 'dev-tide-foam-ripple-amp',
    label: 'Foam scallop (m)',
    min: 0,
    max: 1.2,
    step: 0.02,
    defaultValue: TD.foamRippleAmplitude,
    format: (v) => v.toFixed(2),
    key: 'foamRippleAmplitude',
  },
  {
    id: 'dev-tide-foam-ripple-scale',
    label: 'Foam scallop scale',
    min: 0.04,
    max: 0.6,
    step: 0.01,
    defaultValue: TD.foamRippleScale,
    format: (v) => v.toFixed(2),
    key: 'foamRippleScale',
  },
  {
    id: 'dev-tide-foam-ripple-speed',
    label: 'Foam scallop speed',
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: TD.foamRippleSpeed,
    format: (v) => v.toFixed(2),
    key: 'foamRippleSpeed',
  },
  {
    id: 'dev-tide-run-up',
    label: 'Run-up (m)',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: TD.runUpM,
    format: (v) => v.toFixed(2),
    key: 'runUpM',
  },
  {
    id: 'dev-tide-run-up-period',
    label: 'Run-up period (s)',
    min: 2,
    max: 20,
    step: 0.5,
    defaultValue: TD.runUpPeriodSec,
    format: (v) => v.toFixed(1),
    key: 'runUpPeriodSec',
  },
  {
    id: 'dev-tide-wet-sand-darken',
    label: 'Wet sand darken',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: TD.wetSandDarken,
    format: (v) => v.toFixed(2),
    key: 'wetSandDarken',
  },
  {
    id: 'dev-tide-wet-sand-min-m',
    label: 'Wet sand width min (m)',
    min: 0.2,
    max: 4,
    step: 0.05,
    defaultValue: TD.wetSandMinM,
    format: (v) => v.toFixed(2),
    key: 'wetSandMinM',
  },
  {
    id: 'dev-tide-wet-sand-m',
    label: 'Wet sand width max (m)',
    min: 0.5,
    max: 10,
    step: 0.05,
    defaultValue: TD.wetSandM,
    format: (v) => v.toFixed(2),
    key: 'wetSandM',
  },
  {
    id: 'dev-tide-wet-sand-phase-lag',
    label: 'Wet sand phase lag (°)',
    min: 0,
    max: 180,
    step: 1,
    defaultValue: (TD.wetSandPhaseLagRad * 180) / Math.PI,
    format: (v) => `${v.toFixed(0)}°`,
    key: 'wetSandPhaseLagRad',
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
    id: 'dev-tide-foam-width-min',
    label: 'Thin foam width ratio',
    min: 0.1,
    max: 0.95,
    step: 0.02,
    defaultValue: TD.foamWidthMinRatio,
    format: (v) => v.toFixed(2),
    key: 'foamWidthMinRatio',
  },
  {
    id: 'dev-tide-coast-flatten',
    label: 'Coast flatten (m)',
    min: 0.2,
    max: 8,
    step: 0.1,
    defaultValue: TD.coastFlattenM,
    format: (v) => v.toFixed(1),
    key: 'coastFlattenM',
  },
  {
    id: 'dev-tide-shore-slope-step',
    label: 'Shore slope step (m)',
    min: 0.5,
    max: 4,
    step: 0.1,
    defaultValue: TD.shoreSlopeStepM,
    format: (v) => v.toFixed(1),
    key: 'shoreSlopeStepM',
  },
  {
    id: 'dev-tide-shore-max-slope',
    label: 'Shore max slope',
    min: 0.2,
    max: 8,
    step: 0.1,
    defaultValue: TD.shoreMaxSlope,
    format: (v) => v.toFixed(1),
    key: 'shoreMaxSlope',
  },
];
