// src/rendering/sunShadow/cloudCastShadowLayer.ts — layer for soft cloud-cast map (hidden from main PCSS sun)
/**
 * Cloud mesh casters live on this layer only (not layer 0).
 * Main camera enables it for visibility; sun.shadow.camera does not — so clouds
 * never write into the near PCSS / main hard sun maps. The dedicated cloud-cast light's
 * shadow camera enables only this layer.
 */
export const CLOUD_SHADOW_LAYER = 3;
