// src/world/terrain/biomeSplatUniforms.ts — uniform creation + dev wiring for biome splat material

import { Color, DataTexture, type DirectionalLight, type Texture, Vector3 } from 'three';
import { shadow, texture, uniform } from 'three/tsl';
import { PHASE0 } from '../../config/phase0';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../WorldConfig';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_SLOPE_ROCK_START,
  type TerrainAtlasBiomeKey,
  type TerrainBiomeTuneMap,
} from './terrainBiomeTuning';

/** Minimum sun visibility in shadowed splat (0 = black shadows, 1 = no darkening). */
export const TERRAIN_SHADOW_FLOOR_DEFAULT = VISUAL.terrain.shadowFloor;

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
  uPathRoughness: ReturnType<typeof uniform>;
  uPathAo: ReturnType<typeof uniform>;
  uPathTint: ReturnType<typeof uniform>;
  uSunDirection: ReturnType<typeof uniform>;
  uSunColor: ReturnType<typeof uniform>;
  uSunIntensity: ReturnType<typeof uniform>;
  uAmbientColor: ReturnType<typeof uniform>;
  uAmbientIntensity: ReturnType<typeof uniform>;
  uViewCamPos: ReturnType<typeof uniform>;
  uPlayerPos: ReturnType<typeof uniform>;
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
}

export interface BiomeSplatUniformBundle {
  uniforms: TerrainSplatUniforms;
  sunShadow: ReturnType<typeof shadow>;
  thresholds: BiomeSplatThresholds;
}

function placeholderMapTexture(channels: 1 | 4): DataTexture {
  const data = channels === 1 ? new Uint8Array([0]) : new Uint8Array([0, 255, 0, 0]);
  const tex = new DataTexture(data, 1, 1);
  tex.needsUpdate = true;
  return tex;
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
  biomeMap?: Texture,
  pathMap?: Texture,
  meadowMap?: Texture,
): BiomeSplatUniformBundle {
  const thresholds = biomeSplatThresholds();
  const useMap = Boolean(biomeMap && pathMap && meadowMap);
  const biomeParams = createBiomeParamUniforms(VISUAL.terrain.biomes);

  const uniforms: TerrainSplatUniforms = {
    ...biomeParams,
    uWaterMax: uniform(thresholds.waterMax),
    uShoreMax: uniform(thresholds.shoreMax),
    uForestMax: uniform(thresholds.forestMax),
    uHillsMax: uniform(thresholds.hillsMax),
    uBlendWidth: uniform(thresholds.blendWidth),
    uPathRoughness: uniform(WORLD.JOURNEY.PATH_SURFACE.ROUGHNESS),
    uPathAo: uniform(WORLD.JOURNEY.PATH_SURFACE.AO),
    uPathTint: uniform(new Color(0xffffff)),
    uSunDirection: uniform(new Vector3(0.55, 0.75, 0.45).normalize()),
    uSunColor: uniform(new Color(0xffecd0)),
    uSunIntensity: uniform(0),
    uAmbientColor: uniform(new Color(0xe8dfc8)),
    uAmbientIntensity: uniform(0.04),
    uViewCamPos: uniform(new Vector3()),
    uPlayerPos: uniform(new Vector3()),
    uLightRadius: uniform(6),
    uLightIntensity: uniform(2.2),
    uPlayerGlowMul: uniform(PHASE0.TERRAIN.PLAYER_GLOW_MUL),
    uDebugShadowView: uniform(0),
    uShadowFloor: uniform(TERRAIN_SHADOW_FLOOR_DEFAULT),
    uSnowHeightStart: uniform(VISUAL.terrain.snow.heightStart),
    uSnowHeightEnd: uniform(VISUAL.terrain.snow.heightEnd),
    uSnowMountainWeight: uniform(VISUAL.terrain.snow.mountainWeight),
    uBiomeMap: texture(biomeMap ?? placeholderMapTexture(4)),
    uPathMap: texture(pathMap ?? placeholderMapTexture(1)),
    uMeadowMap: texture(meadowMap ?? placeholderMapTexture(1)),
    uUseBiomeMap: uniform(useMap ? 1 : 0),
    uWorldSize: uniform(WORLD.SIZE),
  };

  return {
    uniforms,
    sunShadow: shadow(sun),
    thresholds,
  };
}

/** Compile-time slope-rock threshold (not dev-tunable). */
export const TERRAIN_SHADER_SLOPE_ROCK_START = TERRAIN_SLOPE_ROCK_START;
