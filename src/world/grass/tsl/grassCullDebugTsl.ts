// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/tsl/grassCullDebugTsl.ts — DEV cull-reason false-color overlay
import { Color } from 'three';
import { float, mix, step, vec3 } from 'three/tsl';

/** Packed into SSBO visibility byte when DEV cull debug is on. */
export const GRASS_CULL_REASON = {
  outsideAnnulus: 1,
  biomeFail: 2,
  frustumFail: 3,
  visibleFrustum: 4,
  visibleNear: 5,
  visibleFrustumBypass: 6,
} as const;

const REASON_COLORS: Record<number, Color> = {
  [GRASS_CULL_REASON.outsideAnnulus]: new Color('#cc44ff'),
  [GRASS_CULL_REASON.biomeFail]: new Color('#ff8800'),
  [GRASS_CULL_REASON.frustumFail]: new Color('#ff2222'),
  [GRASS_CULL_REASON.visibleFrustum]: new Color('#22dd44'),
  [GRASS_CULL_REASON.visibleNear]: new Color('#22dddd'),
  [GRASS_CULL_REASON.visibleFrustumBypass]: new Color('#6688ff'),
};

function colorForReason(reasonCode) {
  const c1 = vec3(REASON_COLORS[1]!.r, REASON_COLORS[1]!.g, REASON_COLORS[1]!.b);
  const c2 = vec3(REASON_COLORS[2]!.r, REASON_COLORS[2]!.g, REASON_COLORS[2]!.b);
  const c3 = vec3(REASON_COLORS[3]!.r, REASON_COLORS[3]!.g, REASON_COLORS[3]!.b);
  const c4 = vec3(REASON_COLORS[4]!.r, REASON_COLORS[4]!.g, REASON_COLORS[4]!.b);
  const c5 = vec3(REASON_COLORS[5]!.r, REASON_COLORS[5]!.g, REASON_COLORS[5]!.b);
  const c6 = vec3(REASON_COLORS[6]!.r, REASON_COLORS[6]!.g, REASON_COLORS[6]!.b);

  let color = c1;
  color = mix(color, c2, step(1.5, reasonCode).mul(step(reasonCode, 2.5)));
  color = mix(color, c3, step(2.5, reasonCode).mul(step(reasonCode, 3.5)));
  color = mix(color, c4, step(3.5, reasonCode).mul(step(reasonCode, 4.5)));
  color = mix(color, c5, step(4.5, reasonCode).mul(step(reasonCode, 5.5)));
  color = mix(color, c6, step(5.5, reasonCode).mul(step(reasonCode, 6.5)));
  return color;
}

/** Replace shaded albedo with cull-reason colors when `uGrassCullDebug` is enabled. */
export function applyGrassCullDebugColor(shadedColor, reasonCode, uGrassCullDebug) {
  const debugOn = step(float(0.5), uGrassCullDebug);
  const debugColor = colorForReason(reasonCode);
  return mix(shadedColor, debugColor, debugOn);
}
