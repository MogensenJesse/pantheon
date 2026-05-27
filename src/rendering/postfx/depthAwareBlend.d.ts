// src/rendering/postfx/depthAwareBlend.d.ts
//
// Type stub for the vendored depthAwareBlend helper. Until upstream three.js
// publishes typings for `examples/jsm/tsl/display/depthAwareBlend.js`, we
// treat its inputs/outputs as opaque TSL node objects. Centralising the
// `any` here keeps call sites in PostFX.ts free of scattered eslint-disable
// pragmas.
import type { Camera } from 'three';

// `any` here is intentional: this is the boundary type for an opaque TSL node
// stub. `no-explicit-any` is project-wide off in eslint.config.js, so this is
// documented but not eslint-disabled.
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
