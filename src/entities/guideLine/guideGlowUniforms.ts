// src/entities/guideLine/guideGlowUniforms.ts — shared guide-ribbon receive-glow (terrain + props)
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RGBAFormat,
  UnsignedByteType,
} from 'three';
import { texture, uniform } from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';

function createPlaceholderGuideGlowTexture(): DataTexture {
  const tex = new DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, RGBAFormat, UnsignedByteType);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.wrapS = ClampToEdgeWrapping;
  tex.wrapT = ClampToEdgeWrapping;
  tex.colorSpace = NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const placeholderGuideGlow = createPlaceholderGuideGlowTexture();

/** Shared across detail/macro terrain and map props — one write updates all receivers. */
export const guideGlowLiveUniforms = {
  uGuideGlowMap: texture(placeholderGuideGlow),
  uGuideLightIntensity: uniform(0),
  uGuideGlowMul: uniform(VISUAL.guideLine.terrainGlowMul),
  uGuideClosestAlong: uniform(0),
  uGuideAlongScale: uniform(1),
  uGuidePulseSpeed: uniform(VISUAL.guideLine.pulseSpeed),
  uGuidePulseSpacing: uniform(VISUAL.guideLine.pulseSpacingM),
  uGuidePulseAmplitude: uniform(VISUAL.guideLine.pulseAmplitude),
  uGuidePulseIdle: uniform(VISUAL.guideLine.pulseIdle),
};

export function resetGuideGlowMapBinding(): void {
  guideGlowLiveUniforms.uGuideGlowMap.value = placeholderGuideGlow;
  guideGlowLiveUniforms.uGuideLightIntensity.value = 0;
}
