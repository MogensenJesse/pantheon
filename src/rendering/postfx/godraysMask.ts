// src/rendering/postfx/godraysMask.ts — suppress open sky + antisolar god-ray artifacts
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
import type { Camera } from 'three';
import { PHASE0 } from '../../config/phase0';

const { GODRAYS } = PHASE0;
const LUMA_WEIGHTS = vec3(0.2126, 0.7152, 0.0722);

export interface GodraysMaskUniforms {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sunDirection: any;
}

/** World-space sun direction (target → sun), updated each frame. */
export function createGodraysMaskUniforms(): GodraysMaskUniforms {
  return { sunDirection: uniform(vec3(0, 1, 0)) };
}

/** Returns (uv) => mask factor for use inside depthAwareBlend (not a texture node). */
export function createGodraysMaskFn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sceneColor: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sceneDepth: any,
  camera: Camera,
  maskUniforms: GodraysMaskUniforms,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): (uvNode: any) => any {
  const uSunDir = maskUniforms.sunDirection;
  const cameraMatrixWorld = reference('matrixWorld', 'mat4', camera);
  const cameraProjectionMatrixInverse = reference('projectionMatrixInverse', 'mat4', camera);
  const cameraPosition = reference('position', 'vec3', camera);

  return (uvNode) => {
    const depth = sceneDepth.sample(uvNode).r;
    const sceneLuma = dot(sceneColor.sample(uvNode).rgb, LUMA_WEIGHTS);

    const skyMask = float(1).sub(
      smoothstep(float(GODRAYS.SKY_LUMA_START), float(GODRAYS.SKY_LUMA_END), sceneLuma),
    );

    const viewPos = getViewPosition(uvNode, depth, cameraProjectionMatrixInverse);
    const worldPos = cameraMatrixWorld.mul(viewPos);
    const viewDir = normalize(worldPos.xyz.sub(cameraPosition));
    const sunFacing = smoothstep(
      float(GODRAYS.SUN_FACING_MIN),
      float(GODRAYS.SUN_FACING_MAX),
      dot(viewDir, normalize(uSunDir)),
    );

    return skyMask.mul(sunFacing);
  };
}
