// src/world/cloud/cloudSpriteMaterial.ts — TSL puff material for cloud sprites
import { DoubleSide, type Texture } from 'three';
import { float, max, mix, pow, smoothstep, texture, uniform, uv, vec3 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

/** Floor for night-side alpha so puffs don't fully vanish at low daylight. */
const NIGHT_ALPHA_FLOOR = 0.15;

export type CloudMaterialUniforms = {
  uDaylight: ReturnType<typeof uniform>;
  uOpacityBoost: ReturnType<typeof uniform>;
  uAlphaMin: ReturnType<typeof uniform>;
  uAlphaMax: ReturnType<typeof uniform>;
  uNightAlphaMul: ReturnType<typeof uniform>;
  uAlphaPower: ReturnType<typeof uniform>;
  uColorDayThreshold: ReturnType<typeof uniform>;
  uNightTintDarkness: ReturnType<typeof uniform>;
};

export interface CloudSpriteMaterial {
  mat: MeshBasicNodeMaterial;
  uniforms: CloudMaterialUniforms;
}

/**
 * Build a transparent puff material that tints by daylight and fades to a deep
 * blue-violet at night. Each sprite layer gets its own material instance so the
 * dev panel can drive per-tier opacity bands.
 */
export function createCloudSpriteMaterial(cloudTexture: Texture): CloudSpriteMaterial {
  const uDaylight = uniform(0.12);
  const uOpacityBoost = uniform(0.62);
  const uAlphaMin = uniform(0.38);
  const uAlphaMax = uniform(0.72);
  const uNightAlphaMul = uniform(0.2);
  const uAlphaPower = uniform(2.2);
  const uColorDayThreshold = uniform(0.35);
  const uNightTintDarkness = uniform(0.85);

  const texNode = texture(cloudTexture, uv());
  const dayTint = vec3(1.0, 0.97, 0.92);
  const skyNightTint = vec3(0.04, 0.05, 0.08);
  const twilightTint = vec3(0.12, 0.1, 0.14);
  const nightTint = mix(twilightTint, skyNightTint, uNightTintDarkness);

  const colorMix = smoothstep(float(0), uColorDayThreshold, uDaylight);
  const tint = mix(nightTint, dayTint, colorMix);

  const lum = texNode.r.mul(0.299).add(texNode.g.mul(0.587)).add(texNode.b.mul(0.114));
  const desatAmt = float(1).sub(colorMix).mul(0.65);
  const desatRgb = mix(texNode.rgb, vec3(lum, lum, lum), desatAmt);
  const colored = desatRgb.mul(tint);

  const alphaMix = pow(max(uDaylight, float(0)), uAlphaPower).mul(uNightAlphaMul);
  const daylightAlpha = mix(uAlphaMin.mul(float(NIGHT_ALPHA_FLOOR)), uAlphaMax, alphaMix);

  const mat = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
  });
  mat.colorNode = colored as never;
  mat.opacityNode = texNode.a.mul(daylightAlpha).mul(uOpacityBoost) as never;

  return {
    mat,
    uniforms: {
      uDaylight,
      uOpacityBoost,
      uAlphaMin,
      uAlphaMax,
      uNightAlphaMul,
      uAlphaPower,
      uColorDayThreshold,
      uNightTintDarkness,
    },
  };
}
