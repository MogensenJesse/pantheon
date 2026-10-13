// src/rendering/sunShadow/cloudCastShadowLayer.ts — layer for the soft cloud-cast map
/**
 * Cloud mesh casters live on this layer only (not layer 0). The main camera enables it to see
 * them. The sun, near and world shadow cameras carry SHADOW_CAMERA_EXPLICIT_LAYER so Three does
 * not copy the main camera's mask onto them, so clouds only cast into the cloud-cast light,
 * whose shadow camera enables just this layer.
 */
export const CLOUD_SHADOW_LAYER = 3;
