// src/rendering/postfx/edgeAaEffect.ts — post-tonemap edge soften (bloom-safe)
import { dot, float, max, mix, smoothstep, vec2, vec3 } from 'three/tsl';
import { PHASE0 } from '../../config/phase0';

const { EDGE_AA } = PHASE0;
const LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyEdgeAa(sceneTex: any, uv: any, color: any, resolution: any): any {
  const texel = float(1).div(resolution.x);
  const cL = sceneTex.sample(uv.sub(vec2(texel, 0))).rgb;
  const cR = sceneTex.sample(uv.add(vec2(texel, 0))).rgb;
  const cU = sceneTex.sample(uv.sub(vec2(0, texel))).rgb;
  const cD = sceneTex.sample(uv.add(vec2(0, texel))).rgb;
  const edge = cL.sub(cR).length().add(cU.sub(cD).length());
  const aaBlend = smoothstep(float(EDGE_AA.EDGE_LOW), float(EDGE_AA.EDGE_HIGH), edge);
  const neighborAvg = cL.add(cR).add(cU).add(cD).div(4);

  // Fade out on bright post-bloom pixels (tree/sky silhouettes after bloom + ACES).
  const luma = dot(color, LUMA_WEIGHTS);
  const lumaFade = float(1).sub(
    smoothstep(float(EDGE_AA.LUMA_FADE_START), float(EDGE_AA.LUMA_FADE_END), luma),
  );

  // Never darken: only soften toward brighter neighbors (fixes dark fringes with bloom).
  const softened = max(color, neighborAvg);
  const blend = aaBlend.mul(lumaFade).mul(float(EDGE_AA.STRENGTH));
  return mix(color, softened, blend);
}
