// src/rendering/sunShadow/depthOnlyShadowNode.ts — ShadowNode whose map is a depth-only render target
// @ts-nocheck — Three ShadowNode internals are loosely typed

import { DepthTexture, GreaterEqualCompare, LessEqualCompare, ShadowNode } from 'three/webgpu';

/**
 * three's `ShadowNode.setupRenderTarget` allocates an RGBA8 colour attachment next to the depth
 * texture. That colour is only sampled when `renderer.shadowMap.transmitted` is on (never here), and
 * every filter in this folder reads the depth texture, so the attachment is dead weight: 256 MiB per
 * 8192² map plus a clear and a write on every bake. r187 depth-only targets (`count: 0`) drop it.
 * Otherwise identical to three's setup (same depth texture and compare function).
 */
export class DepthOnlyShadowNode extends ShadowNode {
  static get type() {
    return 'DepthOnlyShadowNode';
  }

  constructor(light, shadow = null) {
    super(light, shadow);
  }

  setupRenderTarget(shadow, builder) {
    const { width, height } = shadow.mapSize;

    const depthTexture = new DepthTexture(width, height);
    depthTexture.name = 'ShadowDepthTexture';
    depthTexture.compareFunction = builder.renderer.reversedDepthBuffer
      ? GreaterEqualCompare
      : LessEqualCompare;

    const shadowMap = builder.createRenderTarget(width, height, { count: 0 });
    shadowMap.depthTexture = depthTexture;

    return { shadowMap, depthTexture };
  }
}
