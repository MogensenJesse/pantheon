// src/ui/dev/sky/devPanelCloudsSpecs.ts — RangeSpec tables for procedural cloud dev panel
import { VISUAL } from '../../../config/visualTuning';
import type { CloudSettings } from '../../../rendering/clouds/cloudConfig';
import type { RangeSpec } from '../bindRange';

const C = VISUAL.clouds;

export interface CloudSpec extends RangeSpec {
  key: keyof CloudSettings;
}

/** Baked at generation — changing these rebuilds the instanced field. */
export const CLOUD_LAYOUT_SPECS: CloudSpec[] = [
  {
    id: 'dev-cloud-seed',
    label: 'Seed',
    min: 0,
    max: 99999,
    step: 1,
    defaultValue: C.seed,
    format: (v) => v.toFixed(0),
    key: 'seed',
  },
  {
    id: 'dev-cloud-count',
    label: 'Cloud count',
    min: 0,
    max: 48,
    step: 1,
    defaultValue: C.cloudCount,
    format: (v) => v.toFixed(0),
    key: 'cloudCount',
  },
  {
    id: 'dev-cloud-particles',
    label: 'Particles / cloud',
    min: 4,
    max: 40,
    step: 1,
    defaultValue: C.particlesPerCloud,
    format: (v) => v.toFixed(0),
    key: 'particlesPerCloud',
  },
  {
    id: 'dev-cloud-base-y',
    label: 'Base altitude (m)',
    min: 80,
    max: 320,
    step: 1,
    defaultValue: C.cloudBaseY,
    format: (v) => v.toFixed(0),
    key: 'cloudBaseY',
  },
  {
    id: 'dev-cloud-alt-jitter',
    label: 'Altitude jitter (m)',
    min: 0,
    max: 120,
    step: 1,
    defaultValue: C.altitudeJitter,
    format: (v) => v.toFixed(0),
    key: 'altitudeJitter',
  },
  {
    id: 'dev-cloud-spread',
    label: 'Spread (m)',
    min: 200,
    max: 1600,
    step: 10,
    defaultValue: C.spread,
    format: (v) => v.toFixed(0),
    key: 'spread',
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
    id: 'dev-cloud-facing-pow',
    label: 'Rim soft pow (↑ softer)',
    min: 0.5,
    max: 4,
    step: 0.05,
    defaultValue: C.facingPow,
    format: (v) => v.toFixed(2),
    key: 'facingPow',
  },
  {
    id: 'dev-cloud-edge-soft',
    label: 'Rim soft width',
    min: 0.05,
    max: 1,
    step: 0.01,
    defaultValue: C.edgeSoftness,
    format: (v) => v.toFixed(2),
    key: 'edgeSoftness',
  },
  {
    id: 'dev-cloud-wind-speed',
    label: 'Wind speed',
    min: 0,
    max: 24,
    step: 0.1,
    defaultValue: C.windSpeed,
    format: (v) => v.toFixed(1),
    key: 'windSpeed',
  },
  {
    id: 'dev-cloud-wind-dir',
    label: 'Wind direction (°)',
    min: 0,
    max: 360,
    step: 1,
    defaultValue: C.windDirectionDeg,
    format: (v) => v.toFixed(0),
    key: 'windDirectionDeg',
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

/** Reveal ramp multipliers on preset coverage. */
export const CLOUD_REVEAL_SPECS: CloudSpec[] = [
  {
    id: 'dev-cloud-reveal-min',
    label: 'Reveal min coverage',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.revealMinCoverage,
    format: (v) => v.toFixed(2),
    key: 'revealMinCoverage',
  },
  {
    id: 'dev-cloud-reveal-max',
    label: 'Reveal max coverage',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: C.revealMaxCoverage,
    format: (v) => v.toFixed(2),
    key: 'revealMaxCoverage',
  },
];

export const ALL_CLOUD_SPECS: CloudSpec[] = [
  ...CLOUD_LAYOUT_SPECS,
  ...CLOUD_RUNTIME_SPECS,
  ...CLOUD_TERRAIN_SPECS,
  ...CLOUD_REVEAL_SPECS,
];
