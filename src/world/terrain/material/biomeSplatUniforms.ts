// src/world/terrain/material/biomeSplatUniforms.ts — uniform creation + dev wiring for biome splat material

import {
  ClampToEdgeWrapping,
  Color,
  DataTexture,
  type DirectionalLight,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  type Texture,
  UnsignedByteType,
  Vector2,
  Vector3,
} from 'three';
import { texture, uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import { guideGlowLiveUniforms } from '../../../rendering/guideGlowUniforms';
import {
  createReceiverSunShadowNode,
  type ReceiverSunShadowNode,
  TERRAIN_SHADOW_FLOOR_DEFAULT,
} from '../../../rendering/sunShadow';
import { sunDirectionFromSpherical } from '../../../rendering/sunSpherical';
import { WORLD } from '../../WorldConfig';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  TERRAIN_PLATEAU_FLATNESS_END,
  TERRAIN_PLATEAU_FLATNESS_START,
  TERRAIN_SLOPE_ROCK_BLEND,
  TERRAIN_SLOPE_ROCK_SOFTNESS,
  TERRAIN_SLOPE_ROCK_START,
  type TerrainAtlasBiomeKey,
  type TerrainBiomeTuneMap,
  type TerrainSnowTune,
} from '../config/terrainBiomeTuning';
import { terrainPlayLodConfigFromVisual } from '../lod/terrainLodRings';

