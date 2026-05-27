// src/rendering/postfx/bloomSkyMask.ts — reduce scene bloom on open sky (depth + sun disc)
import { dot, float, smoothstep, vec3 } from 'three/tsl';
import { PHASE0 } from '../../config/phase0';

const { BLOOM } = PHASE0;
const LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

/** Scale factor for bloom add (1 = full bloom, lower on far-depth sky pixels). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function bloomSkyAttenuation(sceneRgb: any, depth: any): any {
  const isFarSky = smoothstep(
    float(BLOOM.SKY_DEPTH_START),
    float(BLOOM.SKY_DEPTH_END),
    depth,
  );

  const sceneLuma = dot(sceneRgb, LUMA_WEIGHTS);
  const keepSunDisc = smoothstep(
    float(BLOOM.SKY_SUN_LUMA_START),
    float(BLOOM.SKY_SUN_LUMA_END),
    sceneLuma,
  );

  const skyAmount = isFarSky.mul(float(1).sub(keepSunDisc));
  return float(1).sub(skyAmount.mul(float(BLOOM.SKY_REDUCE)));
}
