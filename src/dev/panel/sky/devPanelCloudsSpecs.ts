// src/dev/panel/sky/devPanelCloudsSpecs.ts — RangeSpec tables for procedural cloud dev panel
import { VISUAL } from '../../../config/visualTuning';
import type { CloudSettings } from '../../../rendering/clouds/cloudConfig';
import type { RangeSpec } from '../../bindRange';

const C = VISUAL.clouds;

export interface CloudSpec extends RangeSpec {
  key: keyof CloudSettings;
}

/** Baked at generation — changing these rebuilds the instanced field. */
export const CLOUD_SHAPE_SPECS: CloudSpec[] = [
  {
    id: 'dev-cloud-particles',
    label: 'Particles',
    min: 4,
    max: 48,
    step: 1,
    defaultValue: C.particles,
    format: (v) => v.toFixed(0),
    key: 'particles',
  },
  {
    id: 'dev-cloud-puff-radius',
    label: 'Radius scale',
    min: 0.2,
    max: 3,
    step: 0.05,
    defaultValue: C.puffRadiusScale,
    format: (v) => v.toFixed(2),
    key: 'puffRadiusScale',
  },
  {
    id: 'dev-cloud-puff-height',
    label: 'Height scale',
    min: 0.1,
    max: 3,
    step: 0.05,
    defaultValue: C.puffHeightScale,
    format: (v) => v.toFixed(2),
    key: 'puffHeightScale',
  },
  {
    id: 'dev-cloud-deck-base',
    label: 'Deck base fraction',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.deckBaseFraction,
    format: (v) => v.toFixed(2),
    key: 'deckBaseFraction',
  },
];

/** Per-frame tunables — no field rebuild. */
export const CLOUD_RUNTIME_SPECS: CloudSpec[] = [
  {
    id: 'dev-cloud-opacity',
    label: 'Opacity',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.opacity,
    format: (v) => v.toFixed(2),
    key: 'opacity',
  },
  {
    id: 'dev-cloud-wind-dir',
    label: 'Wind direction (deg)',
    min: 0,
    max: 360,
    step: 1,
    defaultValue: C.windDirectionDeg,
    format: (v) => v.toFixed(0),
    key: 'windDirectionDeg',
  },
];

/** One puff edge. Cotton speed is the motion. Live uniforms. */
export const CLOUD_EDGE_SPECS: CloudSpec[] = [
  {
    id: 'dev-cloud-facing-pow',
    label: 'Rim power',
    min: 0.5,
    max: 4,
    step: 0.05,
    defaultValue: C.facingPow,
    format: (v) => v.toFixed(2),
    key: 'facingPow',
  },
  {
    id: 'dev-cloud-edge-soft',
    label: 'Edge width',
    min: 0.05,
    max: 1,
    step: 0.01,
    defaultValue: C.edgeSoftness,
    format: (v) => v.toFixed(2),
    key: 'edgeSoftness',
  },
  {
    id: 'dev-cloud-corner-radius',
    label: 'Roundness',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.cornerRadius,
    format: (v) => v.toFixed(2),
    key: 'cornerRadius',
  },
  {
    id: 'dev-cloud-wisp-strength',
    label: 'Cotton',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.wispStrength,
    format: (v) => v.toFixed(2),
    key: 'wispStrength',
  },
  {
    id: 'dev-cloud-wisp-scale-a',
    label: 'Cotton scale',
    min: 0.01,
    max: 0.2,
    step: 0.005,
    defaultValue: C.wispScaleA,
    format: (v) => v.toFixed(3),
    key: 'wispScaleA',
  },
  {
    id: 'dev-cloud-wisp-speed',
    label: 'Cotton speed',
    min: 0,
    max: 0.6,
    step: 0.01,
    defaultValue: C.wispSpeed,
    format: (v) => v.toFixed(2),
    key: 'wispSpeed',
  },
];

