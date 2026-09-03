// src/dev/panel/devPanelHazeSpecs.ts — RangeSpec tables for the Distance haze dev panel
import { VISUAL } from '../../config/visualTuning';
import type { HazeCycleParams, ValleyFogParams } from '../../rendering/atmosphere';
import type { RangeSpec } from '../bindRange';

const H = VISUAL.atmosphere.haze;

export interface HazeSpec extends RangeSpec {
  key: keyof Pick<
    ValleyFogParams,
    | 'fogBase'
    | 'fogTop'
    | 'hazeDensity'
    | 'valleyRayMaxM'
    | 'valleyAmbientM'
    | 'valleyEdgeFadeM'
    | 'valleyObscurePower'
    | 'valleyInlandStartM'
    | 'valleyInlandEndM'
    | 'aerialStartM'
    | 'aerialEndM'
    | 'aerialStrength'
    | 'aerialNightMul'
    | 'skyHorizonStart'
    | 'skyHorizonEnd'
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
];

export const AERIAL_SPECS: HazeSpec[] = [
  {
    id: 'dev-haze-aerial-start',
    label: 'Aerial start (m)',
    min: 20,
    max: 400,
    step: 5,
    defaultValue: H.aerialStartM,
    format: (v) => v.toFixed(0),
    key: 'aerialStartM',
  },
  {
    id: 'dev-haze-aerial-end',
    label: 'Aerial end (m)',
    min: 100,
    max: 1200,
    step: 10,
    defaultValue: H.aerialEndM,
    format: (v) => v.toFixed(0),
    key: 'aerialEndM',
  },
  {
    id: 'dev-haze-aerial-str',
    label: 'Aerial strength',
    min: 0,
    max: 1,
    step: 0.05,
    defaultValue: H.aerialStrength,
    format: (v) => v.toFixed(2),
    key: 'aerialStrength',
  },
  {
    id: 'dev-haze-aerial-night-mul',
    label: 'Night aerial (× day)',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: H.aerialNightMul,
    format: (v) => v.toFixed(2),
    key: 'aerialNightMul',
  },
  {
    id: 'dev-haze-sky-horizon-start',
    label: 'Sky horizon start',
    min: 0,
    max: 0.5,
    step: 0.01,
    defaultValue: H.skyHorizonStart,
    format: (v) => v.toFixed(2),
    key: 'skyHorizonStart',
  },
  {
    id: 'dev-haze-sky-horizon-end',
    label: 'Sky horizon end',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    defaultValue: H.skyHorizonEnd,
    format: (v) => v.toFixed(2),
    key: 'skyHorizonEnd',
  },
];

export const VALLEY_VOLUME_SPECS: HazeSpec[] = [
  {
    id: 'dev-haze-density',
    label: 'Valley extinction (1/m)',
    min: 0,
    max: 0.02,
    step: 0.0001,
    defaultValue: H.hazeDensity,
    format: (v) => v.toFixed(4),
    key: 'hazeDensity',
  },
  {
    id: 'dev-haze-valley-ray-max',
    label: 'Valley ray max (m)',
    min: 80,
    max: 800,
    step: 10,
    defaultValue: H.valleyRayMaxM,
    format: (v) => v.toFixed(0),
    key: 'valleyRayMaxM',
  },
  {
    id: 'dev-haze-valley-ambient',
    label: 'Inside-slab veil (m)',
    min: 0,
    max: 80,
    step: 1,
    defaultValue: H.valleyAmbientM,
    format: (v) => v.toFixed(0),
    key: 'valleyAmbientM',
  },
  {
    id: 'dev-haze-valley-edge-fade',
    label: 'Ceiling edge fade (m)',
    min: 0,
    max: 80,
    step: 1,
    defaultValue: H.valleyEdgeFadeM,
    format: (v) => v.toFixed(0),
    key: 'valleyEdgeFadeM',
  },
  {
    id: 'dev-haze-valley-obscure-power',
    label: 'Obscure power (vs fade)',
    min: 1,
    max: 4,
    step: 0.05,
    defaultValue: H.valleyObscurePower,
    format: (v) => v.toFixed(2),
    key: 'valleyObscurePower',
  },
  {
    id: 'dev-haze-inland-start',
    label: 'Inland fade start (m from sea)',
    min: 0,
    max: 200,
    step: 5,
    defaultValue: H.valleyInlandStartM,
    format: (v) => v.toFixed(0),
    key: 'valleyInlandStartM',
  },
  {
    id: 'dev-haze-inland-end',
    label: 'Inland fade end (m from sea)',
    min: 20,
    max: 500,
    step: 10,
    defaultValue: H.valleyInlandEndM,
    format: (v) => v.toFixed(0),
    key: 'valleyInlandEndM',
  },
];

export interface HazeCycleSpec extends RangeSpec {
  key: keyof HazeCycleParams;
}

export const CYCLE_SPECS: HazeCycleSpec[] = [
  {
    id: 'dev-haze-full-elev',
    label: 'Full (night) elevation',
    min: -15,
    max: 15,
    step: 0.5,
    defaultValue: H.fullElevationDeg,
    format: (v) => `${v.toFixed(1)}°`,
    key: 'fullElevationDeg',
  },
  {
    id: 'dev-haze-clear-elev',
    label: 'Clear (day) elevation',
    min: 5,
    max: 70,
    step: 0.5,
    defaultValue: H.clearElevationDeg,
    format: (v) => `${v.toFixed(1)}°`,
    key: 'clearElevationDeg',
  },
  {
    id: 'dev-haze-cycle-power',
    label: 'Night cycle sharpness',
    min: 0.5,
    max: 4,
    step: 0.05,
    defaultValue: H.cyclePower,
    format: (v) => v.toFixed(2),
    key: 'cyclePower',
  },
];

export const ALL_HAZE_SPECS: HazeSpec[] = [...BAND_SPECS, ...AERIAL_SPECS, ...VALLEY_VOLUME_SPECS];
