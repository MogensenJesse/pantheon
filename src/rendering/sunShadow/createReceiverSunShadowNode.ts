// src/rendering/sunShadow/createReceiverSunShadowNode.ts — main sun ∩ soft cloud-cast visibility
import type { DirectionalLight } from 'three';
import { float, min, vec4 } from 'three/tsl';
import { createCloudCastShadowNode, getCloudCastShadowLight } from './cloudCastShadow';
import { createSunShadowNode, type SunShadowNode } from './createSunShadowNode';

export type ReceiverSunShadowNode = SunShadowNode | ReturnType<typeof vec4>;

/**
 * Ground receivers (terrain, grass, props, water): min(main sun shadow, soft cloud cast).
 * Cloud mesh receive keeps {@link createSunShadowNode} alone (terrain/prop umbras only).
 * When the cloud-cast light exists but castShadow is off, cloud visibility reads as lit.
 */
export function createReceiverSunShadowNode(sun: DirectionalLight): ReceiverSunShadowNode {
  const main = createSunShadowNode(sun);
  if (!getCloudCastShadowLight()) return main;
  const cloud = createCloudCastShadowNode();
  if (!cloud) return main;
  return vec4(min(float((main as any).r), float((cloud as any).r)), float(0), float(0), float(1));
}
