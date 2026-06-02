// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/grassWindTsl.ts — per-blade wind in the draw shader (smooth with uTime)
import type { Texture } from 'three';
import { hash, mix, texture, vec2 } from 'three/tsl';
import { grassUniforms } from './grassUniforms';

/** World-space wind vector (xz stored in vec2: .x → world X, .y → world Z). */
export function sampleGrassWindXZ(worldX, worldZ, windAtlas: Texture | null) {
  const { uWindDirection, uWindStrength, uTime, uWindSpeed } = grassUniforms;
  const uvBase = vec2(worldX, worldZ).mul(0.01);
  const scroll = uWindDirection.mul(uTime.mul(uWindSpeed));

  let windFactor;
  const windTex = windAtlas ? texture(windAtlas) : null;
  if (windTex) {
    const uvA = uvBase.add(scroll);
    const uvB = uvBase.mul(1.37).add(scroll.mul(1.11));
    const nA = windTex.sample(uvA).mul(2).sub(1);
    const nB = windTex.sample(uvB).mul(2).sub(1);
    const mixRand = hash(worldX.mul(12.9898).add(worldZ.mul(78.233))).fract();
    const w = mixRand.clamp(0.2, 0.8);
    const n = mix(nA, nB, w);
    windFactor = n.r.mul(uWindStrength).add(n.g.mul(uWindStrength).mul(0.35));
  } else {
    const windUv = uvBase.add(scroll);
    const nA = hash(windUv.x.mul(17).add(windUv.y.mul(31))).mul(2).sub(1);
    windFactor = nA.mul(uWindStrength);
  }

  return uWindDirection.mul(windFactor);
}
