// src/rendering/sunShadow/pcssShadowNode.ts — ShadowNode + R32F color depth for PCSS
// @ts-nocheck — Three ShadowNode internals are loosely typed

import { texture, vec4 } from 'three/tsl';
import {
  FloatType,
  NearestFilter,
  NodeMaterial,
  QuadMesh,
  RedFormat,
  ShadowNode,
} from 'three/webgpu';

const _quadMesh = /*@__PURE__*/ new QuadMesh();

/**
 * Directional sun shadows with a VSM-style color depth copy.
 *
 * Depth pass still writes the shadow DepthTexture (compareFunction cleared so it can be
 * sampled). A fullscreen pass copies raw depth into an R32F RT. PcssShadowFilter reads
 * only that color map — never textureSampleCompare — enabling true PCSS blocker search.
 */
export class PcssShadowNode extends ShadowNode {
  static get type() {
    return 'PcssShadowNode';
  }

  constructor(light, shadow = null) {
    super(light, shadow);
    /** @type {import('three/webgpu').RenderTarget | null} */
    this.colorDepthRT = null;
    /** @type {NodeMaterial | null} */
    this.colorDepthMaterial = null;
  }

  setupRenderTarget(shadow, builder) {
    const result = super.setupRenderTarget(shadow, builder);
    const { depthTexture } = result;

    // Allow raw .sample() in the copy pass (VSM precedent).
    depthTexture.compareFunction = null;
    depthTexture.minFilter = NearestFilter;
    depthTexture.magFilter = NearestFilter;
    depthTexture.name = 'PcssShadowDepthTexture';

    this.colorDepthRT = builder.createRenderTarget(shadow.mapSize.width, shadow.mapSize.height, {
      format: RedFormat,
      type: FloatType,
      depthBuffer: false,
    });
    this.colorDepthRT.texture.name = 'PcssColorDepth';
    this.colorDepthRT.texture.minFilter = NearestFilter;
    this.colorDepthRT.texture.magFilter = NearestFilter;

    const depthSample = texture(depthTexture);
    this.colorDepthMaterial = new NodeMaterial();
    this.colorDepthMaterial.fragmentNode = vec4(depthSample.x, 0, 0, 1);
    this.colorDepthMaterial.name = 'PcssDepthCopy';

    return result;
  }

  /**
   * Receive filter must sample the color RT, not the DepthTexture.
   * Parent setupShadow still passes the depth attachment — swap it here.
   */
  setupShadowFilter(builder, inputs) {
    const depthTexture = this.colorDepthRT?.texture ?? inputs.depthTexture;
    return super.setupShadowFilter(builder, { ...inputs, depthTexture });
  }

  updateShadow(frame) {
    super.updateShadow(frame);
    this.copyDepthToColor(frame.renderer);
  }

  copyDepthToColor(renderer) {
    if (!this.colorDepthRT || !this.colorDepthMaterial || !this.shadowMap) return;

    const { shadow } = this;
    this.colorDepthRT.setSize(shadow.mapSize.width, shadow.mapSize.height);

    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.colorDepthRT);
    _quadMesh.material = this.colorDepthMaterial;
    _quadMesh.render(renderer);
    renderer.setRenderTarget(prevTarget);
  }

  dispose() {
    this.disposeColorDepth();
    super.dispose();
  }

  /** @private */
  _reset() {
    this.disposeColorDepth();
    super._reset();
  }

  disposeColorDepth() {
    if (this.colorDepthRT) {
      this.colorDepthRT.dispose();
      this.colorDepthRT = null;
    }
    if (this.colorDepthMaterial) {
      this.colorDepthMaterial.dispose();
      this.colorDepthMaterial = null;
    }
  }
}
