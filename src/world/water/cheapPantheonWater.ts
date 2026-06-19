// @ts-nocheck — TSL Fn() parameter typing is looser in three.js than in strict TS
// src/world/water/cheapPantheonWater.ts — normal-map water without planar reflector (performance tier)
import type { BufferGeometry, Texture } from 'three';
import { Color, Mesh, Vector3 } from 'three';
import {
  Fn,
  add,
  cameraPosition,
  div,
  dot,
  float,
  max,
  normalize,
  positionWorld,
  pow,
  reflect,
  texture,
  time,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';
import { applyWaterEdgeFade, createWaterEdgeFadeUniforms } from './waterEdgeFadeTsl';

export interface CheapPantheonWaterOptions {
  waterNormals: Texture;
  waterRadius: number;
  edgeFadeStartRatio?: number;
  edgeFadeEndRatio?: number;
  size?: number;
  alpha?: number;
  sunColor?: Color;
  sunDirection?: Vector3;
  waterColor?: Color;
  distortionScale?: number;
}

/** Non-reflective water fallback — same uniform API surface as PantheonWaterMesh for syncPantheonWater. */
export class CheapPantheonWaterMesh extends Mesh {
  readonly isWaterMesh = true;
  resolutionScale: number = 0;

  waterNormals;
  alpha;
  size;
  sunColor;
  sunDirection;
  waterColor;
  distortionScale;

  constructor(geometry: BufferGeometry, options: CheapPantheonWaterOptions) {
    const material = new NodeMaterial();
    super(geometry, material);

    this.waterNormals = texture(options.waterNormals);
    this.alpha = uniform(options.alpha ?? 1);
    this.size = uniform(options.size ?? 1);
    this.sunColor = uniform(options.sunColor?.clone() ?? new Color(0xffffff));
    this.sunDirection = uniform(options.sunDirection?.clone() ?? new Vector3(0.70707, 0.70707, 0));
    this.waterColor = uniform(options.waterColor?.clone() ?? new Color(0x7f7f7f));
    this.distortionScale = uniform(options.distortionScale ?? 20);

    const edgeFade = createWaterEdgeFadeUniforms(
      options.waterRadius,
      options.edgeFadeStartRatio ?? 0.72,
      options.edgeFadeEndRatio ?? 1,
    );

    const getNoise = Fn(([uv]) => {
      const offset = time;
      const uv0 = add(div(uv, 103), vec2(div(offset, 17), div(offset, 29))).toVar();
      const uv1 = div(uv, 107)
        .sub(vec2(div(offset, -19), div(offset, 31)))
        .toVar();
      const sample0 = this.waterNormals.sample(uv0);
      const sample1 = this.waterNormals.sample(uv1);
      const noise = sample0.add(sample1);
      return noise.mul(0.5).sub(1);
    });

    const noise = getNoise(positionWorld.xz.mul(this.size));
    const surfaceNormal = normalize(noise.xzy.mul(1.5, 1.0, 1.5));
    const worldToEye = cameraPosition.sub(positionWorld);
    const eyeDirection = normalize(worldToEye);
    const reflection = normalize(reflect(this.sunDirection.negate(), surfaceNormal));
    const direction = max(0.0, dot(eyeDirection, reflection));
    const specularLight = pow(direction, 100).mul(this.sunColor).mul(1.5);
    const diffuseLight = max(dot(this.sunDirection, surfaceNormal), 0.0).mul(this.sunColor).mul(0.4);
    const fresnel = pow(float(1.0).sub(max(0.0, dot(surfaceNormal, eyeDirection))), 3.0);
    const scatter = max(0.0, dot(surfaceNormal, eyeDirection)).mul(this.waterColor);

    material.transparent = true;
    material.opacityNode = applyWaterEdgeFade(this.alpha, edgeFade);
    material.colorNode = this.waterColor
      .mul(0.65)
      .add(this.sunColor.mul(diffuseLight).mul(0.25))
      .add(scatter.mul(0.35))
      .add(specularLight.mul(fresnel))
      .add(vec3(0.02, 0.04, 0.06).mul(fresnel));
  }
}
