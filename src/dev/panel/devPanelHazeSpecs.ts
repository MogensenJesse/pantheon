// src/dev/panel/devPanelHazeSpecs.ts — RangeSpec tables for the Distance haze dev panel
import { VISUAL } from '../../config/visualTuning';
import type { ValleyFogParams } from '../../rendering/atmosphere/valleyFog';
import type { RangeSpec } from '../bindRange';

const H = VISUAL.atmosphere.haze;

export interface HazeSpec extends RangeSpec {
  key: keyof Pick<
    ValleyFogParams,
    | 'fogBase'
    | 'fogTop'
    | 'hazeDensity'
    | 'bandStrength'
    | 'noiseScaleA'
    | 'noiseScaleB'
    | 'noiseAmplitude'
    | 'noiseStrength'
  >;
}

export const BAND_SPECS: HazeSpec[] = [
  {
    id: 'dev-haze-fog-base',
    label: 'Fog base (world Y)',
    min: -40,
    max: 40,
    step: 1,
    defaultValue: H.fogBase,
    format: (v) => v.toFixed(0),
    key: 'fogBase',
  },
  {
    id: 'dev-haze-fog-top',
    label: 'Fog top — night (world Y)',
    min: 0,
    max: 200,
    step: 1,
    defaultValue: H.fogTop,
    format: (v) => v.toFixed(0),
    key: 'fogTop',
  },
  {
    id: 'dev-haze-band-strength',
    label: 'Band strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: H.bandStrength,
    format: (v) => v.toFixed(2),
    key: 'bandStrength',
  },
];

export const DISTANCE_SPECS: HazeSpec[] = [
  {
    id: 'dev-haze-density',
    label: 'Distance haze density',
    min: 0,
    max: 0.005,
    step: 0.0001,
    defaultValue: H.hazeDensity,
    format: (v) => v.toFixed(4),
    key: 'hazeDensity',
  },
];

export const NOISE_SPECS: HazeSpec[] = [
  {
    id: 'dev-haze-noise-strength',
    label: 'Wisp strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: H.noiseStrength,
    format: (v) => v.toFixed(2),
    key: 'noiseStrength',
  },
  {
    id: 'dev-haze-noise-amp',
    label: 'Wisp amplitude (m)',
    min: 0,
    max: 60,
    step: 1,
    defaultValue: H.noiseAmplitude,
    format: (v) => v.toFixed(0),
    key: 'noiseAmplitude',
  },
  {
    id: 'dev-haze-noise-scale-a',
    label: 'Noise scale A',
    min: 0.001,
    max: 0.02,
    step: 0.0005,
    defaultValue: H.noiseScaleA,
    format: (v) => v.toFixed(4),
    key: 'noiseScaleA',
  },
  {
    id: 'dev-haze-noise-scale-b',
    label: 'Noise scale B',
    min: 0.001,
    max: 0.03,
    step: 0.0005,
    defaultValue: H.noiseScaleB,
    format: (v) => v.toFixed(4),
    key: 'noiseScaleB',
  },
];

export const ALL_HAZE_SPECS: HazeSpec[] = [...BAND_SPECS, ...DISTANCE_SPECS, ...NOISE_SPECS];
