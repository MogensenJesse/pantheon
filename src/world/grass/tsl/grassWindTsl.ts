// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/grassWindTsl.ts — per-blade wind in the draw shader (smooth with uTime)
import type { Texture } from 'three';
import { float, hash, mix, texture, vec2 } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';

/** World-space wind vector (xz stored in vec2: .x → world X, .y → world Z). */
export function sampleGrassWindXZ(worldX, worldZ, windAtlas: Texture | null) {
  const { uWindDirection, uWindStrength, uTime, uWindSpeed } = grassSharedUniforms;
  const uvBase = vec2(worldX, worldZ).mul(0.01);
  const scroll = uWindDirection.mul(uTime.mul(uWindSpeed));

  const windTex = windAtlas ? texture(windAtlas) : null;
  let windFactor = float(0);
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
    // Procedural fallback when atlas 404 — dual hash layers to avoid directional banding.
    const windUv = uvBase.add(scroll);
    const uvB = uvBase.mul(1.37).add(scroll.mul(1.11));
    const nA = hash(windUv.x.mul(17).add(windUv.y.mul(31)))
      .mul(2)
      .sub(1);
    const nB = hash(uvB.x.mul(23).add(uvB.y.mul(41)))
      .mul(2)
      .sub(1);
    const mixRand = hash(worldX.mul(12.9898).add(worldZ.mul(78.233))).fract();
    const n = mix(nA, nB, mixRand.clamp(0.2, 0.8));
    windFactor = n.mul(uWindStrength);
  }

  return uWindDirection.mul(windFactor);
}