function createPlaceholderPropAoTexture(): DataTexture {
  const tex = new DataTexture(new Uint8Array([255]), 1, 1, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const _placeholderPropAo = createPlaceholderPropAoTexture();

const aoCfg = VISUAL.props.groundContact.terrainAo;

/**
 * Live-tunable prop contact AO strengths — shared across detail + macro terrain materials
 * so one DEV slider updates all play layers.
 */
export const terrainPropAoLiveUniforms = {
  uPropAoEnabled: uniform(aoCfg.enabled ? 1 : 0),
  uPropAoStrength: uniform(aoCfg.strength),
  uPropAoSunStrength: uniform(aoCfg.sunStrength),
};

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
  /** World-XZ RG falloff + along atlas for the orb guide ribbon. */
  uGuideGlowMap: ReturnType<typeof texture>;
  uGuideLightIntensity: ReturnType<typeof uniform>;
  uDebugShadowView: ReturnType<typeof uniform>;
  uShadowFloor: ReturnType<typeof uniform>;
  uSnowHeightStart: ReturnType<typeof uniform>;
  uSnowHeightEnd: ReturnType<typeof uniform>;
  uSnowMountainWeight: ReturnType<typeof uniform>;
  uSnowNoiseAmplitude: ReturnType<typeof uniform>;
  uSnowNoiseScale: ReturnType<typeof uniform>;
  uSnowAspectStrength: ReturnType<typeof uniform>;
  uSnowAspectShadeBoost: ReturnType<typeof uniform>;
  uSnowSlopeNormalYStart: ReturnType<typeof uniform>;
  uSnowSlopeNormalYEnd: ReturnType<typeof uniform>;
  uSnowSlopeStrength: ReturnType<typeof uniform>;
  uSnowReferenceSunDir: ReturnType<typeof uniform>;
  uBiomeMap: ReturnType<typeof texture>;
  uPathMap: ReturnType<typeof texture>;
  uMeadowMap: ReturnType<typeof texture>;
  /** R8 prop base footprints — 1 = open ground, 0 = under prop. */
  uPropAoMap: ReturnType<typeof texture>;
  uPropAoEnabled: ReturnType<typeof uniform>;
  uPropAoStrength: ReturnType<typeof uniform>;
  uPropAoSunStrength: ReturnType<typeof uniform>;
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
  /** Mid-ring outer radius (m) — mid layer fades to far backdrop. */
  uMacroRadiusM: ReturnType<typeof uniform>;
  /** Outer layer handoff band (m) at macroRadiusM for mid → far. */
  uMacroFadeBandM: ReturnType<typeof uniform>;
  /** Play mid-ring vertex spacing (m) — geomorph fine verts toward this grid. */
  uLodMidStepM: ReturnType<typeof uniform>;
  /** Play far-ring vertex spacing (m) — geomorph mid verts toward this grid. */
  uLodFarStepM: ReturnType<typeof uniform>;
  /** DEV: 1 = paint clipmap debug stripes on the terrain surface. */
  uLodDebugEnabled: ReturnType<typeof uniform>;
  /** DEV: raw painted biome ids (R8 BiomeId per cell). */
  uBiomeIdMap: ReturnType<typeof texture>;
  /** DEV: 1 = replace terrain with bright biome false-color overlay. */
  uBiomeDebugEnabled: ReturnType<typeof uniform>;
  /** DEV: mid follow-patch origin (snapped XZ). */
  uLodDebugMidOrigin: ReturnType<typeof uniform>;
  /** DEV: fine mesh half-extent (m) for the green debug square. */
  uLodDebugCenterHalf: ReturnType<typeof uniform>;
  /** DEV: mid mesh half-extent (m) for the orange debug square. */
  uLodDebugMidHalf: ReturnType<typeof uniform>;
}

export interface BiomeSplatUniformBundle {
  uniforms: TerrainSplatUniforms;
  sunShadow: ReceiverSunShadowNode;
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

function snowReferenceSunDir(snow: TerrainSnowTune): Vector3 {
  return sunDirectionFromSpherical(
    snow.aspect.referenceElevationDeg,
    snow.aspect.referenceAzimuthDeg,
    new Vector3(),
  );
}

export function applySnowTuneUniforms(uniforms: TerrainSplatUniforms, snow: TerrainSnowTune): void {
  uniforms.uSnowHeightStart.value = snow.heightStart;
  uniforms.uSnowHeightEnd.value = snow.heightEnd;
  uniforms.uSnowMountainWeight.value = snow.mountainWeight;
  uniforms.uSnowNoiseAmplitude.value = snow.noise.amplitude;
  uniforms.uSnowNoiseScale.value = snow.noise.scale;
  uniforms.uSnowAspectStrength.value = snow.aspect.strength;
  uniforms.uSnowAspectShadeBoost.value = snow.aspect.shadeBoost;
  uniforms.uSnowSlopeNormalYStart.value = snow.slope.normalYStart;
  uniforms.uSnowSlopeNormalYEnd.value = snow.slope.normalYEnd;
  uniforms.uSnowSlopeStrength.value = snow.slope.strength;
  (uniforms.uSnowReferenceSunDir.value as Vector3).copy(snowReferenceSunDir(snow));
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
  biomeIdMap: Texture,
  propAoMap: Texture = _placeholderPropAo,
): BiomeSplatUniformBundle {
  const thresholds = biomeSplatThresholds();
  const biomeParams = createBiomeParamUniforms(VISUAL.terrain.biomes);
  const heightNormalStep = WORLD.SIZE / Math.max(1, WORLD.SEGMENTS);
  const snow = VISUAL.terrain.snow;
  const playLod = terrainPlayLodConfigFromVisual(VISUAL.terrain.meshSegments);

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
    uPlayerGlowMul: uniform(VISUAL.terrain.playerGlowMul),
    uGuideGlowMap: guideGlowLiveUniforms.uGuideGlowMap,
    uGuideLightIntensity: guideGlowLiveUniforms.uGuideLightIntensity,
    uDebugShadowView: uniform(0),
    uShadowFloor: uniform(TERRAIN_SHADOW_FLOOR_DEFAULT),
    uSnowHeightStart: uniform(snow.heightStart),
    uSnowHeightEnd: uniform(snow.heightEnd),
    uSnowMountainWeight: uniform(snow.mountainWeight),
    uSnowNoiseAmplitude: uniform(snow.noise.amplitude),
    uSnowNoiseScale: uniform(snow.noise.scale),
    uSnowAspectStrength: uniform(snow.aspect.strength),
    uSnowAspectShadeBoost: uniform(snow.aspect.shadeBoost),
    uSnowSlopeNormalYStart: uniform(snow.slope.normalYStart),
    uSnowSlopeNormalYEnd: uniform(snow.slope.normalYEnd),
    uSnowSlopeStrength: uniform(snow.slope.strength),
    uSnowReferenceSunDir: uniform(snowReferenceSunDir(snow)),
    uBiomeMap: texture(biomeMap),
    uPathMap: texture(pathMap),
    uMeadowMap: texture(meadowMap),
    uPropAoMap: texture(propAoMap),
    uPropAoEnabled: terrainPropAoLiveUniforms.uPropAoEnabled,
    uPropAoStrength: terrainPropAoLiveUniforms.uPropAoStrength,
    uPropAoSunStrength: terrainPropAoLiveUniforms.uPropAoSunStrength,
    uUseBiomeMap: uniform(1),
    uWorldSize: uniform(WORLD.SIZE),
    uHeightTex: texture(heightMap),
    uHeightScale: uniform(WORLD.HEIGHT_SCALE),
    uHeightNormalStep: uniform(heightNormalStep),
    uDetailRadiusM: uniform(VISUAL.terrain.lod.detailRadiusM),
    uDetailDispFadeStartM: uniform(VISUAL.terrain.lod.detailDispFadeStartM),
    uLayerFadeBandM: uniform(VISUAL.terrain.lod.layerFadeBandM),
    uMacroRadiusM: uniform(VISUAL.terrain.lod.macroRadiusM),
    uMacroFadeBandM: uniform(VISUAL.terrain.lod.macroFadeBandM),
    uLodMidStepM: uniform(playLod.midStep),
    uLodFarStepM: uniform(playLod.farStep),
    uLodDebugEnabled: uniform(0),
    uLodDebugMidOrigin: uniform(new Vector2()),
    uLodDebugCenterHalf: uniform(0),
    uLodDebugMidHalf: uniform(0),
    uBiomeIdMap: texture(biomeIdMap),
    uBiomeDebugEnabled: uniform(0),
  };

  return {
    uniforms,
    sunShadow: createReceiverSunShadowNode(sun),
    thresholds,
  };
}

/** Compile-time slope-rock threshold (not dev-tunable). */
export const TERRAIN_SHADER_SLOPE_ROCK_START = TERRAIN_SLOPE_ROCK_START;
export const TERRAIN_SHADER_SLOPE_ROCK_SOFTNESS = TERRAIN_SLOPE_ROCK_SOFTNESS;
export const TERRAIN_SHADER_SLOPE_ROCK_BLEND = TERRAIN_SLOPE_ROCK_BLEND;
/** Compile-time plateau flatness thresholds (from VISUAL.terrain). */
export const TERRAIN_SHADER_PLATEAU_FLATNESS_START = TERRAIN_PLATEAU_FLATNESS_START;
export const TERRAIN_SHADER_PLATEAU_FLATNESS_END = TERRAIN_PLATEAU_FLATNESS_END;
