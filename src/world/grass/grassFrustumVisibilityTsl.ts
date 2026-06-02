// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/grassFrustumVisibilityTsl.ts — Revo-style padded NDC frustum test (article)
import { EPSILON, float, step, vec3, vec4 } from 'three/tsl';
import { grassUniforms } from './grassUniforms';

/**
 * Conservative screen visibility (0/1) for a blade at world position (terrain Y).
 * @see https://aleksandargjoreski.dev/blog/growing-my-grass-shader/
 */
export function grassFrustumVisibility(worldPos) {
  const {
    uCameraMatrix,
    uFx,
    uFy,
    uBladeBoundsRadius,
    uCullPadNdcX,
    uCullPadNdcYNear,
    uCullPadNdcYFar,
  } = grassUniforms;

  const one = float(1);
  const clip = uCameraMatrix.mul(vec4(worldPos, 1));
  const invW = one.div(clip.w);
  const ndc = clip.xyz.mul(invW);

  const eyeDepthAbs = clip.w.abs().max(EPSILON);
  const rNdcX = uFx.mul(uBladeBoundsRadius).div(eyeDepthAbs).add(uCullPadNdcX);
  const rNdcY = uFy.mul(uBladeBoundsRadius).div(eyeDepthAbs);
  const rNdcYNear = rNdcY.add(uCullPadNdcYNear);
  const rNdcYFar = rNdcY.sub(uCullPadNdcYFar);

  const visLeft = step(one.negate().sub(rNdcX), ndc.x);
  const visRight = step(ndc.x, one.add(rNdcX));
  const visX = visLeft.mul(visRight);

  const visNear = step(one.negate().sub(rNdcYNear), ndc.y);
  const visFar = step(ndc.y.add(rNdcYFar), one);
  const visY = visNear.mul(visFar);

  const visZ = step(float(-1), ndc.z).mul(step(ndc.z, one));

  return visX.mul(visY).mul(visZ);
}
