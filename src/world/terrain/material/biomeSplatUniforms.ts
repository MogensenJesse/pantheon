// src/world/terrain/material/biomeSplatUniforms.ts — uniform creation + dev wiring for biome splat material

import { Color, type DirectionalLight, type Texture, Vector2, Vector3 } from 'three';
import { texture, uniform } from 'three/tsl';
import { PHASE0 } from '../../../config/phase0';
import { VISUAL } from '../../../config/visualTuning';
import { createSunShadowNode, TERRAIN_SHADOW_FLOOR_DEFAULT, type SunShadowNode } from '../../../rendering/sunShadow';
import { WORLD } from '../../WorldConfig';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_PLATEAU_FLATNESS_END,
  TERRAIN_PLATEAU_FLATNESS_START,
  TERRAIN_SLOPE_ROCK_START,
  type TerrainAtlasBiomeKey,
  type TerrainBiomeTuneMap,
} from '../config/terrainBiomeTuning';

/** Minimum sun visibility in shadowed splat (0 = black shadows, 1 = no darkening). */
export { TERRAIN_SHADOW_FLOOR_DEFAULT };

export interface BiomeSplatThresholds {
  waterMax: number;
  shoreMax: number;
  forestMax: number;
  hillsMax: number;
  blendWidth: number;
}

export function biomeSplatThresholds(): BiomeSplatThresholds {
  const { BIOMES } = WORLD;
  return {
    waterMax: BIOMES.WATER.max,
    shoreMax: BIOMES.SHORE.max,
    forestMax: BIOMES.FOREST.max,
    hillsMax: BIOMES.HILLS.max,
    blendWidth: 0.06,
  };
}

export type PerBiomeUniformMap = Record<TerrainAtlasBiomeKey, ReturnType<typeof uniform>>;

export interface TerrainBiomeParamUniforms {
  repeat: PerBiomeUniformMap;
  detailDisp: PerBiomeUniformMap;
  normal: PerBiomeUniformMap;
  roughness: PerBiomeUniformMap;
}

export interface TerrainSplatUniforms extends TerrainBiomeParamUniforms {
  uWaterMax: ReturnType<typeof uniform>;
  uShoreMax: ReturnType<typeof uniform>;
  uForestMax: ReturnType<typeof uniform>;
  uHillsMax: ReturnType<typeof uniform>;
  uBlendWidth: ReturnType<typeof uniform>;
  uPathTint: ReturnType<typeof uniform>;
  uSunDirection: ReturnType<typeof uniform>;
  uSunColor: ReturnType<typeof uniform>;
  uSunIntensity: ReturnType<typeof uniform>;
  uAmbientColor: ReturnType<typeof uniform>;
  uAmbientIntensity: ReturnType<typeof uniform>;
  uViewCamPos: ReturnType<typeof uniform>;
  uPlayerPos: ReturnType<typeof uniform>;
  /** Clipmap detail square origin (snapped XZ) — must match center patch mesh position. */
  uDetailPatchOrigin: ReturnType<typeof uniform>;
  uLightRadius: ReturnType<typeof uniform>;
  uLightIntensity: ReturnType<typeof uniform>;
  uPlayerGlowMul: ReturnType<typeof uniform>;
  uDebugShadowView: ReturnType<typeof uniform>;
  uShadowFloor: ReturnType<typeof uniform>;
  uSnowHeightStart: ReturnType<typeof uniform>;
  uSnowHeightEnd: ReturnType<typeof uniform>;
  uSnowMountainWeight: ReturnType<typeof uniform>;
  uBiomeMap: ReturnType<typeof texture>;
  uPathMap: ReturnType<typeof texture>;
  uMeadowMap: ReturnType<typeof texture>;
  uUseBiomeMap: ReturnType<typeof uniform>;
  uWorldSize: ReturnType<typeof uniform>;
  uHeightTex: ReturnType<typeof texture>;
  uHeightScale: ReturnType<typeof uniform>;
  /** World metres between visible mesh vertices — macro-normal finite-difference step. */
  uHeightNormalStep: ReturnType<typeof uniform>;
  /** Clipmap detail circle outer radius (m) — detail disp = 0; opacity handoff. */
  uDetailRadiusM: ReturnType<typeof uniform>;
  /** Clipmap inner radius (m) — full detail disp inside; smoothstep fade to uDetailRadiusM. */
  uDetailDispFadeStartM: ReturnType<typeof uniform>;
  /** Outer layer handoff band (m) — min fade width at detailRadiusM when fade start is 0. */
  uLayerFadeBandM: ReturnType<typeof uniform>;
}

