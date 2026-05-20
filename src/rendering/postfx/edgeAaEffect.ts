// src/rendering/postfx/edgeAaEffect.ts
import { float, mix, smoothstep, vec2 } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyEdgeAa(sceneTex: any, uv: any, color: any, resolution: any): any {
  const texel = float(1).div(resolution.x);
  const cL = sceneTex.sample(uv.sub(vec2(texel, 0))).rgb;
  const cR = sceneTex.sample(uv.add(vec2(texel, 0))).rgb;
  const cU = sceneTex.sample(uv.sub(vec2(0, texel))).rgb;
  const cD = sceneTex.sample(uv.add(vec2(0, texel))).rgb;
  const edge = cL.sub(cR).length().add(cU.sub(cD).length());
  const aaBlend = smoothstep(float(0.02), float(0.12), edge);
  const neighborAvg = cL.add(cR).add(cU).add(cD).div(4);
  return mix(color, neighborAvg, aaBlend.mul(0.45));
}
