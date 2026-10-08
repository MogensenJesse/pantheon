// src/world/terrain/material/biomeSplatUniforms.ts — uniform creation + dev wiring for biome splat material

import { Color, type DirectionalLight, type Texture, Vector3 } from 'three';
import { texture, uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import type { MapTerrainAuxMeta } from '../../../map/MapTypes';
import { guideGlowLiveUniforms } from '../../../rendering/guideGlowUniforms';
import {
  createReceiverSunShadowNode,
  type ReceiverSunShadowNode,
  TERRAIN_SHADOW_FLOOR_DEFAULT,
} from '../../../rendering/sunShadow';
import { currentSunElevationDeg, sunDirectionFromSpherical } from '../../../rendering/sunSpherical';
import { type TodWeights, todWeights } from '../../../rendering/tod/todBlend';
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

export type PerBiomeUniformMap = Record<TerrainAtlasBiomeKey, ReturnType<typeof uniform>>;

export interface TerrainBiomeParamUniforms {
  repeat: PerBiomeUniformMap;
}

export interface TerrainSplatUniforms extends TerrainBiomeParamUniforms {
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
  /** Fraction of direct sun kept in full umbra (1 = hue-only shade). */
  uShadeSunKeep: ReturnType<typeof uniform>;
  uSnowHeightStart: ReturnType<typeof uniform>;
  uSnowHeightEnd: ReturnType<typeof uniform>;
  uSnowMountainWeight: ReturnType<typeof uniform>;
  uSnowNoiseAmplitude: ReturnType<typeof uniform>;
  uSnowNoiseScale: ReturnType<typeof uniform>;
  uSnowAspectStrength: ReturnType<typeof uniform>;
  uSnowAspectShadeBoost: ReturnType<typeof uniform>;
  uSnowReferenceSunDir: ReturnType<typeof uniform>;
  uBiomeMap: ReturnType<typeof texture>;
  /** RGBA8 on the height grid: R path, G meadow, B water, A convex (`map/overlayChannels.ts`). */
  uOverlayMap: ReturnType<typeof texture>;
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
  /** 1 when the map carries a valid authored convex ridge in the overlay map's A channel. */
  uUseConvexMap: ReturnType<typeof uniform>;
  uConvexRidgeLight: ReturnType<typeof uniform>;
}

export interface BiomeSplatUniformBundle {
  uniforms: TerrainSplatUniforms;
  sunShadow: ReceiverSunShadowNode | null;
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

const _paletteNight = new Color();
const _paletteGold = new Color();
const _paletteNoon = new Color();
const _globalSun = new Color();
const _globalGround = new Color();
const _globalShadow = new Color();
const _paletteBlend = new Color();

function blendTodPaletteStop(
  nightHex: string,
  goldenHex: string,
  noonHex: string,
  w: TodWeights,
  out: Color,
): Color {
  _paletteNight.set(nightHex);
  _paletteGold.set(goldenHex);
  _paletteNoon.set(noonHex);
  out.r = _paletteNight.r * w.night + _paletteGold.r * w.goldenHour + _paletteNoon.r * w.noon;
  out.g = _paletteNight.g * w.night + _paletteGold.g * w.goldenHour + _paletteNoon.g * w.noon;
  out.b = _paletteNight.b * w.night + _paletteGold.b * w.goldenHour + _paletteNoon.b * w.noon;
  return out;
}

/** Blend night / golden / noon palette hexes via todWeights, then mix toward the global trio. */
export function applyStylizePaletteLerp(
  uniforms: TerrainSplatUniforms,
  elevationDeg: number,
  stylize: TerrainStylizeTune,
): void {
  const w = todWeights(elevationDeg);
  const gMix = Math.min(1, Math.max(0, stylize.globalPaletteMix));
  const g = stylize.global;
  blendTodPaletteStop(g.night.sun, g.goldenHour.sun, g.noon.sun, w, _globalSun);
  blendTodPaletteStop(g.night.ground, g.goldenHour.ground, g.noon.ground, w, _globalGround);
  blendTodPaletteStop(g.night.shadow, g.goldenHour.shadow, g.noon.shadow, w, _globalShadow);
  const palettes = stylize.biomes;
  for (const key of TERRAIN_ATLAS_BIOME_KEYS) {
    const biome = palettes[key];
    blendTodPaletteStop(biome.night.sun, biome.goldenHour.sun, biome.noon.sun, w, _paletteBlend);
    (uniforms.paletteSun[key].value as Color).copy(_paletteBlend).lerp(_globalSun, gMix);
    blendTodPaletteStop(
      biome.night.ground,
      biome.goldenHour.ground,
      biome.noon.ground,
      w,
      _paletteBlend,
    );
    (uniforms.paletteGround[key].value as Color).copy(_paletteBlend).lerp(_globalGround, gMix);
    blendTodPaletteStop(
      biome.night.shadow,
      biome.goldenHour.shadow,
      biome.noon.shadow,
      w,
      _paletteBlend,
    );
    (uniforms.paletteShadow[key].value as Color).copy(_paletteBlend).lerp(_globalShadow, gMix);
  }
}

export function applyStylizeTuneUniforms(
  uniforms: TerrainSplatUniforms,
  stylize: TerrainStylizeTune,
): void {
  uniforms.uStylizePaletteMix.value = stylize.albedoPaletteMix;
  applyStylizePaletteLerp(uniforms, currentSunElevationDeg(), stylize);
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
  (uniforms.uSnowReferenceSunDir.value as Vector3).copy(snowReferenceSunDir(snow));
}

export function applyChiselTuneUniforms(
  uniforms: TerrainSplatUniforms,
  chisel: TerrainChiselTune,
): void {
  uniforms.uChiselEdgeSoft.value = Math.min(1, Math.max(0, chisel.edgeSoft));
}

function applyPackMapTuneUniforms(uniforms: TerrainSplatUniforms): void {
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

function createBiomeParamUniforms(biomes: TerrainBiomeTuneMap): TerrainBiomeParamUniforms {
  return {
    repeat: createPerBiomeUniformMap(biomes, 'tileRepeat'),
  };
}

/** Data maps the splat material samples, all required at material creation. */
export interface BiomeSplatTextures {
  biomeMap: Texture;
  /** RGBA8 overlay masks (path, meadow, water, convex), see `map/overlayChannels.ts`. */
  overlayMap: Texture;
  heightMap: Texture;
  /** Painted biome ids (DEV overlay); a 1×1 stub in production play. */
  biomeIdMap: Texture;
  /** R8 prop base contact AO — 1 = open, 0 = under prop. */
  propAoMap: Texture;
}

export function createBiomeSplatUniforms(
  sun: DirectionalLight,
  textures: BiomeSplatTextures,
  opts?: { receiveSunShadow?: boolean },
): BiomeSplatUniformBundle {
  const { biomeMap, overlayMap, heightMap, biomeIdMap, propAoMap } = textures;
  const biomeParams = createBiomeParamUniforms(VISUAL.terrain.biomes);
  const heightNormalStep = WORLD.SIZE / Math.max(1, WORLD.SEGMENTS);
  const snow = VISUAL.terrain.snow;

  const uniforms: TerrainSplatUniforms = {
    ...biomeParams,
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
    uShadeSunKeep: uniform(1),
    uSnowHeightStart: uniform(snow.heightStart),
    uSnowHeightEnd: uniform(snow.heightEnd),
    uSnowMountainWeight: uniform(snow.mountainWeight),
    uSnowNoiseAmplitude: uniform(snow.noise.amplitude),
    uSnowNoiseScale: uniform(snow.noise.scale),
    uSnowAspectStrength: uniform(snow.aspect.strength),
    uSnowAspectShadeBoost: uniform(snow.aspect.shadeBoost),
    uSnowReferenceSunDir: uniform(snowReferenceSunDir(snow)),
    uBiomeMap: texture(biomeMap),
    uOverlayMap: texture(overlayMap),
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
    uUseConvexMap: uniform(0),
    uConvexRidgeLight: uniform(VISUAL.terrain.packMaps.convex.ridgeLight),
  };

  applyStylizePaletteLerp(uniforms, currentSunElevationDeg(), VISUAL.terrain.stylize);

  const receiveSunShadow = opts?.receiveSunShadow !== false;
  return {
    uniforms,
    // Terrain splat is at the 16 fragment-texture default; world cascade only if granted more.
    sunShadow: receiveSunShadow ? createReceiverSunShadowNode(sun, { textureHeavy: true }) : null,
  };
}
