// src/types/three-smaa.d.ts — ambient types until @types/three ships SMAANode
declare module 'three/addons/tsl/display/SMAANode.js' {
  import type { Node } from 'three/webgpu';

  export default class SMAANode {
    dispose(): void;
    getTextureNode(): Node;
  }

  export function smaa(node: Node): SMAANode;
}