export interface BiomeSplatUniformBundle {
  uniforms: TerrainSplatUniforms;
  sunShadow: SunShadowNode;
  thresholds: BiomeSplatThresholds;
}

function createPerBiomeUniformMap(
  biomes: TerrainBiomeTuneMap,
  field: keyof TerrainBiomeTuneMap[TerrainAtlasBiomeKey],
): PerBiomeUniformMap {
  const map = {} as PerBiomeUniformMap;
  for (const key of TERRAIN_ATLAS_BIOME_KEYS) {
    map[key] = uniform(biomes[key][field]);
  }
  return map;
}

export function createBiomeParamUniforms(biomes: TerrainBiomeTuneMap): TerrainBiomeParamUniforms {
  return {
    repeat: createPerBiomeUniformMap(biomes, 'tileRepeat'),
    detailDisp: createPerBiomeUniformMap(biomes, 'detailDisplacement'),
    normal: createPerBiomeUniformMap(biomes, 'normalStrength'),
    roughness: createPerBiomeUniformMap(biomes, 'roughness'),
  };
}

export function createBiomeSplatUniforms(
  sun: DirectionalLight,
  biomeMap: Texture,
  pathMap: Texture,
  meadowMap: Texture,
  heightMap: Texture,
  meshSegments: number = VISUAL.terrain.meshSegments,
): BiomeSplatUniformBundle {
  const thresholds = biomeSplatThresholds();
  const biomeParams = createBiomeParamUniforms(VISUAL.terrain.biomes);
  const heightNormalStep = WORLD.SIZE / Math.max(1, meshSegments);

  const uniforms: TerrainSplatUniforms = {
    ...biomeParams,
    uWaterMax: uniform(thresholds.waterMax),
    uShoreMax: uniform(thresholds.shoreMax),
    uForestMax: uniform(thresholds.forestMax),
    uHillsMax: uniform(thresholds.hillsMax),
    uBlendWidth: uniform(thresholds.blendWidth),
    uPathTint: uniform(new Color(0xffffff)),
    uSunDirection: uniform(new Vector3(0.55, 0.75, 0.45).normalize()),
    uSunColor: uniform(new Color(0xffecd0)),
    uSunIntensity: uniform(0),
    uAmbientColor: uniform(new Color(0xe8dfc8)),
    uAmbientIntensity: uniform(0.04),
    uViewCamPos: uniform(new Vector3()),
    uPlayerPos: uniform(new Vector3()),
    uDetailPatchOrigin: uniform(new Vector2()),
    uLightRadius: uniform(6),
    uLightIntensity: uniform(2.2),
    uPlayerGlowMul: uniform(PHASE0.TERRAIN.PLAYER_GLOW_MUL),
    uDebugShadowView: uniform(0),
    uShadowFloor: uniform(TERRAIN_SHADOW_FLOOR_DEFAULT),
    uSnowHeightStart: uniform(VISUAL.terrain.snow.heightStart),
    uSnowHeightEnd: uniform(VISUAL.terrain.snow.heightEnd),
    uSnowMountainWeight: uniform(VISUAL.terrain.snow.mountainWeight),
    uBiomeMap: texture(biomeMap),
    uPathMap: texture(pathMap),
    uMeadowMap: texture(meadowMap),
    uUseBiomeMap: uniform(1),
    uWorldSize: uniform(WORLD.SIZE),
    uHeightTex: texture(heightMap),
    uHeightScale: uniform(WORLD.HEIGHT_SCALE),
    uHeightNormalStep: uniform(heightNormalStep),
    uDetailRadiusM: uniform(VISUAL.terrain.lod.detailRadiusM),
    uDetailDispFadeStartM: uniform(VISUAL.terrain.lod.detailDispFadeStartM),
    uLayerFadeBandM: uniform(VISUAL.terrain.lod.layerFadeBandM),
  };

  return {
    uniforms,
    sunShadow: createSunShadowNode(sun),
    thresholds,
  };
}

/** Compile-time slope-rock threshold (not dev-tunable). */
export const TERRAIN_SHADER_SLOPE_ROCK_START = TERRAIN_SLOPE_ROCK_START;
/** Compile-time plateau flatness thresholds (from VISUAL.terrain). */
export const TERRAIN_SHADER_PLATEAU_FLATNESS_START = TERRAIN_PLATEAU_FLATNESS_START;
export const TERRAIN_SHADER_PLATEAU_FLATNESS_END = TERRAIN_PLATEAU_FLATNESS_END;
