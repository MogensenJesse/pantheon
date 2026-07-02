// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/tsl/grassFrustumVisibilityTsl.ts — Revo-style padded NDC frustum test (article)
import { EPSILON, float, max, mix, step, vec3, vec4 } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';

/** Floor view depth when scaling NDC pad — avoids far-screen over-cull when pitched down. */
const MIN_EYE_DEPTH_FOR_PAD = 5.5;

/**
 * Conservative screen visibility (0/1) for a blade base or tip in world space.
 * @see https://aleksandargjoreski.dev/blog/growing-my-grass-shader/
 */
function grassFrustumVisibilityAt(
  worldPos,
  boundsRadius,
  { uCameraMatrix, uFx, uFy, uCullPadNdcX, uCullPadNdcYNear, uCullPadNdcYFar },
) {
  const one = float(1);
  const clip = uCameraMatrix.mul(vec4(worldPos, 1));
  const invW = one.div(clip.w);
  const ndc = clip.xyz.mul(invW);

  // Cap how small depth-scaled pads can get. When looking down, the far half of the
  // screen has large eye depth → tiny pads → whole quadrants get culled as yaw rotates.
  const eyeDepthForPad = clip.w.abs().max(float(MIN_EYE_DEPTH_FOR_PAD));
  const rNdcX = uFx.mul(boundsRadius).div(eyeDepthForPad).add(uCullPadNdcX);
  const rNdcYNear = uFy.mul(boundsRadius).div(eyeDepthForPad).add(uCullPadNdcYNear);

  const visLeft = step(one.negate().sub(rNdcX), ndc.x);
  const visRight = step(ndc.x, one.add(rNdcX));
  const visX = visLeft.mul(visRight);

  // Blades grow upward from their base: extend the bottom edge by the projected
  // blade height (tip may be on-screen while the base is below), but the top edge
  // needs only a small pad — a base above the top edge puts the whole blade off-screen.
  const visNear = step(one.negate().sub(rNdcYNear), ndc.y);
  const visFar = step(ndc.y, one.add(uCullPadNdcYFar));
  const visY = visNear.mul(visFar);

  const visZ = step(float(-1), ndc.z).mul(step(ndc.z, one));

  return visX.mul(visY).mul(visZ).mul(step(EPSILON, clip.w));
}

/**
 * Conservative screen visibility (0/1) for a blade at world position (terrain Y).
 */
export function grassFrustumVisibility(worldPos, boundsRadius = null) {
  const uniforms = {
    uCameraMatrix: grassSharedUniforms.uCameraMatrix,
    uFx: grassSharedUniforms.uFx,
    uFy: grassSharedUniforms.uFy,
    uCullPadNdcX: grassSharedUniforms.uCullPadNdcX,
    uCullPadNdcYNear: grassSharedUniforms.uCullPadNdcYNear,
    uCullPadNdcYFar: grassSharedUniforms.uCullPadNdcYFar,
  };
  const radius = boundsRadius ?? grassSharedUniforms.uBladeBoundsRadius;
  const baseVis = grassFrustumVisibilityAt(worldPos, radius, uniforms);

  const tipPos = vec3(worldPos.x, worldPos.y.add(radius), worldPos.z);
  const tipVis = grassFrustumVisibilityAt(tipPos, radius, uniforms);
  const frustumVis = max(baseVis, tipVis);

  // Revo pad assumes horizon viewing (+world-Y ≈ screen-up). When pitched steeply
  // down that mapping breaks — skip GPU frustum and rely on annulus + biome cull.
  return mix(frustumVis, float(1), grassFrustumBypassActive());
}

/** 1 when steep pitch bypasses the GPU frustum test. */
export function grassFrustumBypassActive() {
  const { uCameraForward } = grassSharedUniforms;
  return float(1).sub(step(uCameraForward.y, float(-0.55)));
}
