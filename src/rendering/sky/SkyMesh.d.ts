// src/rendering/sky/SkyMesh.d.ts — uniform surface for the vendored SkyMesh
import { BoxGeometry, Mesh, NodeMaterial, UniformNode, Vector2, Vector3 } from 'three/webgpu';

export class SkyMesh extends Mesh<BoxGeometry, NodeMaterial> {
  turbidity: UniformNode<'float', number>;
  rayleigh: UniformNode<'float', number>;
  mieCoefficient: UniformNode<'float', number>;
  mieDirectionalG: UniformNode<'float', number>;
  sunPosition: UniformNode<'vec3', Vector3>;
  cloudScale: UniformNode<'float', number>;
  /** UV offset (world X, world Z) on the deck wind clock. */
  cloudWind: UniformNode<'vec2', Vector2>;
  /** Billow rate. Not the travel speed. */
  cloudSpeed: UniformNode<'float', number>;
  cloudCoverage: UniformNode<'float', number>;
  cloudDensity: UniformNode<'float', number>;
  cloudElevation: UniformNode<'float', number>;
  showSunDisc: UniformNode<'float', number | boolean>;
  /** @deprecated */
  readonly isSky: true;
  readonly isSkyMesh: true;
  constructor();
}
