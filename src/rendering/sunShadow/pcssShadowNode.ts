// src/rendering/sunShadow/pcssShadowNode.ts — ShadowNode + downsampled R32F blocker map for PCSS
// @ts-nocheck — Three ShadowNode internals are loosely typed

import { float, ivec2, max, min, screenCoordinate, textureLoad, uniform, vec4 } from 'three/tsl';
import {
  FloatType,
  LinearFilter,
  NodeMaterial,
  QuadMesh,
  RedFormat,
  ShadowNode,
} from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';

const _quadMesh = /*@__PURE__*/ new QuadMesh();

/** Samples per axis inside each high-res block when reducing into the blocker map. */
const BLOCKER_REDUCE_SAMPLES = 4;

/**
 * Directional sun shadows with a downsampled R32F blocker map for PCSS (near cascade).
 *
 * Depth pass still writes the shadow DepthTexture with a **compare** function so
 * PcssShadowFilter can use hardware 2×2 PCF filter taps. PCSS blocker search cannot
 * use compare sampling, so a fullscreen `textureLoad` min/max-reduces raw depth into
 * a smaller R32F RT (bilinear-filtered). That keeps the penumbra radius estimate
 * stable under sub-texel UV drift and is ~64× cheaper than a full-res copy.
 *
 * Godrays shaft occlusion samples the **main/far** sun depth map (not this node).
 * Keep compareFunction on this map for the near PCSS filter taps.
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
    /** @type {import('three/tsl').UniformNode<number> | null} */
    this._uBlockScale = null;
    /** Last shadow map width used to size the blocker RT. */
    this._blockerSourceMapSize = 0;
  }

  setupRenderTarget(shadow, builder) {
    const result = super.setupRenderTarget(shadow, builder);
    const { depthTexture } = result;

    // Keep compareFunction from ShadowNode (LessEqual / GreaterEqual) for GodraysNode + filter.
    // Three's setupShadow later sets LinearFilter for PCF maps (hardware 2×2 compare).
    depthTexture.name = 'PcssShadowDepthTexture';

    const blockerSize = resolveBlockerMapSize(shadow.mapSize.width);
    this.colorDepthRT = builder.createRenderTarget(blockerSize, blockerSize, {
      format: RedFormat,
      type: FloatType,
      depthBuffer: false,
    });
    this.colorDepthRT.texture.name = 'PcssBlockerDepth';
    // Bilinear samples vary smoothly when shadow UVs drift by sub-texel amounts.
    this.colorDepthRT.texture.minFilter = LinearFilter;
    this.colorDepthRT.texture.magFilter = LinearFilter;
    this.colorDepthRT.texture.generateMipmaps = false;

    const reversed = builder.renderer.reversedDepthBuffer === true;
    const uBlockScale = uniform(shadow.mapSize.width / blockerSize);
    this._uBlockScale = uBlockScale;
    this._blockerSourceMapSize = shadow.mapSize.width;

    this.colorDepthMaterial = new NodeMaterial();
    this.colorDepthMaterial.fragmentNode = buildBlockerReduceFragment(
      depthTexture,
      uBlockScale,
      reversed,
    );
    this.colorDepthMaterial.name = 'PcssBlockerDepthReduce';

    return result;
  }

  /**
   * Filter taps keep the compare DepthTexture (hardware PCF). Blocker search gets the
   * R32F color RT injected via a wrapped filterFn — PCSS needs raw depth gaps.
   */
  setupShadowFilter(builder, inputs) {
    const blockerDepthTexture = this.colorDepthRT?.texture ?? null;
    const baseFilterFn = inputs.filterFn;
    const filterFn = blockerDepthTexture
      ? (args) => baseFilterFn({ ...args, blockerDepthTexture })
      : baseFilterFn;
    return super.setupShadowFilter(builder, { ...inputs, filterFn });
  }

  updateShadow(frame) {
    super.updateShadow(frame);
    this.copyDepthToColor(frame.renderer);
  }

  copyDepthToColor(renderer) {
    if (!this.colorDepthRT || !this.colorDepthMaterial || !this.shadowMap) return;

    const { shadow } = this;
    const mapW = shadow.mapSize.width;
    const blockerSize = resolveBlockerMapSize(mapW);
    this.colorDepthRT.setSize(blockerSize, blockerSize);
    if (this._uBlockScale) {
      this._uBlockScale.value = mapW / blockerSize;
    }
    this._blockerSourceMapSize = mapW;

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
    this._uBlockScale = null;
    this._blockerSourceMapSize = 0;
  }
}

/** Cap the blocker map at the configured size; never larger than the shadow map. */
function resolveBlockerMapSize(mapSize: number): number {
  const configured = VISUAL.shadows.lighting.pcssBlockerMapSize;
  return Math.max(1, Math.min(mapSize, configured));
}

/**
 * 4×4 min (or max if reversed-depth) reduction of high-res shadow depth into one
 * blocker-map texel. Unrolled — avoids LoopNode variability across WebGPU backends.
 */
function buildBlockerReduceFragment(depthTexture, uBlockScale, reversed: boolean) {
  const outXY = ivec2(screenCoordinate.xy);
  const samples = [];
  const n = BLOCKER_REDUCE_SAMPLES;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const ox = float((i + 0.5) / n);
      const oy = float((j + 0.5) / n);
      const loadX = float(outXY.x).mul(uBlockScale).add(ox.mul(uBlockScale));
      const loadY = float(outXY.y).mul(uBlockScale).add(oy.mul(uBlockScale));
      samples.push(textureLoad(depthTexture, ivec2(loadX, loadY)).r);
    }
  }

  let reduced = samples[0];
  for (let s = 1; s < samples.length; s++) {
    reduced = reversed ? max(reduced, samples[s]) : min(reduced, samples[s]);
  }
  return vec4(reduced, 0, 0, 1);
}
