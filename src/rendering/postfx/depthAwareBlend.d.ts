// src/rendering/postfx/depthAwareBlend.d.ts
//
// Type stub for the vendored depthAwareBlend helper. Until upstream three.js
// publishes typings for `examples/jsm/tsl/display/depthAwareBlend.js`, we
// treat its inputs/outputs as opaque TSL node objects. Centralising the
// `any` here keeps call sites in PostFX.ts free of scattered suppressions.
import type { Camera } from 'three';

// `any` is intentional: boundary type for an opaque TSL node stub (noExplicitAny off in biome.json).
export type TslNode = any;

export interface DepthAwareBlendOptions {
  blendColor?: TslNode;
  edgeRadius?: TslNode;
  edgeStrength?: TslNode;
  /** (uvNode) => float mask factor — not a texture; evaluated at depthAwareBlend's UV. */
  maskFn?: (uvNode: TslNode) => TslNode;
}

export declare const depthAwareBlend: (
  baseNode: TslNode,
  blendNode: TslNode,
  depthNode: TslNode,
  camera: Camera,
  options?: DepthAwareBlendOptions,
) => TslNode;

export interface DepthAwareColorBlendOptions {
  edgeRadius?: TslNode;
  edgeStrength?: TslNode;
  weight?: TslNode;
  /** 0 = mix, 1 = additive overlay. */
  compositeMode?: TslNode;
  maskFn?: (uvNode: TslNode) => TslNode;
}

export declare const depthAwareColorBlend: (
  baseNode: TslNode,
  overlayNode: TslNode,
  depthNode: TslNode,
  camera: Camera,
  options?: DepthAwareColorBlendOptions,
) => TslNode;
