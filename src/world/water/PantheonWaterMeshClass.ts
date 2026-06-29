// @ts-nocheck — TSL Fn() parameter typing is looser in three.js than in strict TS
// src/world/water/PantheonWaterMeshClass.ts — WaterMesh with layer-culled planar reflector
import type { BufferGeometry, DirectionalLight, Texture } from 'three';
import { Color, Mesh, Vector3 } from 'three';
import {
  add,
  cameraPosition,
  div,
  dot,
  Fn,
  float,
  length,
  max,
  mix,
  mul,
  normalize,
  positionWorld,
  pow,
  reflect,
  reflector,
  sub,
  texture,
  time,
  uniform,
  vec2,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';
import { applySunShadowVisibility, createSunShadowNode } from '../../rendering/sunShadow';
import {
  waterDepthOpacityTsl,
  waterDepthScatterTintTsl,
  waterShallowTransmitTsl,
} from './tsl/waterDepthTsl';
import {
  applyWaterRefractionTsl,
  waterRefractionOpacityCompensateTsl,
  waterRefractionScreenOffsetTsl,
} from './tsl/waterRefractionTsl';
import { applyWaterEdgeFade, createWaterEdgeFadeUniforms } from './waterEdgeFadeTsl';
import { patchReflectorVirtualCameraLayers } from './waterReflectionLayers';
import { waterShadowUniforms } from './waterShadowUniforms';
import {
  createWaterShoreUniforms,
  type WaterShoreDepthInputs,
  type WaterShoreUniforms,
} from './waterShoreUniforms';

export interface PantheonWaterMeshOptions {
  sun: DirectionalLight;
  waterNormals: Texture;
  waterRadius: number;
  shoreDepth?: WaterShoreDepthInputs;
  edgeFadeStartRatio?: number;
  edgeFadeEndRatio?: number;
  resolutionScale?: number;
  size?: number;
  alpha?: number;
  sunColor?: Color;
  sunDirection?: Vector3;
  waterColor?: Color;
  distortionScale?: number;
}

/**
 * WebGPU reflective water based on three.js WaterMesh, with the reflector virtual
 * camera restricted to {@link WATER_REFLECTION_LAYER} so grass/props are not duplicated.
 */
export class PantheonWaterMesh extends Mesh {
  readonly isWaterMesh = true;

  resolutionScale: number;
  waterNormals;
  alpha;
  size;
  sunColor;
  sunDirection;
  waterColor;
  distortionScale;
  uSunIntensity;
  uShadowFloor;
  shoreUniforms: WaterShoreUniforms | null = null;

  constructor(geometry: BufferGeometry, options: PantheonWaterMeshOptions) {
    const material = new NodeMaterial();
    super(geometry, material);

    this.resolutionScale = options.resolutionScale ?? 0.5;
    this.waterNormals = texture(options.waterNormals);
    this.alpha = uniform(options.alpha ?? 1);
    this.size = uniform(options.size ?? 1);
    this.sunColor = uniform(options.sunColor?.clone() ?? new Color(0xffffff));
    this.sunDirection = uniform(options.sunDirection?.clone() ?? new Vector3(0.70707, 0.70707, 0));
    this.waterColor = uniform(options.waterColor?.clone() ?? new Color(0x7f7f7f));
    this.distortionScale = uniform(options.distortionScale ?? 20);
    this.uSunIntensity = waterShadowUniforms.uSunIntensity;
    this.uShadowFloor = waterShadowUniforms.uShadowFloor;
    const sunShadow = createSunShadowNode(options.sun);
    const { uShadowFloor, uSunIntensity } = waterShadowUniforms;

    const edgeFade = createWaterEdgeFadeUniforms(
      options.waterRadius,
      options.edgeFadeStartRatio ?? 0.72,
      options.edgeFadeEndRatio ?? 1,
    );
    const shore = options.shoreDepth ? createWaterShoreUniforms(options.shoreDepth) : null;
    this.shoreUniforms = shore;

    const getNoise = Fn(([uv]) => {
      const offset = time;
      const uv0 = add(div(uv, 103), vec2(div(offset, 17), div(offset, 29))).toVar();
      const uv1 = div(uv, 107)
        .sub(vec2(div(offset, -19), div(offset, 31)))
        .toVar();
      const uv2 = add(div(uv, vec2(8907, 9803)), vec2(div(offset, 101), div(offset, 97))).toVar();
      const uv3 = sub(div(uv, vec2(1091, 1027)), vec2(div(offset, 109), div(offset, -113))).toVar();
      const sample0 = this.waterNormals.sample(uv0);
      const sample1 = this.waterNormals.sample(uv1);
      const sample2 = this.waterNormals.sample(uv2);
      const sample3 = this.waterNormals.sample(uv3);
      const noise = sample0.add(sample1).add(sample2).add(sample3);
      return noise.mul(0.5).sub(1);
    });

    const noise = getNoise(positionWorld.xz.mul(this.size));
    const surfaceNormal = normalize(noise.xzy.mul(1.5, 1.0, 1.5));
    const worldToEye = cameraPosition.sub(positionWorld);
    const eyeDirection = normalize(worldToEye);
    const reflection = normalize(reflect(this.sunDirection.negate(), surfaceNormal));
    const direction = max(0.0, dot(eyeDirection, reflection));
    const specularLight = pow(direction, 100).mul(this.sunColor).mul(2.0);
    const diffuseLight = max(dot(this.sunDirection, surfaceNormal), 0.0)
      .mul(this.sunColor)
      .mul(0.5);
    const distance = length(worldToEye);
    const distortion = surfaceNormal.xz
      .mul(float(0.001).add(float(1.0).div(distance)))
      .mul(this.distortionScale);

    material.transparent = true;
    const edgeAlpha = applyWaterEdgeFade(this.alpha, edgeFade);
    const sunShadowOpts = { sunShadow, uShadowFloor, uSunIntensity };
    const shallowTransmit = shore ? waterShallowTransmitTsl(positionWorld.xz, shore) : null;
    material.opacityNode = shore
      ? waterRefractionOpacityCompensateTsl(
          waterDepthOpacityTsl(edgeAlpha, positionWorld.xz, shore, sunShadowOpts),
          shallowTransmit,
          shore,
        )
      : edgeAlpha;
    material.receivedShadowPositionNode = positionWorld.add(distortion);

    if (shore) {
      material.colorNode = Fn(() => {
        const mirrorSampler = reflector();
        patchReflectorVirtualCameraLayers(mirrorSampler.reflector);
        mirrorSampler.uvNode = mirrorSampler.uvNode.add(distortion);
        mirrorSampler.reflector.resolutionScale = this.resolutionScale;
        this.add(mirrorSampler.target);

        const theta = max(dot(eyeDirection, surfaceNormal), 0.0);
        const rf0 = float(0.02);
        const reflectance = mul(pow(float(1.0).sub(theta), 5.0), float(1.0).sub(rf0)).add(rf0);
        const scatterWaterColor = waterDepthScatterTintTsl(
          this.waterColor,
          positionWorld.xz,
          shore,
        );
        const scatter = max(0.0, dot(surfaceNormal, eyeDirection)).mul(scatterWaterColor);
        const albedo = mix(
          this.sunColor.mul(diffuseLight).mul(0.3).add(scatter),
          mirrorSampler.rgb.add(specularLight),
          reflectance,
        );
        const shaded = applySunShadowVisibility(albedo, sunShadow, uShadowFloor, uSunIntensity);
        const refractOffset = waterRefractionScreenOffsetTsl(
          surfaceNormal.xz,
          distance,
          this.distortionScale,
          shore,
        );
        return applyWaterRefractionTsl(
          shaded,
          refractOffset,
          shallowTransmit,
          scatterWaterColor,
          shore,
        );
      })();
    } else {
      material.colorNode = Fn(() => {
        const mirrorSampler = reflector();
        patchReflectorVirtualCameraLayers(mirrorSampler.reflector);
        mirrorSampler.uvNode = mirrorSampler.uvNode.add(distortion);
        mirrorSampler.reflector.resolutionScale = this.resolutionScale;
        this.add(mirrorSampler.target);

        const theta = max(dot(eyeDirection, surfaceNormal), 0.0);
        const rf0 = float(0.02);
        const reflectance = mul(pow(float(1.0).sub(theta), 5.0), float(1.0).sub(rf0)).add(rf0);
        const scatter = max(0.0, dot(surfaceNormal, eyeDirection)).mul(this.waterColor);
        const albedo = mix(
          this.sunColor.mul(diffuseLight).mul(0.3).add(scatter),
          mirrorSampler.rgb.add(specularLight),
          reflectance,
        );
        return applySunShadowVisibility(albedo, sunShadow, uShadowFloor, uSunIntensity);
      })();
    }
  }
}
