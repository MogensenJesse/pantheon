// src/dev/panel/devPanelShadowsSpecs.ts — RangeSpec tables for the Shadows dev panel
import type { DirectionalLight } from 'three';
import { VISUAL } from '../../config/visualTuning';
import {
  readContactShadowSoftness,
  type SunShadowReceiverProfile,
  setContactShadowSoftness,
} from '../../rendering/sunShadow';
import type { RangeSpec } from '../bindRange';

const L = VISUAL.shadows.lighting;
const R = VISUAL.shadows.receivers;
const FL = VISUAL.props.foliageLighting;
const GC = VISUAL.props.groundContact;

export interface CastSpec extends RangeSpec {
  /** Cast knobs apply to the near cascade light (ground PCSS). */
  apply: (nearLight: DirectionalLight, value: number) => void;
  read: (nearLight: DirectionalLight) => number;
}

export const CAST_SPECS: CastSpec[] = [
  {
    id: 'dev-shadow-soft-min',
    label: 'Softness min (texels)',
    min: 0,
    max: 16,
    step: 0.1,
    defaultValue: L.shadowSoftnessMin,
    format: (v) => v.toFixed(1),
    apply: (nearLight, v) => {
      setContactShadowSoftness(nearLight, { softnessMin: v });
    },
    read: (_nearLight) => readContactShadowSoftness().softnessMin,
  },
  {
    id: 'dev-shadow-soft-max',
    label: 'Softness max (texels)',
    min: 1,
    max: 64,
    step: 0.5,
    defaultValue: L.shadowSoftnessMax,
    format: (v) => v.toFixed(1),
    apply: (nearLight, v) => {
      setContactShadowSoftness(nearLight, { softnessMax: v });
    },
    read: (_nearLight) => readContactShadowSoftness().softnessMax,
  },
  {
    id: 'dev-shadow-penumbra-scale',
    label: 'Penumbra scale',
    min: 20,
    max: 800,
    step: 5,
    defaultValue: L.shadowPenumbraScale,
    format: (v) => v.toFixed(0),
    apply: (nearLight, v) => {
      setContactShadowSoftness(nearLight, { penumbraScale: v });
    },
    read: (_nearLight) => readContactShadowSoftness().penumbraScale,
  },
  {
    id: 'dev-shadow-bias',
    label: 'Depth bias',
    min: -0.005,
    max: 0.001,
    step: 0.00005,
    defaultValue: L.shadowBias,
    format: (v) => v.toFixed(5),
    apply: (nearLight, v) => {
      nearLight.shadow.bias = v;
    },
    read: (nearLight) => nearLight.shadow.bias,
  },
  {
    id: 'dev-shadow-normal-bias',
    label: 'Normal bias',
    min: 0,
    max: 0.1,
    step: 0.001,
    defaultValue: L.shadowNormalBias,
    format: (v) => v.toFixed(3),
    apply: (nearLight, v) => {
      nearLight.shadow.normalBias = v;
    },
    read: (nearLight) => nearLight.shadow.normalBias,
  },
];

export interface FloorSpec extends RangeSpec {
  profile: SunShadowReceiverProfile;
}

export const FLOOR_SPECS: FloorSpec[] = [
  {
    id: 'dev-shadow-floor-terrain',
    label: 'Terrain floor',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.terrain.shadowFloor,
    format: (v) => v.toFixed(2),
    profile: 'terrain',
  },
  {
    id: 'dev-shadow-floor-grass',
    label: 'Grass floor',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.grass.shadowFloor,
    format: (v) => v.toFixed(2),
    profile: 'grass',
  },
  {
    id: 'dev-shadow-floor-props',
    label: 'Props floor',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.props.shadowFloor,
    format: (v) => v.toFixed(2),
    profile: 'props',
  },
  {
    id: 'dev-shadow-floor-water',
    label: 'Water floor',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.water.shadowFloor,
    format: (v) => v.toFixed(2),
    profile: 'water',
  },
];

export interface PropSpec extends RangeSpec {
  key: keyof Pick<typeof R.props, 'shadowStrength'> | 'alphaTest' | 'alphaCutoffSharpness';
}

export const PROP_SPECS: PropSpec[] = [
  {
    id: 'dev-shadow-prop-strength',
    label: 'Shadow strength',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: R.props.shadowStrength,
    format: (v) => v.toFixed(2),
    key: 'shadowStrength',
  },
  {
    id: 'dev-prop-alpha-cutoff',
    label: 'Alpha cutoff (leaves)',
    min: 0.1,
    max: 0.7,
    step: 0.01,
    defaultValue: VISUAL.props.alphaTest,
    format: (v) => v.toFixed(2),
    key: 'alphaTest',
  },
  {
    id: 'dev-prop-alpha-sharpness',
    label: 'Alpha sharpness',
    min: 0,
    max: 0.15,
    step: 0.005,
    defaultValue: VISUAL.props.alphaCutoffSharpness,
    format: (v) => v.toFixed(3),
    key: 'alphaCutoffSharpness',
  },
];

export interface FoliageSpec extends RangeSpec {
  key: keyof Pick<
    typeof FL,
    | 'wrapStrength'
    | 'hemisphereStrength'
    | 'vertexColorMul'
    | 'foliageMul'
    | 'barkMul'
    | 'defaultMul'
  >;
}

