// src/rendering/sunShadow/createReceiverSunShadowNode.ts — near PCSS ↔ far coverage + cloud
import type { DirectionalLight } from 'three';
import { abs, float, max, min, mix, positionWorld, smoothstep, vec4 } from 'three/tsl';
import { createCloudCastShadowNode, getCloudCastShadowLight } from './cloudCastShadow';
import { createSunShadowNode } from './createSunShadowNode';
import { nearCascadeHandoffUniforms } from './nearCascadeHandoffUniforms';
import { createNearCascadeShadowNode } from './nearCascadeShadow';
import {
  getWorldCascadeShadowLight,
  worldCascadeFitsTextureHeavyMaterial,
  worldCascadeHandoffUniforms,
} from './worldCascadeShadow';
import { sampleWorldShadowVisibility } from './worldShadowVisibility';

export type ReceiverSunShadowNode = ReturnType<typeof vec4>;

/**
 * Beyond the ±200 m far map, hand off to the whole-map cascade (light-view Chebyshev edge of
 * the main sun map, same as near→far). Samples the temporally resolved world-XZ visibility,
 * never the rotating world depth map (see worldShadowVisibility.ts). No-op in the editor.
 */
function blendWorldCascade(nearFar: any, textureHeavy = false): any {
  if (textureHeavy && !worldCascadeFitsTextureHeavyMaterial()) return nearFar;
  if (!getWorldCascadeShadowLight()) return nearFar;
  const {
    uFarShadowFocus,
    uFarLightRight,
    uFarLightUp,
    uFarHalfExtentM,
    uWorldFadeBandM,
    uWorldDistantWeight,
  } = worldCascadeHandoffUniforms;
  const toFar = positionWorld.sub(uFarShadowFocus);
  const farCheb = max(abs(toFar.dot(uFarLightRight)), abs(toFar.dot(uFarLightUp)));
  const farInner = max(uFarHalfExtentM.sub(uWorldFadeBandM), float(0));
  const worldWeight = smoothstep(farInner, uFarHalfExtentM, farCheb);
  const world = sampleWorldShadowVisibility(positionWorld);
  // Near/far maps clip casters beyond their light distance (distant mountains at low sun):
  // add those from the world map's distant-only channel so their shadows reach the player.
  const withDistant = float(nearFar).mul(mix(float(1), world.y, uWorldDistantWeight));
  return mix(withDistant, world.x, worldWeight);
}

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
  const nearFar = mix(float((near as any).r), float((far as any).r), farWeight);
  const cascaded = blendWorldCascade(nearFar, opts.textureHeavy);

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
  const far = blendWorldCascade(float((createSunShadowNode(sun) as any).r));
  const cloudLight = getCloudCastShadowLight();
  const cloud = cloudLight ? createCloudCastShadowNode() : null;
  if (!cloud) {
    return vec4(far, float(0), float(0), float(1));
  }
  const visibility = min(far, float((cloud as any).r));
  return vec4(visibility, float(0), float(0), float(1));
}
