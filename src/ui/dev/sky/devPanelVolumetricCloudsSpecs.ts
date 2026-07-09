// src/ui/dev/sky/devPanelVolumetricCloudsSpecs.ts — RangeSpec tables for volumetric cloud dev panel
import { VISUAL } from '../../../config/visualTuning';
import type { VolumetricCloudParams } from '../../../rendering/clouds/volumetric/volumetricCloudDevState';
import type { RangeSpec } from '../bindRange';

const V = VISUAL.clouds.volumetric;

export interface VolumetricCloudSpec extends RangeSpec {
  key: keyof VolumetricCloudParams;
  /** Requires post pipeline rebuild (march loop / FBM octaves). */
  shaderRebuild?: boolean;
}

export const VOLUMETRIC_QUALITY_SPECS: VolumetricCloudSpec[] = [
  {
    id: 'dev-vol-pass-scale',
    label: 'Pass resolution scale',
    min: 0.25,
    max: 1,
    step: 0.05,
    defaultValue: V.passResolutionScale,
    format: (v) => v.toFixed(2),
    key: 'passResolutionScale',
    shaderRebuild: true,
  },
  {
    id: 'dev-vol-march-jitter',
    label: 'March jitter',
    min: 0,
    max: 0.8,
    step: 0.01,
    defaultValue: V.marchJitter,
    format: (v) => v.toFixed(2),
    key: 'marchJitter',
  },
];

export const VOLUMETRIC_SLAB_SPECS: VolumetricCloudSpec[] = [
  {
    id: 'dev-vol-base-lift',
    label: 'Base lift (m)',
    min: 0,
    max: 120,
    step: 1,
    defaultValue: V.baseLiftM,
    format: (v) => v.toFixed(0),
    key: 'baseLiftM',
  },
  {
    id: 'dev-vol-top-margin',
    label: 'Top margin (m)',
    min: 20,
    max: 140,
    step: 1,
    defaultValue: V.topMarginM,
    format: (v) => v.toFixed(0),
    key: 'topMarginM',
  },
  {
    id: 'dev-vol-slab-fade',
    label: 'Slab fade (m)',
    min: 8,
    max: 96,
    step: 1,
    defaultValue: V.slabFadeM,
    format: (v) => v.toFixed(0),
    key: 'slabFadeM',
  },
];

export const VOLUMETRIC_FIELD_SPECS: VolumetricCloudSpec[] = [
  {
    id: 'dev-vol-radius-mul',
    label: 'Radius × spread',
    min: 0.2,
    max: 0.9,
    step: 0.01,
    defaultValue: V.radiusSpreadMul,
    format: (v) => v.toFixed(2),
    key: 'radiusSpreadMul',
  },
  {
    id: 'dev-vol-radial-fade',
    label: 'Radial fade × spread',
    min: 0.1,
    max: 0.6,
    step: 0.01,
    defaultValue: V.radialFadeSpreadMul,
    format: (v) => v.toFixed(2),
    key: 'radialFadeSpreadMul',
  },
];

export const VOLUMETRIC_DENSITY_SPECS: VolumetricCloudSpec[] = [
  {
    id: 'dev-vol-coverage',
    label: 'Coverage',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: V.coverage,
    format: (v) => v.toFixed(2),
    key: 'coverage',
  },
  {
    id: 'dev-vol-shape-scale',
    label: 'Shape scale',
    min: 0.02,
    max: 0.12,
    step: 0.001,
    defaultValue: V.shapeScale,
    format: (v) => v.toFixed(3),
    key: 'shapeScale',
  },
  {
    id: 'dev-vol-detail-scale',
    label: 'Detail scale',
    min: 0.04,
    max: 0.2,
    step: 0.001,
    defaultValue: V.detailScale,
    format: (v) => v.toFixed(3),
    key: 'detailScale',
  },
  {
    id: 'dev-vol-detail-strength',
    label: 'Detail erosion',
    min: 0,
    max: 0.4,
    step: 0.01,
    defaultValue: V.detailStrength,
    format: (v) => v.toFixed(2),
    key: 'detailStrength',
  },
];

export const VOLUMETRIC_RAYMARCH_SPECS: VolumetricCloudSpec[] = [
  {
    id: 'dev-vol-absorption',
    label: 'Absorption',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    defaultValue: V.absorption,
    format: (v) => v.toFixed(2),
    key: 'absorption',
  },
  {
    id: 'dev-vol-density-pow',
    label: 'March density pow',
    min: 1,
    max: 3,
    step: 0.05,
    defaultValue: V.marchDensityPow,
    format: (v) => v.toFixed(2),
    key: 'marchDensityPow',
  },
  {
    id: 'dev-vol-integration-scale',
    label: 'March integration scale',
    min: 0.02,
    max: 0.5,
    step: 0.01,
    defaultValue: V.marchIntegrationScale,
    format: (v) => v.toFixed(2),
    key: 'marchIntegrationScale',
  },
  {
    id: 'dev-vol-max-steps',
    label: 'March steps',
    min: 4,
    max: 24,
    step: 1,
    defaultValue: V.maxSteps,
    format: (v) => v.toFixed(0),
    key: 'maxSteps',
    shaderRebuild: true,
  },
  {
    id: 'dev-vol-march-shape-oct',
    label: 'March shape octaves',
    min: 1,
    max: 4,
    step: 1,
    defaultValue: V.marchShapeOctaves,
    format: (v) => v.toFixed(0),
    key: 'marchShapeOctaves',
    shaderRebuild: true,
  },
  {
    id: 'dev-vol-march-detail-oct',
    label: 'March detail octaves',
    min: 0,
    max: 3,
    step: 1,
    defaultValue: V.marchDetailOctaves,
    format: (v) => v.toFixed(0),
    key: 'marchDetailOctaves',
    shaderRebuild: true,
  },
  {
    id: 'dev-vol-debug-shape-oct',
    label: 'Debug shape octaves',
    min: 1,
    max: 4,
    step: 1,
    defaultValue: V.debugShapeOctaves,
    format: (v) => v.toFixed(0),
    key: 'debugShapeOctaves',
    shaderRebuild: true,
  },
];

export const ALL_VOLUMETRIC_CLOUD_SPECS: VolumetricCloudSpec[] = [
  ...VOLUMETRIC_QUALITY_SPECS,
  ...VOLUMETRIC_SLAB_SPECS,
  ...VOLUMETRIC_FIELD_SPECS,
  ...VOLUMETRIC_DENSITY_SPECS,
  ...VOLUMETRIC_RAYMARCH_SPECS,
];