export const FOLIAGE_SPECS: FoliageSpec[] = [
  {
    id: 'dev-foliage-wrap',
    label: 'Wrap diffuse',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: FL.wrapStrength,
    format: (v) => v.toFixed(2),
    key: 'wrapStrength',
  },
  {
    id: 'dev-foliage-hemisphere',
    label: 'Hemisphere ambient',
    min: 0,
    max: 1,
    step: 0.01,
    defaultValue: FL.hemisphereStrength,
    format: (v) => v.toFixed(2),
    key: 'hemisphereStrength',
  },
  {
    id: 'dev-foliage-vertex-color',
    label: 'Vertex color (bark AO)',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: FL.vertexColorMul,
    format: (v) => v.toFixed(2),
    key: 'vertexColorMul',
  },
  {
    id: 'dev-foliage-mul-leaves',
    label: 'Leaves / foliage mul',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: FL.foliageMul,
    format: (v) => v.toFixed(2),
    key: 'foliageMul',
  },
  {
    id: 'dev-foliage-mul-bark',
    label: 'Bark mul',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: FL.barkMul,
    format: (v) => v.toFixed(2),
    key: 'barkMul',
  },
  {
    id: 'dev-foliage-mul-default',
    label: 'Rock / default mul',
    min: 0,
    max: 2,
    step: 0.01,
    defaultValue: FL.defaultMul,
    format: (v) => v.toFixed(2),
    key: 'defaultMul',
  },
];

export interface GroundContactSpec extends RangeSpec {
  key:
    | 'fadeHeightM'
    | 'darkenMax'
    | 'tintStrength'
    | 'barkStrength'
    | 'foliageStrength'
    | 'defaultStrength'
    | 'terrainAoStrength'
    | 'terrainAoSunStrength';
}

export interface TerrainAoShapeSpec extends RangeSpec {
  key: 'coreHeightM' | 'baseHeightM' | 'radiusM';
}

export const GROUND_CONTACT_SPECS: GroundContactSpec[] = [
  {
    id: 'dev-ground-contact-fade',
    label: 'Fade height (m)',
    min: 0.05,
    max: 1.5,
    step: 0.05,
    defaultValue: GC.fadeHeightM,
    format: (v) => v.toFixed(2),
    key: 'fadeHeightM',
  },
  {
    id: 'dev-ground-contact-darken',
    label: 'Darken max',
    min: 0,
    max: 0.85,
    step: 0.02,
    defaultValue: GC.darkenMax,
    format: (v) => v.toFixed(2),
    key: 'darkenMax',
  },
  {
    id: 'dev-ground-contact-tint',
    label: 'Ground tint strength',
    min: 0,
    max: 0.6,
    step: 0.02,
    defaultValue: GC.tintStrength,
    format: (v) => v.toFixed(2),
    key: 'tintStrength',
  },
  {
    id: 'dev-ground-contact-bark',
    label: 'Bark / trunk strength',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultValue: GC.barkStrength,
    format: (v) => v.toFixed(2),
    key: 'barkStrength',
  },
  {
    id: 'dev-ground-contact-foliage',
    label: 'Foliage strength',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultValue: GC.foliageStrength,
    format: (v) => v.toFixed(2),
    key: 'foliageStrength',
  },
  {
    id: 'dev-ground-contact-default',
    label: 'Rock / default strength',
    min: 0,
    max: 1.5,
    step: 0.05,
    defaultValue: GC.defaultStrength,
    format: (v) => v.toFixed(2),
    key: 'defaultStrength',
  },
  {
    id: 'dev-terrain-ao-strength',
    label: 'Terrain AO strength',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: GC.terrainAo.strength,
    format: (v) => v.toFixed(2),
    key: 'terrainAoStrength',
  },
  {
    id: 'dev-terrain-ao-sun',
    label: 'Terrain AO sun strength',
    min: 0,
    max: 1,
    step: 0.02,
    defaultValue: GC.terrainAo.sunStrength,
    format: (v) => v.toFixed(2),
    key: 'terrainAoSunStrength',
  },
];

/** Bake-time shape knobs — live via debounced prop-AO rebake (no full reload). */
export const TERRAIN_AO_SHAPE_SPECS: TerrainAoShapeSpec[] = [
  {
    id: 'dev-terrain-ao-core',
    label: 'Terrain AO core height (m)',
    min: 0.1,
    max: 8,
    step: 0.1,
    defaultValue: GC.terrainAo.coreHeightM,
    format: (v) => v.toFixed(1),
    key: 'coreHeightM',
  },
  {
    id: 'dev-terrain-ao-base',
    label: 'Terrain AO base height (m)',
    min: 0.5,
    max: 20,
    step: 0.5,
    defaultValue: GC.terrainAo.baseHeightM,
    format: (v) => v.toFixed(1),
    key: 'baseHeightM',
  },
  {
    id: 'dev-terrain-ao-radius',
    label: 'Terrain AO radius (m)',
    min: 0,
    max: 4,
    step: 0.05,
    defaultValue: GC.terrainAo.radiusM,
    format: (v) => v.toFixed(2),
    key: 'radiusM',
  },
];
