// src/world/water/material/waterShoreUniforms.ts — GPU uniforms for terrain-height shore depth
import { Color, type DataTexture } from 'three';
import { texture, uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import { terrainFacetStepM } from '../../terrain/cpu/terrainChiselCpu';
import { WORLD } from '../../WorldConfig';

type WaterUniform = any;

export interface WaterShoreUniforms {
  uHeightTex: WaterUniform;
  uWorldSize: WaterUniform;
  uHeightScale: WaterUniform;
  uWaterY: WaterUniform;
  uEnabled: WaterUniform;
  uAbsorption: WaterUniform;
  uCoastFadeM: WaterUniform;
  uShallowDepthM: WaterUniform;
  uRefractionDepthM: WaterUniform;
  uShallowColor: WaterUniform;
  uShadowOpacityBoost: WaterUniform;
  uRefractionStrength: WaterUniform;
  uRefractionOffset: WaterUniform;
  uRefractionOpacity: WaterUniform;
  uMapBoundsFadeM: WaterUniform;
  uOpenOceanDepthM: WaterUniform;
  /** World metres between chisel facets — same as the visible terrain mesh. */
  uFacetStepM: WaterUniform;
  uHeightNormalStep: WaterUniform;
  uChiselEdgeSoft: WaterUniform;
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
    uShallowColor: uniform(new Color(VISUAL.water.stops.noon.shallowColor)),
    uShadowOpacityBoost: uniform(sd.shadowOpacityBoost),
    uRefractionStrength: uniform(sd.refractionStrength),
    uRefractionOffset: uniform(sd.refractionOffset),
    uRefractionOpacity: uniform(sd.refractionOpacity),
    uMapBoundsFadeM: uniform(sd.mapBoundsFadeM),
    uOpenOceanDepthM: uniform(sd.openOceanDepthM),
    uFacetStepM: uniform(terrainFacetStepM()),
    uHeightNormalStep: uniform(WORLD.SIZE / Math.max(1, WORLD.SEGMENTS)),
    uChiselEdgeSoft: uniform(0),
  };
}
