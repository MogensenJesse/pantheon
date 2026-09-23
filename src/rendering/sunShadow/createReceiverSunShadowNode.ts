// src/rendering/sunShadow/createReceiverSunShadowNode.ts — near PCSS ↔ far coverage + cloud
import type { DirectionalLight } from 'three';
import { abs, float, max, min, mix, positionWorld, smoothstep, vec4 } from 'three/tsl';
import { createCloudCastShadowNode, getCloudCastShadowLight } from './cloudCastShadow';
import { createSunShadowNode } from './createSunShadowNode';
import { nearCascadeHandoffUniforms } from './nearCascadeHandoffUniforms';
import { createNearCascadeShadowNode } from './nearCascadeShadow';

export type ReceiverSunShadowNode = ReturnType<typeof vec4>;

/**
 * Ground receivers (terrain, grass, props, water):
 * near PCSS inside the near ortho square, far coverage outside, softstep on the
 * **light-view Chebyshev edge** (matches the shadow map — not a world-XZ circle).
 * The near square is centered on the follow target (player XZ + terrain Y).
 * Soft cloud-cast mins on top when that light exists.
 *
 * Keep `mix` (not TSL `If`). Branching around PCSS/Vogel samples breaks screen-space
 * derivatives and draws the ±32 m ortho as a dark square around the player.
 * LOD2 grass already skips near via {@link createFarOnlySunShadowNode}.
 */
export function createReceiverSunShadowNode(sun: DirectionalLight): ReceiverSunShadowNode {
  const near = createNearCascadeShadowNode();
  if (!near) {
    throw new Error(
      'createReceiverSunShadowNode: near cascade shadow is required (createNearCascadeShadowLight first)',
    );
  }
  const far = createSunShadowNode(sun);

  const { uNearShadowFocus, uNearLightRight, uNearLightUp, uNearHalfExtentM, uNearFadeBandM } =
    nearCascadeHandoffUniforms;

  // Light-view XY vs ortho ±halfExtent (same square the near depth map covers).
  const toFocus = positionWorld.sub(uNearShadowFocus);
  const lightX = toFocus.dot(uNearLightRight);
  const lightY = toFocus.dot(uNearLightUp);
  const chebyshev = max(abs(lightX), abs(lightY));
  const inner = max(uNearHalfExtentM.sub(uNearFadeBandM), float(0));
  const farWeight = smoothstep(inner, uNearHalfExtentM, chebyshev);
  const cascaded = mix(float((near as any).r), float((far as any).r), farWeight);

  const cloudLight = getCloudCastShadowLight();
  const cloud = cloudLight ? createCloudCastShadowNode() : null;
  if (!cloud) {
    return vec4(cascaded, float(0), float(0), float(1));
  }

  const visibility = min(cascaded, float((cloud as any).r));
  return vec4(visibility, float(0), float(0), float(1));
}

/**
 * Far grass (LOD2): main/far Vogel coverage + cloud cast only.
 * Near PCSS never hits past the ±32 m square, so skip those taps.
 */
export function createFarOnlySunShadowNode(sun: DirectionalLight): ReceiverSunShadowNode {
  const far = createSunShadowNode(sun);
  const cloudLight = getCloudCastShadowLight();
  const cloud = cloudLight ? createCloudCastShadowNode() : null;
  if (!cloud) {
    return vec4(float((far as any).r), float(0), float(0), float(1));
  }
  const visibility = min(float((far as any).r), float((cloud as any).r));
  return vec4(visibility, float(0), float(0), float(1));
}
