// @ts-nocheck — TSL node parameter typings incomplete in r185
// src/rendering/atmosphere/volumetricClouds/tsl/cloudCompositeTsl.ts — front-to-back cloud over scene RGB
import { Fn, mix, uniform, vec4 } from 'three/tsl';

/** Blend cloud march RGBA (scatter rgb, mean transmittance in a) over scene color. */
export function createCloudCompositeFn(uCloudWeight: ReturnType<typeof uniform>) {
  const cloudComposite = Fn(([sceneRgb, cloudLayer]) => {
    const scatter = cloudLayer.xyz;
    const transmittance = cloudLayer.w;
    const lit = sceneRgb.mul(transmittance).add(scatter);
    return mix(sceneRgb, lit, uCloudWeight);
  });

  return cloudComposite;
}

/** Passthrough layer when clouds are disabled — full transmittance, no scatter. */
export const CLOUD_LAYER_PASSTHROUGH = vec4(0, 0, 0, 1);
