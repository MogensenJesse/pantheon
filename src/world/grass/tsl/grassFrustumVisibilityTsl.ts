// src/world/grass/tsl/grassFrustumVisibilityTsl.ts — Revo-style padded NDC frustum test (article)
import { EPSILON, float, max, mix, step, vec3, vec4 } from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from './tslNode';

/** Floor view depth when scaling NDC pad — avoids far-screen over-cull when pitched down. */
const MIN_EYE_DEPTH_FOR_PAD = 5.5;

/**
 * Conservative screen visibility (0/1) for a blade base or tip in world space.
 * @see https://aleksandargjoreski.dev/blog/growing-my-grass-shader/
 */
export function grassFrustumVisibilityAt(
  worldPos: TslNode,
  boundsRadius: TslNode,
  {
    uCameraMatrix,
    uFx,
    uFy,
    uCullPadNdcX,
    uCullPadNdcYNear,
    uCullPadNdcYFar,
  }: {
    uCameraMatrix: TslNode;
    uFx: TslNode;
    uFy: TslNode;
    uCullPadNdcX: TslNode;
    uCullPadNdcYNear: TslNode;
    uCullPadNdcYFar: TslNode;
  },
): TslNode {
  const one = float(1);
  const clip = uCameraMatrix.mul(vec4(worldPos, 1));
  const invW = one.div(clip.w);
  const ndc = clip.xyz.mul(invW);

  const eyeDepthForPad = clip.w.abs().max(float(MIN_EYE_DEPTH_FOR_PAD));
  const rNdcX = uFx.mul(boundsRadius).div(eyeDepthForPad).add(uCullPadNdcX);
  const rNdcYNear = uFy.mul(boundsRadius).div(eyeDepthForPad).add(uCullPadNdcYNear);

  const visLeft = step(one.negate().sub(rNdcX), ndc.x);
  const visRight = step(ndc.x, one.add(rNdcX));
  const visX = visLeft.mul(visRight);

  const visNear = step(one.negate().sub(rNdcYNear), ndc.y);
  const visFar = step(ndc.y, one.add(uCullPadNdcYFar));
  const visY = visNear.mul(visFar);

  const visZ = step(float(-1), ndc.z).mul(step(ndc.z, one));

  return visX.mul(visY).mul(visZ).mul(step(EPSILON, clip.w));
}

/**
 * Conservative screen visibility (0/1) for a blade at world position (terrain Y).
 */
export function grassFrustumVisibility(
  worldPos: TslNode,
  boundsRadius: TslNode | null = null,
): TslNode {
  const uniforms = grassSharedUniforms as any;
  const radius = boundsRadius ?? uniforms.uBladeBoundsRadius;
  const baseVis = grassFrustumVisibilityAt(worldPos, radius, {
    uCameraMatrix: uniforms.uCameraMatrix,
    uFx: uniforms.uFx,
    uFy: uniforms.uFy,
    uCullPadNdcX: uniforms.uCullPadNdcX,
    uCullPadNdcYNear: uniforms.uCullPadNdcYNear,
    uCullPadNdcYFar: uniforms.uCullPadNdcYFar,
  });

  const tipPos = vec3(worldPos.x, worldPos.y.add(radius), worldPos.z);
  const tipVis = grassFrustumVisibilityAt(tipPos, radius, {
    uCameraMatrix: uniforms.uCameraMatrix,
    uFx: uniforms.uFx,
    uFy: uniforms.uFy,
    uCullPadNdcX: uniforms.uCullPadNdcX,
    uCullPadNdcYNear: uniforms.uCullPadNdcYNear,
    uCullPadNdcYFar: uniforms.uCullPadNdcYFar,
  });
  const frustumVis = max(baseVis, tipVis);

  return mix(frustumVis, float(1), grassFrustumBypassActive());
}

/** 1 when steep pitch bypasses the GPU frustum test. */
export function grassFrustumBypassActive(): TslNode {
  const { uCameraForward } = grassSharedUniforms as any;
  return float(1).sub(step(uCameraForward.y, float(-0.55)));
}
