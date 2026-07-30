// src/rendering/sunShadow/createReceiverSunShadowNode.ts — near cascade (+ optional cloud min)
import type { DirectionalLight } from 'three';
import { float, min, vec4 } from 'three/tsl';
import { createCloudCastShadowNode, getCloudCastShadowLight } from './cloudCastShadow';
import { createSunShadowNode, type SunShadowNode } from './createSunShadowNode';
import { createNearCascadeShadowNode, getNearCascadeShadowLight } from './nearCascadeShadow';

export type ReceiverSunShadowNode = SunShadowNode | ReturnType<typeof vec4>;

/**
 * Ground receivers (terrain, grass, props, water).
 *
 * When the near cascade is enabled, receivers sample **near only** (+ soft cloud-cast).
 * Far/main is the map the DEV "Far map resolution" slider resizes — it was the glitchy
 * overlapping overlay under `min(far, near)`. Distant umbras outside the near ±halfExtent
 * footprint are deferred until cascade blend is fixed; close playable shadows stay on near.
 *
 * When near is off, receivers use the main/far sun map as before.
 * Cloud mesh receive keeps {@link createSunShadowNode} alone.
 */
export function createReceiverSunShadowNode(sun: DirectionalLight): ReceiverSunShadowNode {
  const nearLight = getNearCascadeShadowLight();
  const cloudLight = getCloudCastShadowLight();
  const near = nearLight ? createNearCascadeShadowNode() : null;
  const cloud = cloudLight ? createCloudCastShadowNode() : null;
  const base = near ?? createSunShadowNode(sun);

  if (!cloud) return base;

  const visibility = min(float((base as any).r), float((cloud as any).r));
  return vec4(visibility, float(0), float(0), float(1));
}
