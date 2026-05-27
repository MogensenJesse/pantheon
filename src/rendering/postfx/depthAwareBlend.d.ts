import type { Camera } from 'three';

export interface DepthAwareBlendOptions {
  blendColor?: unknown;
  edgeRadius?: unknown;
  edgeStrength?: unknown;
  /** (uvNode) => float mask factor — not a texture; evaluated at depthAwareBlend's UV. */
  maskFn?: (uvNode: unknown) => unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare const depthAwareBlend: (...args: any[]) => any;
