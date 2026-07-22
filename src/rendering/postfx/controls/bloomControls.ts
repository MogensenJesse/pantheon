// src/rendering/postfx/controls/bloomControls.ts — scene bloom node graph + sky attenuation mask
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { uniform } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import { devSettings } from '../../../core/GameState';
import { skyReduceForElevation } from '../../sky/lightingCurves';
import { applyBloomTunables, type BloomParams, defaultBloomParams } from '../bloomParams';
import { createBloomSkyMaskUniforms } from '../bloomSkyMask';

const { bloom: BLOOM } = VISUAL;

/** Scene bloom node graph + tunables, including the open-sky attenuation mask. */
export function createBloomControls(sceneColor: any) {
  const bloomScene = bloom(
    sceneColor,
    BLOOM.STRENGTH * BLOOM.SCENE_STRENGTH_MUL,
    BLOOM.RADIUS,
    BLOOM.SCENE_THRESHOLD,
  );
  const bloomSkyMaskUniforms = createBloomSkyMaskUniforms({
    skyDepthStart: BLOOM.SKY_DEPTH_START,
    skyDepthEnd: BLOOM.SKY_DEPTH_END,
    skySunLumaStart: BLOOM.SKY_SUN_LUMA_START,
    skySunLumaEnd: BLOOM.SKY_SUN_LUMA_END,
    skyReduce: BLOOM.SKY_REDUCE_LOW,
  });
  const bloomTargets = { bloomScene, bloomSkyMaskUniforms };

  const uSceneBloomWeight = uniform(1);
  let bloomParams = defaultBloomParams();
  let cohesionWeightMul = 1;

  const applyTunablesLocal = () => {
    applyBloomTunables(bloomParams, bloomTargets);
  };

  /** Applies the current cohesion weight, honoring the DEV "disable bloom" render-debug override. */
  const applyDebugWeight = () => {
    if (import.meta.env.DEV && devSettings.renderDebug.disableBloom) {
      uSceneBloomWeight.value = 0;
      return;
    }
    uSceneBloomWeight.value = cohesionWeightMul;
  };

  /** Effective mix weight for graph bypass (0 when DEV-disabled or strength ~0). */
  const getEffectiveWeight = (): number => {
    if (import.meta.env.DEV && devSettings.renderDebug.disableBloom) return 0;
    const strength = bloomParams.emissiveStrength * bloomParams.sceneStrengthMul;
    if (strength < 1e-5) return 0;
    return cohesionWeightMul;
  };

  applyTunablesLocal();
  applyDebugWeight();

  return {
    bloomScene,
    bloomSkyMaskUniforms,
    uSceneBloomWeight,
    getEffectiveWeight,
    getBloomParams: () => ({ ...bloomParams }),
    setBloomParams: (params: Partial<BloomParams>) => {
      bloomParams = { ...bloomParams, ...params };
      applyTunablesLocal();
    },
    resetBloomParams: () => {
      const { skyReduce } = bloomParams;
      bloomParams = { ...defaultBloomParams(), skyReduce };
      applyTunablesLocal();
    },
    setBloomSkyReduceFromSun: (elevationDeg: number) => {
      const skyReduce = skyReduceForElevation(elevationDeg);
      if (Math.abs(skyReduce - bloomParams.skyReduce) < 1e-5) return;
      bloomParams = { ...bloomParams, skyReduce };
      bloomSkyMaskUniforms.skyReduce.value = skyReduce;
    },
    setCohesionWeightMul: (mul: number) => {
      cohesionWeightMul = mul;
    },
    applyDebugWeight,
  };
}
