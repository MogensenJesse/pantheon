// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/clouds/volumetric/volumetricCloudPassTsl.ts — fullscreen cloud pass (Phase 2.3 RTT)
import type { Camera } from 'three';
import {
  float,
  Fn,
  getViewPosition,
  length,
  max,
  normalize,
  reference,
  screenUV,
  smoothstep,
  vec3,
  vec4,
} from 'three/tsl';
import type { CloudDensityUniforms } from './cloudDensityTsl';
import type { CloudRaymarchUniforms } from './cloudRaymarchTsl';
import { marchCloudSlab } from './cloudRaymarchTsl';

type TslNode = any;

/** Build RTT color node — vec4 cloud rgb + slab-occluded alpha. */
export function buildVolumetricCloudPassNode(
  camera: Camera,
  sceneDepth: TslNode,
  densityUniforms: CloudDensityUniforms,
  raymarchUniforms: CloudRaymarchUniforms,
): TslNode {
  const cameraMatrixWorld = reference('matrixWorld', 'mat4', camera);
  const cameraProjectionMatrixInverse = reference('projectionMatrixInverse', 'mat4', camera);
  const cameraPosition = reference('position', 'vec3', camera);

  return Fn(() => {
    const uv = screenUV;
    const depth = sceneDepth.sample(uv).r;

    const viewPosFar = getViewPosition(uv, float(1), cameraProjectionMatrixInverse);
    const worldFar = cameraMatrixWorld.mul(viewPosFar);
    const rayDir = normalize(worldFar.xyz.sub(cameraPosition));

    const viewPosScene = getViewPosition(uv, depth, cameraProjectionMatrixInverse);
    const worldScene = cameraMatrixWorld.mul(viewPosScene);
    const sceneDist = length(worldScene.xyz.sub(cameraPosition));

    const rdY = rayDir.y;
    const eps = float(1e-4);
    const rdSign = rdY.greaterThanEqual(0).select(float(1), float(-1));
    const rdSafe = rdY.add(eps.mul(rdSign));
    const tSlabEnter = max(densityUniforms.uCloudBaseY.sub(cameraPosition.y).div(rdSafe), float(0));

    const marchDebug = raymarchUniforms.uMarchDebug.greaterThan(0.5).and(
      raymarchUniforms.uMarchDebug.lessThan(1.5),
    );
    const densityDebug = raymarchUniforms.uMarchDebug.greaterThan(1.5);
    const marchDist = marchDebug.select(float(50000), max(sceneDist, float(0.001)));

    const cloud = marchCloudSlab(cameraPosition, rayDir, marchDist, uv, raymarchUniforms);
    const mixRgb = marchDebug.select(vec3(1, 0.2, 1), cloud.rgb);

    const slabOcclusion = smoothstep(tSlabEnter.sub(12), tSlabEnter.add(28), sceneDist);
    const passAlpha = cloud.a
      .mul(slabOcclusion)
      .mul(marchDebug.select(float(1), densityDebug.select(float(0.598), float(1))));

    return vec4(mixRgb, passAlpha);
  })();
}
