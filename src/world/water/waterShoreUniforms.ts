// src/world/water/waterShoreUniforms.ts — GPU uniforms for terrain-height shore depth
import { Color, type DataTexture } from 'three';
import { texture, uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

export interface WaterShoreUniforms {
  uHeightTex: ReturnType<typeof texture>;
  uWorldSize: ReturnType<typeof uniform>;
  uHeightScale: ReturnType<typeof uniform>;
  uWaterY: ReturnType<typeof uniform>;
  uEnabled: ReturnType<typeof uniform>;
  uAbsorption: ReturnType<typeof uniform>;
  uCoastFadeM: ReturnType<typeof uniform>;
  uShallowDepthM: ReturnType<typeof uniform>;
  uRefractionDepthM: ReturnType<typeof uniform>;
  uShallowColor: ReturnType<typeof uniform>;
  uShadowOpacityBoost: ReturnType<typeof uniform>;
  uRefractionStrength: ReturnType<typeof uniform>;
  uRefractionOffset: ReturnType<typeof uniform>;
  uRefractionOpacity: ReturnType<typeof uniform>;
  uFogBypassStrength: ReturnType<typeof uniform>;
  uMapBoundsFadeM: ReturnType<typeof uniform>;
  uOpenOceanDepthM: ReturnType<typeof uniform>;
}

export interface WaterShoreDepthInputs {
  heightMap: DataTexture;
  worldSize: number;
  heightScale: number;
  waterY: number;
}

/** Macro sculpt height map + shore-depth tunables for waterDepthTsl. */
export function createWaterShoreUniforms({
  heightMap,
  worldSize,
  heightScale,
  waterY,
}: WaterShoreDepthInputs): WaterShoreUniforms {
  const sd = VISUAL.water.shoreDepth;
  return {
    uHeightTex: texture(heightMap),
    uWorldSize: uniform(worldSize),
    uHeightScale: uniform(heightScale),
    uWaterY: uniform(waterY),
    uEnabled: uniform(sd.enabled ? 1 : 0),
    uAbsorption: uniform(sd.absorption),
    uCoastFadeM: uniform(sd.coastFadeM),
    uShallowDepthM: uniform(sd.shallowDepthM),
    uRefractionDepthM: uniform(sd.refractionDepthM),
    uShallowColor: uniform(new Color(sd.shallowColor)),
    uShadowOpacityBoost: uniform(sd.shadowOpacityBoost),
    uRefractionStrength: uniform(sd.refractionStrength),
    uRefractionOffset: uniform(sd.refractionOffset),
    uRefractionOpacity: uniform(sd.refractionOpacity),
    uFogBypassStrength: uniform(sd.fogBypassStrength),
    uMapBoundsFadeM: uniform(sd.mapBoundsFadeM),
    uOpenOceanDepthM: uniform(sd.openOceanDepthM),
  };
}
