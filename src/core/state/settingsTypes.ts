// src/core/state/settingsTypes.ts — runtime + DEV settings interfaces

import type { VISUAL } from '../../config/visualTuning';
import type { GrassRingAuthored } from '../../world/grass/config/grassFieldMetrics';
import type {
  TerrainBiomeTuneMap,
  TerrainChiselTune,
  TerrainSnowTune,
  TerrainStylizeTune,
} from '../../world/terrain/config/terrainBiomeTuning';

/** Mutable clone of a `as const` visual object (literals widened). */
type DeepWritable<T> =
  T extends ReadonlyArray<infer U>
    ? T extends readonly [infer A, infer B, infer C]
      ? [DeepWritable<A>, DeepWritable<B>, DeepWritable<C>]
      : Array<DeepWritable<U>>
    : T extends object
      ? { -readonly [K in keyof T]: DeepWritable<T[K]> }
      : T extends number
        ? number
        : T extends string
          ? string
          : T extends boolean
            ? boolean
            : T;

/** Author-tuned ring inputs (radius, density, blade width, segments). */
export type GrassRingTune = GrassRingAuthored;

export type GrassFoliageLightingSettings = DeepWritable<(typeof VISUAL.grass)['foliageLighting']>;

/** Live grass settings = writable `VISUAL.grass` plus DEV flags. */
export type GrassDevSettings = DeepWritable<typeof VISUAL.grass> & {
  enabled: boolean;
  /** DEV: draw every grid slot false-colored by cull reason. */
  cullDebug: boolean;
  /** DEV: false-color blades by LOD ring (green / blue / magenta). */
  lodColorDebug: boolean;
  dirty: boolean;
};

export interface RenderDebugSettings {
  hideTerrain: boolean;
  hideWater: boolean;
  hideMapProps: boolean;
  hideGrass: boolean;
  /** Perf isolate: hide LOD0 draw and skip that ring's compact. */
  hideGrassLod0: boolean;
  /** Perf isolate: hide LOD1 draw and skip that ring's compact. */
  hideGrassLod1: boolean;
  /** Perf isolate: hide LOD2 draw and skip that ring's compact. */
  hideGrassLod2: boolean;
  /** Perf isolate: hide flowers and skip flower compact. */
  hideGrassFlowers: boolean;
  hideSky: boolean;
  hideClouds: boolean;
  disableBloom: boolean;
  disableShadows: boolean;
  disableAa: boolean;
  disableGodRays: boolean;
  disableDof: boolean;
  disableGrade: boolean;
  disableFsr: boolean;
  /** Perf isolate: night valley Y-slab (uFogMaster), including sky/HDRI night mix. */
  disableValleyFog: boolean;
  /** Perf isolate: day camera-XZ aerial (uAerialStrength), including sky horizon mix. */
  disableDistanceHaze: boolean;
  disableShoreDepth: boolean;
  logGpuPeriodic: boolean;
}

export interface TerrainDevSettings {
  biomes: TerrainBiomeTuneMap;
  snow: TerrainSnowTune;
  stylize: TerrainStylizeTune;
  chisel: TerrainChiselTune;
  dirty: boolean;
}

/** Mutable copy of VISUAL.water.shoreDepth for live dev sliders. */
export type WaterShoreDevSettings = DeepWritable<(typeof VISUAL.water)['shoreDepth']>;

export interface WaterTideDevSettings {
  enabled: boolean;
  waveSpeed: number;
  waveAmplitude: number;
  foamColor: string;
  foamWidthM: number;
  foamRippleAmplitude: number;
  foamRippleScale: number;
  foamRippleSpeed: number;
  foamPatchVariation: number;
  foamPatchScale: number;
  foamOpacityMin: number;
  foamWidthMinRatio: number;
  shoreSlopeStepM: number;
  shoreMaxSlope: number;
  coastFlattenM: number;
  runUpM: number;
  runUpPeriodSec: number;
  wetSandDarken: number;
  wetSandMinM: number;
  wetSandM: number;
  wetSandPhaseLagRad: number;
}

export interface WaterDevSettings {
  size: number;
  alpha: number;
  /** Signed mirror-plane offset (m) — negative lifts the plane, positive drops it. */
  reflectionPlaneOffsetM: number;
  /** Reflector resolution ceiling (adaptive quality scales below this inland). */
  resolutionScale: number;
  /** Look stops sampled via todWeights (DEV-mutable). */
  stops: DeepWritable<(typeof VISUAL.water)['stops']>;
  shoreDepth: WaterShoreDevSettings;
  tide: WaterTideDevSettings;
}

/** Mutable mirror of VISUAL.postfx.grade (enabled + per-TOD stops). */
export type PostFxGradeDevSettings = DeepWritable<(typeof VISUAL)['postfx']['grade']>;

export interface PostFxDevSettings {
  grade: PostFxGradeDevSettings;
}

export interface RuntimeSettings {
  terrain: TerrainDevSettings;
  water: WaterDevSettings;
  grass: GrassDevSettings;
  postfx: PostFxDevSettings;
}

export interface DevDebugSettings {
  movementSpeedMultiplier: number;
  showFpsCounter: boolean;
  /** Three.js WebGPU Inspector (Performance / Memory / Timeline / TSL Graph). */
  showThreeInspector: boolean;
  /** DEV: allow orbit pitch down to straight overhead (default floor is ~8.6° above horizon). */
  unconstrainedCameraPitch: boolean;
  renderDebug: RenderDebugSettings;
}

/** Flat combined view used by DEV panels (bridges runtime + debug). */
export interface DevSettings extends DevDebugSettings, RuntimeSettings {}