/** Terrain hug + soft-fade — live uniforms + per-frame lift. */
export const CLOUD_TERRAIN_SPECS: CloudSpec[] = [
  {
    id: 'dev-cloud-terrain-clearance',
    label: 'Terrain clearance (m)',
    min: 0,
    max: 40,
    step: 0.5,
    defaultValue: C.terrainClearanceM,
    format: (v) => v.toFixed(1),
    key: 'terrainClearanceM',
  },
  {
    id: 'dev-cloud-terrain-fade',
    label: 'Terrain fade below (m)',
    min: 0,
    max: 40,
    step: 0.5,
    defaultValue: C.terrainFadeBelowM,
    format: (v) => v.toFixed(1),
    key: 'terrainFadeBelowM',
  },
];

/** Lighting cohesion + valley haze + shadow receive — live uniforms. */
export const CLOUD_LIGHTING_SPECS: CloudSpec[] = [
  {
    id: 'dev-cloud-light-flatten',
    label: 'Light flatten',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.lightFlatten,
    format: (v) => v.toFixed(2),
    key: 'lightFlatten',
  },
  {
    id: 'dev-cloud-haze-mix',
    label: 'Night valley haze mix',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.hazeMix,
    format: (v) => v.toFixed(2),
    key: 'hazeMix',
  },
  {
    id: 'dev-cloud-shadow-floor',
    label: 'Shadow floor',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.shadowFloor,
    format: (v) => v.toFixed(2),
    key: 'shadowFloor',
  },
  {
    id: 'dev-cloud-shadow-lift',
    label: 'Shadow sample lift (m)',
    min: 0,
    max: 20,
    step: 0.5,
    defaultValue: C.shadowSampleLiftM,
    format: (v) => v.toFixed(1),
    key: 'shadowSampleLiftM',
  },
  {
    id: 'dev-cloud-light-scale-min',
    label: 'Light scale floor',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: C.lightScaleMin,
    format: (v) => v.toFixed(2),
    key: 'lightScaleMin',
  },
  {
    id: 'dev-cloud-sun-catch',
    label: 'Sun catch (lit face)',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.sunCatchStrength,
    format: (v) => v.toFixed(2),
    key: 'sunCatchStrength',
  },
  {
    id: 'dev-cloud-mass-normal-mix',
    label: 'Mass normal mix',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.massNormalMix,
    format: (v) => v.toFixed(2),
    key: 'massNormalMix',
  },
  {
    id: 'dev-cloud-base-shade',
    label: 'Base shade',
    min: 0,
    max: 0.6,
    step: 0.01,
    defaultValue: C.baseShade,
    format: (v) => v.toFixed(2),
    key: 'baseShade',
  },
  {
    id: 'dev-cloud-self-shadow',
    label: 'Mass self-shadow',
    min: 0.5,
    max: 4,
    step: 0.05,
    defaultValue: C.selfShadow,
    format: (v) => v.toFixed(2),
    key: 'selfShadow',
  },
  {
    id: 'dev-cloud-silver-strength',
    label: 'Silver lining',
    min: 0,
    max: 1.5,
    step: 0.01,
    defaultValue: C.silverStrength,
    format: (v) => v.toFixed(2),
    key: 'silverStrength',
  },
  {
    id: 'dev-cloud-silver-g',
    label: 'Silver HG g',
    min: 0,
    max: 0.95,
    step: 0.01,
    defaultValue: C.silverG,
    format: (v) => v.toFixed(2),
    key: 'silverG',
  },
];

/** Energy/atmosphere reveal opacity ramp (not day/night — night stays visible). */
export const CLOUD_REVEAL_SPECS: CloudSpec[] = [
  {
    id: 'dev-cloud-reveal-min',
    label: 'Reveal min opacity',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.revealMinCoverage,
    format: (v) => v.toFixed(2),
    key: 'revealMinCoverage',
  },
  {
    id: 'dev-cloud-reveal-max',
    label: 'Reveal max opacity',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.revealMaxCoverage,
    format: (v) => v.toFixed(2),
    key: 'revealMaxCoverage',
  },
];

export const ALL_CLOUD_SPECS: CloudSpec[] = [
  ...CLOUD_SHAPE_SPECS,
  ...CLOUD_RUNTIME_SPECS,
  ...CLOUD_EDGE_SPECS,
  ...CLOUD_TERRAIN_SPECS,
  ...CLOUD_LIGHTING_SPECS,
  ...CLOUD_REVEAL_SPECS,
];
