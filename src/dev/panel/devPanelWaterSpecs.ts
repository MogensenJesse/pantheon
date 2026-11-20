// src/dev/panel/devPanelWaterSpecs.ts — RangeSpec tables for the Water dev panel
import { VISUAL } from '../../config/visualTuning';
import type { WaterShoreDevSettings } from '../../core/settings';
import type { RangeSpec } from '../bindRange';

const SD = VISUAL.water.shoreDepth;

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
    | 'shallowOverRefract'
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
    label: 'Waterline edge softness (m)',
    min: 0.1,
    max: 8,
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
    id: 'dev-shore-shallow-over-refract',
    label: 'Shallow tint (over seabed)',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: SD.shallowOverRefract,
    format: (v) => v.toFixed(2),
    key: 'shallowOverRefract',
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
