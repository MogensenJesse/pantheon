// src/types/three-fsr1.d.ts — ambient types until @types/three ships FSR1Node

declare module 'three/addons/tsl/display/FSR1Node.js' {
  import type { Node } from 'three/tsl';

  export default class FSR1Node {
    dispose(): void;
  }

  export function fsr1(node: Node, sharpness?: number | Node, denoise?: boolean | Node): FSR1Node;
}

/** PassNode.setResolutionScale (r181+) — use to type scene pass in createPostFxPipeline. */
interface PassNodeWithResolutionScale {
  setResolutionScale(resolutionScale: number): PassNodeWithResolutionScale;
  getResolutionScale(): number;
}

/** RTTNode.setResolutionScale — low-res bake before FSR / bilinear upscale. */
interface RttNodeWithResolutionScale {
  setResolutionScale(resolutionScale: number): RttNodeWithResolutionScale;
  getResolutionScale(): number;
}
