// src/rendering/guideGlowUniforms.ts — shared guide-ribbon receive-glow (terrain + props)
import {
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  LinearFilter,
  NoColorSpace,
  RGFormat,
} from 'three';
import { texture, uniform } from 'three/tsl';
import { VISUAL } from '../config/visualTuning';

/** Skip cobble pulse graph when intensity or mask.r is below this. */
export const GUIDE_GLOW_ACTIVE_EPS = 0.001;

function createPlaceholderGuideGlowTexture(): DataTexture {
  const tex = new DataTexture(new Float32Array([0, 0]), 1, 1, RGFormat, FloatType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const placeholderGuideGlow = createPlaceholderGuideGlowTexture();

/** Shared across detail/macro terrain and map props — one write updates all receivers. */
export const guideGlowLiveUniforms = {
  uGuideGlowMap: texture(placeholderGuideGlow),
  uGuideLightIntensity: uniform(0),
  uGuideClosestAlong: uniform(0),
  uGuideAlongScale: uniform(1),
  uGuidePulseSpeed: uniform(VISUAL.guideLine.pulseSpeed),
  uGuidePulseSpacing: uniform(VISUAL.guideLine.pulseSpacingM),
  uGuidePulseAmplitude: uniform(VISUAL.guideLine.pulseAmplitude),
  uGuidePulseIdle: uniform(VISUAL.guideLine.pulseIdle),
  uGuidePulseLength: uniform(VISUAL.guideLine.pulseLengthM),
  uGuideBreathSpeed: uniform(VISUAL.guideLine.breathSpeed),
  uGuideBreathAmount: uniform(VISUAL.guideLine.breathAmount),
  uGuideRevealAlong: uniform(1e6),
  uGuideRevealEdge: uniform(VISUAL.guideLine.pulseLengthM),
};

export function resetGuideGlowMapBinding(): void {
  guideGlowLiveUniforms.uGuideGlowMap.value = placeholderGuideGlow;
  guideGlowLiveUniforms.uGuideLightIntensity.value = 0;
}
