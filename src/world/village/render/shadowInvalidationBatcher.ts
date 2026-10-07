// src/world/village/render/shadowInvalidationBatcher.ts — coalesce static-caster changes into rare shadow-map re-bakes
import {
  invalidateFarSunShadowMap,
  invalidateNearCascadeShadowMap,
} from '../../../rendering/sunShadow';

export interface ShadowInvalidationBatcher {
  markDirty: () => void;
  /** Call once per frame with the frame delta (s). */
  update: (dt: number) => void;
}

/**
 * Shadow maps only re-bake when the sun or follow point moves, so a new or changed building would
 * not cast until then. Flush at most once per `minIntervalS`. The world cascade is left alone: it
 * re-bakes on sun motion, and forcing it would reset its accumulated history.
 */
export function createShadowInvalidationBatcher(minIntervalS: number): ShadowInvalidationBatcher {
  let dirty = false;
  let sinceFlush = Number.POSITIVE_INFINITY;
  return {
    markDirty: () => {
      dirty = true;
    },
    update: (dt) => {
      sinceFlush += dt;
      if (!dirty || sinceFlush < minIntervalS) return;
      invalidateFarSunShadowMap();
      invalidateNearCascadeShadowMap();
      dirty = false;
      sinceFlush = 0;
    },
  };
}
