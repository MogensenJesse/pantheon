// src/rendering/sky/SkyMesh.d.ts — types for Pantheon SkyMesh
import type { BoxGeometry, Mesh, Vector3 } from 'three';
import type { UniformNode } from 'three/tsl';
import type { NodeMaterial } from 'three/webgpu';

export class SkyMesh extends Mesh<BoxGeometry, NodeMaterial> {
  turbidity: UniformNode<number>;
  rayleigh: UniformNode<number>;
  mieCoefficient: UniformNode<number>;
  mieDirectionalG: UniformNode<number>;
  sunPosition: UniformNode<Vector3>;
  upUniform: UniformNode<Vector3>;
  showSunDisc: UniformNode<number>;
  readonly isSkyMesh: true;
}
