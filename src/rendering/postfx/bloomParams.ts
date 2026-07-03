// src/rendering/postfx/bloomParams.ts — bloom tunables for PostFX pipeline
import { VISUAL } from '../../config/visualTuning';
import { setHdrBloomScale } from '../glowMaterial';
import type { BloomSkyMaskUniforms } from './bloomSkyMask';

export interface BloomSceneTunables {
  strength: { value: number };
  radius: { value: number };
  threshold: { value: number };
  smoothWidth: { value: number };
}

const { bloom: BLOOM } = VISUAL;

/** Dev-tunable bloom (defaults in visualTuning.ts). AgX exposure is separate — see PostFX.setAgxExposure. */
export interface BloomParams {
  emissiveStrength: number;
  radius: number;
  sceneStrengthMul: number;
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
    sceneThreshold: BLOOM.SCENE_THRESHOLD,
    smoothWidth: BLOOM.SMOOTH_WIDTH,
    skyDepthStart: BLOOM.SKY_DEPTH_START,
    skyDepthEnd: BLOOM.SKY_DEPTH_END,
    skySunLumaStart: BLOOM.SKY_SUN_LUMA_START,
    skySunLumaEnd: BLOOM.SKY_SUN_LUMA_END,
    skyReduce: BLOOM.SKY_REDUCE_LOW,
    hdrScale: BLOOM.HDR_SCALE,
  };
}

export interface BloomTunableTargets {
  bloomScene: BloomSceneTunables;
  bloomSkyMaskUniforms: BloomSkyMaskUniforms;
}

export function applyBloomTunables(params: BloomParams, targets: BloomTunableTargets): void {
  targets.bloomScene.strength.value = params.emissiveStrength * params.sceneStrengthMul;
  targets.bloomScene.radius.value = params.radius;
  targets.bloomScene.threshold.value = params.sceneThreshold;
  targets.bloomScene.smoothWidth.value = params.smoothWidth;
  targets.bloomSkyMaskUniforms.skyDepthStart.value = params.skyDepthStart;
  targets.bloomSkyMaskUniforms.skyDepthEnd.value = params.skyDepthEnd;
  targets.bloomSkyMaskUniforms.skySunLumaStart.value = params.skySunLumaStart;
  targets.bloomSkyMaskUniforms.skySunLumaEnd.value = params.skySunLumaEnd;
  targets.bloomSkyMaskUniforms.skyReduce.value = params.skyReduce;
  setHdrBloomScale(params.hdrScale);
}
