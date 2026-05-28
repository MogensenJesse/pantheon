// src/world/terrain/biomeSplatUniforms.ts — uniform creation + dev wiring for biome splat material
import { texture, uniform, uniformArray, shadow } from 'three/tsl';
import { Color, DataTexture, Vector3, type DirectionalLight, type Texture } from 'three';
import { WORLD } from '../WorldConfig';
import { getJourneyPathShaderSegments } from '../JourneyPath';
import { PHASE0 } from '../../config/phase0';

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

export interface TerrainSplatUniforms {
  uRepeat: ReturnType<typeof uniform>;
  uDispScale: ReturnType<typeof uniform>;
  uWaterMax: ReturnType<typeof uniform>;
  uShoreMax: ReturnType<typeof uniform>;
  uForestMax: ReturnType<typeof uniform>;
  uHillsMax: ReturnType<typeof uniform>;
  uBlendWidth: ReturnType<typeof uniform>;
  uSlopeRockStart: ReturnType<typeof uniform>;
  uNormalStrength: ReturnType<typeof uniform>;
  uAoStrength: ReturnType<typeof uniform>;
  uSpecularStrength: ReturnType<typeof uniform>;
  uPathRoughness: ReturnType<typeof uniform>;
  uPathAo: ReturnType<typeof uniform>;
  uPathTint: ReturnType<typeof uniform>;
  uPathBlendInner: ReturnType<typeof uniform>;
  uPathBlendOuter: ReturnType<typeof uniform>;
  uPathSegCount: ReturnType<typeof uniform>;
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
  uBiomeMap: ReturnType<typeof texture>;
  uUseBiomeMap: ReturnType<typeof uniform>;
  uWorldSize: ReturnType<typeof uniform>;
}

export interface BiomeSplatUniformBundle {
  uniforms: TerrainSplatUniforms;
  uPathSegA: ReturnType<typeof uniformArray>;
  uPathSegB: ReturnType<typeof uniformArray>;
  sunShadow: ReturnType<typeof shadow>;
  thresholds: BiomeSplatThresholds;
}

/**
 * Build the TSL uniform set + journey path segment arrays + sun shadow node for
 * the biome splat material. Pure factory — no scene/material side effects.
 */
function placeholderBiomeTexture(): DataTexture {
  const data = new Uint8Array([0, 255, 0, 0]);
  const tex = new DataTexture(data, 1, 1);
  tex.needsUpdate = true;
  return tex;
}

export function createBiomeSplatUniforms(
  sun: DirectionalLight,
  biomeMap?: Texture,
): BiomeSplatUniformBundle {
  const thresholds = biomeSplatThresholds();
  const pathSegs = getJourneyPathShaderSegments();
  const pathInner = WORLD.JOURNEY.PATH_SURFACE.WIDTH * 0.5;
  const pathOuter = pathInner + WORLD.JOURNEY.PATH_SURFACE.BLEND_SOFT;

  const uniforms: TerrainSplatUniforms = {
    uRepeat: uniform(PHASE0.TERRAIN_TEXTURE_REPEAT),
    uDispScale: uniform(PHASE0.TERRAIN_DISPLACEMENT_SCALE),
    uWaterMax: uniform(thresholds.waterMax),
    uShoreMax: uniform(thresholds.shoreMax),
    uForestMax: uniform(thresholds.forestMax),
    uHillsMax: uniform(thresholds.hillsMax),
    uBlendWidth: uniform(thresholds.blendWidth),
    uSlopeRockStart: uniform(PHASE0.TERRAIN_SLOPE_ROCK_START),
    uNormalStrength: uniform(PHASE0.TERRAIN_NORMAL_STRENGTH),
    uAoStrength: uniform(PHASE0.TERRAIN_AO_STRENGTH),
    uSpecularStrength: uniform(PHASE0.TERRAIN_SPECULAR_STRENGTH),
    uPathRoughness: uniform(WORLD.JOURNEY.PATH_SURFACE.ROUGHNESS),
    uPathAo: uniform(WORLD.JOURNEY.PATH_SURFACE.AO),
    uPathTint: uniform(new Color(WORLD.JOURNEY.PATH_SURFACE.COLOR)),
    uPathBlendInner: uniform(pathInner),
    uPathBlendOuter: uniform(pathOuter),
    uPathSegCount: uniform(pathSegs.count),
    uSunDirection: uniform(new Vector3(0.55, 0.75, 0.45).normalize()),
    uSunColor: uniform(new Color(0xffecd0)),
    uSunIntensity: uniform(0),
    uAmbientColor: uniform(new Color(0xe8dfc8)),
    uAmbientIntensity: uniform(0.04),
    uViewCamPos: uniform(new Vector3()),
    uPlayerPos: uniform(new Vector3()),
    uLightRadius: uniform(6),
    uLightIntensity: uniform(2.2),
    uPlayerGlowMul: uniform(PHASE0.GRASS.PLAYER_GLOW_MUL),
    uDebugShadowView: uniform(0),
    uShadowFloor: uniform(0.06),
    uBiomeMap: texture(biomeMap ?? placeholderBiomeTexture()),
    uUseBiomeMap: uniform(biomeMap ? 1 : 0),
    uWorldSize: uniform(WORLD.SIZE),
  };

  return {
    uniforms,
    uPathSegA: uniformArray(pathSegs.segA, 'vec2'),
    uPathSegB: uniformArray(pathSegs.segB, 'vec2'),
    sunShadow: shadow(sun),
    thresholds,
  };
}
