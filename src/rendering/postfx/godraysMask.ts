// src/rendering/postfx/godraysMask.ts — suppress open sky + antisolar god-ray artifacts

import { type Camera, Vector3 } from 'three';
import {
  dot,
  float,
  getViewPosition,
  normalize,
  reference,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';

const LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

export interface GodraysMaskUniforms {
  sunDirection: any;
  skyLumaStart: any;
  skyLumaEnd: any;
  sunFacingMin: any;
  sunFacingMax: any;
}

export interface GodraysMaskDefaults {
  skyLumaStart: number;
  skyLumaEnd: number;
  sunFacingMin: number;
  sunFacingMax: number;
}

/** World-space sun direction + sky/sun-facing mask thresholds (live-tunable). */
export function createGodraysMaskUniforms(defaults: GodraysMaskDefaults): GodraysMaskUniforms {
  return {
    sunDirection: uniform(new Vector3(0, 1, 0)),
    skyLumaStart: uniform(defaults.skyLumaStart),
    skyLumaEnd: uniform(defaults.skyLumaEnd),
    sunFacingMin: uniform(defaults.sunFacingMin),
    sunFacingMax: uniform(defaults.sunFacingMax),
  };
}

/** Returns (uv) => mask factor for use inside depthAwareBlend (not a texture node). */
export function createGodraysMaskFn(
  sceneColor: any,
  sceneDepth: any,
  camera: Camera,
  maskUniforms: GodraysMaskUniforms,
): (uvNode: any) => any {
  const uSunDir = maskUniforms.sunDirection;
  const uSkyLumaStart = maskUniforms.skyLumaStart;
  const uSkyLumaEnd = maskUniforms.skyLumaEnd;
  const uSunFacingMin = maskUniforms.sunFacingMin;
  const uSunFacingMax = maskUniforms.sunFacingMax;
  const cameraMatrixWorld = reference('matrixWorld', 'mat4', camera);
  const cameraProjectionMatrixInverse = reference('projectionMatrixInverse', 'mat4', camera);
  const cameraPosition = reference('position', 'vec3', camera);

  return (uvNode) => {
    const depth = sceneDepth.sample(uvNode).r;
    const sceneLuma = dot(sceneColor.sample(uvNode).rgb, LUMA_WEIGHTS);

    const skyMask = float(1).sub(smoothstep(uSkyLumaStart, uSkyLumaEnd, sceneLuma));

    const viewPos = getViewPosition(uvNode, depth, cameraProjectionMatrixInverse);
    const worldPos = cameraMatrixWorld.mul(viewPos);
    const viewDir = normalize(worldPos.xyz.sub(cameraPosition));
    const sunFacing = smoothstep(uSunFacingMin, uSunFacingMax, dot(viewDir, normalize(uSunDir)));

    return skyMask.mul(sunFacing);
  };
}
