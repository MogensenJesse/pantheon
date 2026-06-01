// src/rendering/postfx/bloomParams.ts — bloom tunables for PostFX pipeline
import { PHASE0 } from '../../config/phase0';
import { setHdrBloomScale } from '../glowMaterial';
import type { BloomSkyMaskUniforms } from './bloomSkyMask';

export interface BloomSceneTunables {
  strength: { value: number };
  radius: { value: number };
  threshold: { value: number };
  smoothWidth: { value: number };
}

const { BLOOM, RENDER } = PHASE0;

/** Dev-tunable bloom (defaults in visualTuning.ts). */
export interface BloomParams {
  emissiveStrength: number;
  radius: number;
  sceneStrengthMul: number;
  exposure: number;
  sceneThreshold: number;
  smoothWidth: number;
  skyDepthStart: number;
  skyDepthEnd: number;
  skySunLumaStart: number;
  skySunLumaEnd: number;
  skyReduce: number;
  hdrScale: number;
}

export function defaultBloomParams(): BloomParams {
  return {
    emissiveStrength: BLOOM.STRENGTH,
    radius: BLOOM.RADIUS,
    sceneStrengthMul: BLOOM.SCENE_STRENGTH_MUL,
    exposure: RENDER.TONE_MAPPING_EXPOSURE as number,
    sceneThreshold: BLOOM.SCENE_THRESHOLD,
    smoothWidth: BLOOM.SMOOTH_WIDTH,
    skyDepthStart: BLOOM.SKY_DEPTH_START,
    skyDepthEnd: BLOOM.SKY_DEPTH_END,
    skySunLumaStart: BLOOM.SKY_SUN_LUMA_START,
    skySunLumaEnd: BLOOM.SKY_SUN_LUMA_END,
    skyReduce: BLOOM.SKY_REDUCE,
    hdrScale: BLOOM.HDR_SCALE,
  };
}

export interface BloomTunableTargets {
  bloomScene: BloomSceneTunables;
  bloomSkyMaskUniforms: BloomSkyMaskUniforms;
  uExposure: { value: number };
}

export function applyBloomTunables(params: BloomParams, targets: BloomTunableTargets): void {
  targets.bloomScene.strength.value = params.emissiveStrength * params.sceneStrengthMul;
  targets.bloomScene.radius.value = params.radius;
  targets.bloomScene.threshold.value = params.sceneThreshold;
  targets.bloomScene.smoothWidth.value = params.smoothWidth;
  targets.uExposure.value = params.exposure;
  targets.bloomSkyMaskUniforms.skyDepthStart.value = params.skyDepthStart;
  targets.bloomSkyMaskUniforms.skyDepthEnd.value = params.skyDepthEnd;
  targets.bloomSkyMaskUniforms.skySunLumaStart.value = params.skySunLumaStart;
  targets.bloomSkyMaskUniforms.skySunLumaEnd.value = params.skySunLumaEnd;
  targets.bloomSkyMaskUniforms.skyReduce.value = params.skyReduce;
  setHdrBloomScale(params.hdrScale);
}
