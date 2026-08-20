// src/rendering/tsl/guideReceiveGlowTsl.ts — terrain/prop cobble receive of the guide ribbon
import { Fn, float, If } from 'three/tsl';
import { GUIDE_GLOW_ACTIVE_EPS, guideGlowLiveUniforms } from '../guideGlowUniforms';
import { glowFromMask } from '../playerGlowTsl';
import { guideTravelGlowMulTsl } from './energyPulseTsl';

type TslNode = any;

/**
 * Terrain/prop cobble glow. `If` + `toVar` so hidden lines and empty texels skip
 * the pulse graph (`select`/`mix` would still evaluate both sides).
 */
export function guideReceiveGlowTsl(glowMap: TslNode, mapUv: TslNode, intensity: TslNode): TslNode {
  return Fn(() => {
    const out = float(0).toVar();
    If(intensity.greaterThan(GUIDE_GLOW_ACTIVE_EPS), () => {
      const guideSample = glowMap.sample(mapUv);
      If(guideSample.r.greaterThan(GUIDE_GLOW_ACTIVE_EPS), () => {
        const guideAlong = guideSample.g.mul(guideGlowLiveUniforms.uGuideAlongScale);
        const guidePulse = guideTravelGlowMulTsl(
          guideAlong,
          guideGlowLiveUniforms.uGuideClosestAlong,
          guideGlowLiveUniforms.uGuidePulseSpeed,
          guideGlowLiveUniforms.uGuidePulseSpacing,
          guideGlowLiveUniforms.uGuidePulseAmplitude,
          guideGlowLiveUniforms.uGuidePulseIdle,
          guideGlowLiveUniforms.uGuidePulseLength,
          guideGlowLiveUniforms.uGuideBreathSpeed,
          guideGlowLiveUniforms.uGuideBreathAmount,
        );
        out.assign(glowFromMask(guideSample.r.mul(guidePulse), intensity));
      });
    });
    return out;
  })();
}
