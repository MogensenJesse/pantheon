// src/rendering/sunShadow/createReceiverSunShadowNode.ts — sun visibility for ground receivers: near PCSS ↔ far ↔ world, × cloud
import type { DirectionalLight } from 'three';
import { abs, float, max, min, mix, positionWorld, smoothstep, vec4 } from 'three/tsl';
import { createCloudCastShadowNode, getCloudCastShadowLight } from './cloudCastShadow';
import { createFarSunShadowNode } from './farSunShadow';
import { worldCascadeFitsTextureHeavyMaterial } from './fragmentTextureBudget';
import { nearCascadeHandoffUniforms } from './nearCascadeHandoffUniforms';
import { createNearCascadeShadowNode } from './nearCascadeShadow';
import { worldCascadeHandoffUniforms } from './worldCascadeHandoffUniforms';
import { getWorldCascadeShadowLight } from './worldCascadeShadow';
import { sampleWorldShadowVisibility } from './worldShadowVisibility';

export type ReceiverSunShadowNode = ReturnType<typeof vec4>;

/**
 * Edge fade of a cascade square: light-view Chebyshev distance of `positionWorld` from `focus`,
 * smoothstepped over the last `fadeBand` metres before `halfExtent`. Matches the shadow map's own
 * ortho square (a world-XZ circle leaves a lit dead zone).
 */
function cascadeEdgeWeight(focus: any, right: any, up: any, halfExtent: any, fadeBand: any): any {
  const toFocus = positionWorld.sub(focus);
  const chebyshev = max(abs(toFocus.dot(right)), abs(toFocus.dot(up)));
  return smoothstep(max(halfExtent.sub(fadeBand), float(0)), halfExtent, chebyshev);
}

/**
 * Beyond the ±200 m far map, hand off to the whole-map cascade through its resolved visibility
 * texture (never its rotating depth map, see worldShadowVisibility.ts). Inside the far map, also
 * multiply by the cascade's distant-caster channel: the near/far lights sit only `lightDistance`
 * sunward, so casters farther along the ray (mountains at low sun) are clipped out of them.
 * No-op when the world light is absent (editor).
 */
function blendWorldCascade(nearFar: any, textureHeavy = false): any {
  if (textureHeavy && !worldCascadeFitsTextureHeavyMaterial()) return nearFar;
  if (!getWorldCascadeShadowLight()) return nearFar;
  const u = worldCascadeHandoffUniforms;
  const worldWeight = cascadeEdgeWeight(
    u.uFarShadowFocus,
    u.uFarLightRight,
    u.uFarLightUp,
    u.uFarHalfExtentM,
    u.uWorldFadeBandM,
  );
  const world = sampleWorldShadowVisibility(positionWorld);
  const withDistant = import.meta.env.DEV
    ? float(nearFar).mul(mix(float(1), world.y, u.uWorldDistantWeight))
    : float(nearFar).mul(world.y);
  return mix(withDistant, world.x, worldWeight);
}

/** Soft cloud-cast min on top of `cascaded` when that light exists. */
function withCloudShadow(cascaded: any): ReceiverSunShadowNode {
  const cloud = getCloudCastShadowLight() ? createCloudCastShadowNode() : null;
  const visibility = cloud ? min(cascaded, float((cloud as any).r)) : cascaded;
  return vec4(visibility, float(0), float(0), float(1));
}

/**
 * Ground receivers (terrain, grass, props, water): near PCSS inside the near ortho square, far
 * coverage outside, world cascade beyond the far map, then cloud-cast mins.
 *
 * Keep `mix` (not TSL `If`). Branching around PCSS/Vogel samples breaks screen-space derivatives
 * and draws the ±32 m ortho as a dark square around the player.
 * LOD2 grass already skips near via {@link createFarOnlySunShadowNode}.
 */
export function createReceiverSunShadowNode(
  sun: DirectionalLight,
  opts: {
    /** Material already near the 16 fragment-texture default (terrain splat). */
    textureHeavy?: boolean;
  } = {},
): ReceiverSunShadowNode {
  const near = createNearCascadeShadowNode();
  if (!near) {
    throw new Error(
      'createReceiverSunShadowNode: near cascade shadow is required (createNearCascadeShadowLight first)',
    );
  }
  const far = createFarSunShadowNode(sun);

  const u = nearCascadeHandoffUniforms;
  const farWeight = cascadeEdgeWeight(
    u.uNearShadowFocus,
    u.uNearLightRight,
    u.uNearLightUp,
    u.uNearHalfExtentM,
    u.uNearFadeBandM,
  );
  const nearFar = mix(float((near as any).r), float((far as any).r), farWeight);
  return withCloudShadow(blendWorldCascade(nearFar, opts.textureHeavy));
}

/**
 * Far grass (LOD2): far map + world + cloud only. Near PCSS never reaches past the ±32 m square,
 * so skip those taps.
 */
export function createFarOnlySunShadowNode(sun: DirectionalLight): ReceiverSunShadowNode {
  return withCloudShadow(blendWorldCascade(float((createFarSunShadowNode(sun) as any).r)));
}
