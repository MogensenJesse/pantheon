// src/rendering/postfx/godraysMask.ts — suppress open sky + antisolar god-ray artifacts

import { type Camera, Vector3 } from 'three';
import {
  dot,
  float,
  getViewPosition,
  mix,
  normalize,
  reference,
  smoothstep,
  uniform,
} from 'three/tsl';
import { VISUAL } from '../../config/visualTuning';
import { LUMA_WEIGHTS } from './bloomSkyMask';

export interface GodraysMaskUniforms {
  sunDirection: any;
  skyLumaStart: any;
  skyLumaEnd: any;
  sunFacingMin: any;
  sunFacingMax: any;
  skyDepthStart: any;
  skyDepthEnd: any;
}

export interface GodraysMaskDefaults {
  skyLumaStart: number;
  skyLumaEnd: number;
  sunFacingMin: number;
  sunFacingMax: number;
  skyDepthStart?: number;
  skyDepthEnd?: number;
}

/** World-space sun direction + sky/sun-facing mask thresholds (live-tunable). */
export function createGodraysMaskUniforms(defaults: GodraysMaskDefaults): GodraysMaskUniforms {
  const g = VISUAL.godrays;
  return {
    sunDirection: uniform(new Vector3(0, 1, 0)),
    skyLumaStart: uniform(defaults.skyLumaStart),
    skyLumaEnd: uniform(defaults.skyLumaEnd),
    sunFacingMin: uniform(defaults.sunFacingMin),
    sunFacingMax: uniform(defaults.sunFacingMax),
    skyDepthStart: uniform(defaults.skyDepthStart ?? g.SKY_DEPTH_START),
    skyDepthEnd: uniform(defaults.skyDepthEnd ?? g.SKY_DEPTH_END),
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
  const uSkyDepthStart = maskUniforms.skyDepthStart;
  const uSkyDepthEnd = maskUniforms.skyDepthEnd;
  const cameraMatrixWorld = reference('matrixWorld', 'mat4', camera);
  const cameraProjectionMatrixInverse = reference('projectionMatrixInverse', 'mat4', camera);
  const cameraPosition = reference('position', 'vec3', camera);

  return (uvNode) => {
    const depth = sceneDepth.sample(uvNode).r;
    const sceneLuma = dot(sceneColor.sample(uvNode).rgb, LUMA_WEIGHTS);

    // Near-reject only (depth near→mid). Ridge gaps and far sky stay open so shadow-map
    // shafts can read; close ground does not get volumetric wash.
    const depthGate = smoothstep(uSkyDepthStart, uSkyDepthEnd, depth);
    // Soft luma atten on very bright HDR sky — do not fully zero (that hid shafts).
    const lumaAtten = float(1).sub(smoothstep(uSkyLumaStart, uSkyLumaEnd, sceneLuma).mul(0.55));
    const skyMask = mix(lumaAtten, float(1), depthGate.mul(0.65));

    const viewPos = getViewPosition(uvNode, depth, cameraProjectionMatrixInverse);
    const worldPos = cameraMatrixWorld.mul(viewPos);
    const viewDir = normalize(worldPos.xyz.sub(cameraPosition));
    const sunFacing = smoothstep(uSunFacingMin, uSunFacingMax, dot(viewDir, normalize(uSunDir)));

    // sunFacing gates antisolar wash; skyMask already folds depthGate — do not mul depthGate again.
    return skyMask.mul(sunFacing);
  };
}
