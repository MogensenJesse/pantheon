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
  Vector3,
} from 'three';
import { texture, uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import type { MapTerrainAuxMeta } from '../../../map/MapTypes';
import { guideGlowLiveUniforms } from '../../../rendering/guideGlowUniforms';
import { goldenHourT } from '../../../rendering/postfx/postfxCohesion';
import {
  createReceiverSunShadowNode,
  type ReceiverSunShadowNode,
  TERRAIN_SHADOW_FLOOR_DEFAULT,
} from '../../../rendering/sunShadow';
import { currentSunElevationDeg, sunDirectionFromSpherical } from '../../../rendering/sunSpherical';
import { WORLD } from '../../WorldConfig';
import {
  TERRAIN_ATLAS_BIOME_KEYS,
  type TerrainAtlasBiomeKey,
  type TerrainBiomeTuneMap,
  type TerrainChiselTune,
  type TerrainSnowTune,
  type TerrainStylizeTune,
} from '../config/terrainBiomeTuning';
import { terrainFacetStepM } from '../cpu/terrainChiselCpu';

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

function createPlaceholderTerrainAuxTexture(): DataTexture {
  const tex = new DataTexture(new Uint8Array([0]), 1, 1, RedFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const _placeholderTerrainAux = createPlaceholderTerrainAuxTexture();

const aoCfg = VISUAL.props.groundContact.terrainAo;

/**
 * Live-tunable prop contact AO strengths — shared so one DEV slider updates
 * the play terrain material.
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
  uPlayerPos: ReturnType<typeof uniform>;
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
  uWorldSize: ReturnType<typeof uniform>;
  uHeightTex: ReturnType<typeof texture>;
  uHeightScale: ReturnType<typeof uniform>;
  /** World metres between height-grid cells — macro-normal finite-difference step. */
  uHeightNormalStep: ReturnType<typeof uniform>;
  /** World-space chisel slab size (m). */
  uFacetStepM: ReturnType<typeof uniform>;
  /** Crease fillet width as a fraction of `uFacetStepM` (0 = knife lighting N). */
  uChiselEdgeSoft: ReturnType<typeof uniform>;
  /** CPU-lerped noon→golden-hour palette stops (sun / ground / shadow). */
  paletteSun: PerBiomeUniformMap;
  paletteGround: PerBiomeUniformMap;
  paletteShadow: PerBiomeUniformMap;
  uStylizePaletteMix: ReturnType<typeof uniform>;
  /** DEV: raw painted biome ids (R8 BiomeId per cell). */
  uBiomeIdMap: ReturnType<typeof texture>;
  /** DEV: 1 = replace terrain with bright biome false-color overlay. */
  uBiomeDebugEnabled: ReturnType<typeof uniform>;
  /** Packed R8 convex (sidecar on disk is still RGBA8, A→R on upload). */
  uTerrainAux: ReturnType<typeof texture>;
  uUseConvexMap: ReturnType<typeof uniform>;
  uConvexRidgeLight: ReturnType<typeof uniform>;
}

export interface BiomeSplatUniformBundle {
  uniforms: TerrainSplatUniforms;
  sunShadow: ReceiverSunShadowNode | null;
  thresholds: BiomeSplatThresholds;
}

function createPerBiomeColorUniformMap(
  palettes: typeof VISUAL.terrain.stylize.biomes,
  stop: 'sun' | 'ground' | 'shadow',
): PerBiomeUniformMap {
  const map = {} as PerBiomeUniformMap;
  for (const key of TERRAIN_ATLAS_BIOME_KEYS) {
    map[key] = uniform(new Color(palettes[key].noon[stop]));
  }
  return map;
}

const _paletteNoon = new Color();
const _paletteGold = new Color();
const _globalSun = new Color();
const _globalGround = new Color();
const _globalShadow = new Color();

/** Lerp noon → golden-hour palette hexes, then mix toward the global trio. */
export function applyStylizePaletteLerp(
  uniforms: TerrainSplatUniforms,
  goldenHourAmt: number,
  stylize: TerrainStylizeTune,
): void {
  const t = Math.min(1, Math.max(0, goldenHourAmt));
  const gMix = Math.min(1, Math.max(0, stylize.globalPaletteMix));
  _globalSun.set(stylize.global.sun);
  _globalGround.set(stylize.global.ground);
  _globalShadow.set(stylize.global.shadow);
  const palettes = stylize.biomes;
  for (const key of TERRAIN_ATLAS_BIOME_KEYS) {
    const biome = palettes[key];
    _paletteNoon.set(biome.noon.sun);
    _paletteGold.set(biome.goldenHour.sun);
    (uniforms.paletteSun[key].value as Color)
      .copy(_paletteNoon)
      .lerp(_paletteGold, t)
      .lerp(_globalSun, gMix);
    _paletteNoon.set(biome.noon.ground);
    _paletteGold.set(biome.goldenHour.ground);
    (uniforms.paletteGround[key].value as Color)
      .copy(_paletteNoon)
      .lerp(_paletteGold, t)
      .lerp(_globalGround, gMix);
    _paletteNoon.set(biome.noon.shadow);
    _paletteGold.set(biome.goldenHour.shadow);
    (uniforms.paletteShadow[key].value as Color)
      .copy(_paletteNoon)
      .lerp(_paletteGold, t)
      .lerp(_globalShadow, gMix);
  }
}

export function applyStylizeTuneUniforms(
  uniforms: TerrainSplatUniforms,
  stylize: TerrainStylizeTune,
): void {
  uniforms.uStylizePaletteMix.value = stylize.albedoPaletteMix;
  applyStylizePaletteLerp(uniforms, goldenHourT(currentSunElevationDeg()), stylize);
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

export function applyChiselTuneUniforms(
  uniforms: TerrainSplatUniforms,
  chisel: TerrainChiselTune,
): void {
  uniforms.uChiselEdgeSoft.value = Math.min(1, Math.max(0, chisel.edgeSoft));
}

export function applyPackMapTuneUniforms(uniforms: TerrainSplatUniforms): void {
  uniforms.uConvexRidgeLight.value = VISUAL.terrain.packMaps.convex.ridgeLight;
}

/** Convex only. Slope-rock always uses height-derived N. */
export function applyTerrainAuxUniforms(
  uniforms: TerrainSplatUniforms,
  meta: MapTerrainAuxMeta | undefined,
): void {
  const live = Boolean(meta) && meta?.stale !== true;
  uniforms.uUseConvexMap.value = live && meta?.hasConvex ? 1 : 0;
  applyPackMapTuneUniforms(uniforms);
}

export function createBiomeParamUniforms(biomes: TerrainBiomeTuneMap): TerrainBiomeParamUniforms {
  return {
    repeat: createPerBiomeUniformMap(biomes, 'tileRepeat'),
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
  terrainAuxMap: Texture = _placeholderTerrainAux,
  opts?: { receiveSunShadow?: boolean },
): BiomeSplatUniformBundle {
  const thresholds = biomeSplatThresholds();
  const biomeParams = createBiomeParamUniforms(VISUAL.terrain.biomes);
  const heightNormalStep = WORLD.SIZE / Math.max(1, WORLD.SEGMENTS);
  const snow = VISUAL.terrain.snow;

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
    uPlayerPos: uniform(new Vector3()),
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
    uWorldSize: uniform(WORLD.SIZE),
    uHeightTex: texture(heightMap),
    uHeightScale: uniform(WORLD.HEIGHT_SCALE),
    uHeightNormalStep: uniform(heightNormalStep),
    uFacetStepM: uniform(terrainFacetStepM()),
    uChiselEdgeSoft: uniform(VISUAL.terrain.chisel.edgeSoft),
    paletteSun: createPerBiomeColorUniformMap(VISUAL.terrain.stylize.biomes, 'sun'),
    paletteGround: createPerBiomeColorUniformMap(VISUAL.terrain.stylize.biomes, 'ground'),
    paletteShadow: createPerBiomeColorUniformMap(VISUAL.terrain.stylize.biomes, 'shadow'),
    uStylizePaletteMix: uniform(VISUAL.terrain.stylize.albedoPaletteMix),
    uBiomeIdMap: texture(biomeIdMap),
    uBiomeDebugEnabled: uniform(0),
    uTerrainAux: texture(terrainAuxMap),
    uUseConvexMap: uniform(0),
    uConvexRidgeLight: uniform(VISUAL.terrain.packMaps.convex.ridgeLight),
  };

  applyStylizePaletteLerp(uniforms, goldenHourT(currentSunElevationDeg()), VISUAL.terrain.stylize);

  const receiveSunShadow = opts?.receiveSunShadow !== false;
  return {
    uniforms,
    sunShadow: receiveSunShadow ? createReceiverSunShadowNode(sun) : null,
    thresholds,
  };
}
