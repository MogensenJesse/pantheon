// src/rendering/sunShadow/createReceiverSunShadowNode.ts — near PCSS (+ optional cloud min)
import type { DirectionalLight } from 'three';
import { float, min, vec4 } from 'three/tsl';
import { createCloudCastShadowNode, getCloudCastShadowLight } from './cloudCastShadow';
import type { SunShadowNode } from './createSunShadowNode';
import { createNearCascadeShadowNode } from './nearCascadeShadow';
import type { PcssShadowNode } from './pcssShadowNode';

export type ReceiverSunShadowNode = SunShadowNode | PcssShadowNode | ReturnType<typeof vec4>;

/**
 * Ground receivers (terrain, grass, props, water): near cascade PCSS only.
 * Soft cloud-cast mins on top when that light exists.
 * Main/far sun is not sampled here (godrays + cloud mesh receive only).
 */
export function createReceiverSunShadowNode(_sun: DirectionalLight): ReceiverSunShadowNode {
  const near = createNearCascadeShadowNode();
  if (!near) {
    throw new Error(
      'createReceiverSunShadowNode: near cascade shadow is required (createNearCascadeShadowLight first)',
    );
  }
  const cloudLight = getCloudCastShadowLight();
  const cloud = cloudLight ? createCloudCastShadowNode() : null;
  if (!cloud) return near;

  const visibility = min(float((near as any).r), float((cloud as any).r));
  return vec4(visibility, float(0), float(0), float(1));
}
