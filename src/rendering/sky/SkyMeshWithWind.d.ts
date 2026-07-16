// src/rendering/sky/SkyMeshWithWind.d.ts — types for Pantheon SkyMesh wind fork
import type { BoxGeometry, Mesh, Vector2, Vector3 } from 'three';
import type { UniformNode } from 'three/tsl';
import type { NodeMaterial } from 'three/webgpu';

export class SkyMesh extends Mesh<BoxGeometry, NodeMaterial> {
  turbidity: UniformNode<number>;
  rayleigh: UniformNode<number>;
  mieCoefficient: UniformNode<number>;
  mieDirectionalG: UniformNode<number>;
  sunPosition: UniformNode<Vector3>;
  upUniform: UniformNode<Vector3>;
  cloudScale: UniformNode<number>;
  cloudSpeed: UniformNode<number>;
  /** UV XZ wind — (sin θ, cos θ) matching mesh cloud windDirectionDeg. */
  cloudWindDir: UniformNode<Vector2>;
  cloudCoverage: UniformNode<number>;
  cloudDensity: UniformNode<number>;
  cloudElevation: UniformNode<number>;
  showSunDisc: UniformNode<number>;
  readonly isSkyMesh: true;
}
