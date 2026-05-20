// src/rendering/postfx/bloomEffect.ts
import { smoothstep } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SceneTex = any;

export function applyBloomEffect(
  sceneTex: SceneTex,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sampleUv: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  baseRgb: any,
  uBloomThreshold: SceneTex,
  uBloomThresholdSoft: SceneTex,
  uBloomStrength: SceneTex,
  uBloomRadius: SceneTex,
): SceneTex {
  const bloomPx = sceneTex.blur(uBloomRadius).sample(sampleUv).rgb;
  const lum = bloomPx.r
    .mul(0.2126)
    .add(bloomPx.g.mul(0.7152))
    .add(bloomPx.b.mul(0.0722));
  const brightMask = smoothstep(uBloomThreshold, uBloomThreshold.add(uBloomThresholdSoft), lum);
  return baseRgb.add(bloomPx.mul(brightMask).mul(uBloomStrength));
}
