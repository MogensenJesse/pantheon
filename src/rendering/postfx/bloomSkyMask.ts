// src/rendering/postfx/bloomSkyMask.ts — reduce scene bloom on open sky (depth + sun disc)
import { dot, float, smoothstep, uniform, vec3 } from 'three/tsl';

export const LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

export interface BloomSkyMaskUniforms {
  skyDepthStart: any;
  skyDepthEnd: any;
  skySunLumaStart: any;
  skySunLumaEnd: any;
  skyReduce: any;
}

export interface BloomSkyMaskDefaults {
  skyDepthStart: number;
  skyDepthEnd: number;
  skySunLumaStart: number;
  skySunLumaEnd: number;
  skyReduce: number;
}

export function createBloomSkyMaskUniforms(defaults: BloomSkyMaskDefaults): BloomSkyMaskUniforms {
  return {
    skyDepthStart: uniform(defaults.skyDepthStart),
    skyDepthEnd: uniform(defaults.skyDepthEnd),
    skySunLumaStart: uniform(defaults.skySunLumaStart),
    skySunLumaEnd: uniform(defaults.skySunLumaEnd),
    skyReduce: uniform(defaults.skyReduce),
  };
}

/** Scale factor for bloom add (1 = full bloom, lower on far-depth sky pixels). */
export function bloomSkyAttenuation(sceneRgb: any, depth: any, u: BloomSkyMaskUniforms): any {
  const isFarSky = smoothstep(u.skyDepthStart, u.skyDepthEnd, depth);

  const sceneLuma = dot(sceneRgb, LUMA_WEIGHTS);
  const keepSunDisc = smoothstep(u.skySunLumaStart, u.skySunLumaEnd, sceneLuma);

  const skyAmount = isFarSky.mul(float(1).sub(keepSunDisc));
  return float(1).sub(skyAmount.mul(u.skyReduce));
}
