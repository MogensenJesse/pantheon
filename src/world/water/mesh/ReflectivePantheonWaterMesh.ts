// src/world/water/mesh/ReflectivePantheonWaterMesh.ts — WaterMesh with layer-culled planar reflector
import type { BufferGeometry, Object3D } from 'three';
import { Mesh } from 'three';
import { dot, Fn, float, max, mix, mul, pow, reflector } from 'three/tsl';
import { VISUAL } from '../../../config/visualTuning';
import { patchReflectorVirtualCameraLayers } from '../../../rendering/layers/waterReflectionLayers';
import { PantheonWaterNodeMaterial } from '../material/PantheonWaterNodeMaterial';
import { waterWaveUniforms } from '../material/waterWaveUniforms';
import { applyWaterDryLandDiscardTsl, waterDepthScatterTintTsl } from '../tsl/waterDepthTsl';
import { applyWaterSurfaceFoamColorTsl } from '../tsl/waterFoamTsl';
import { applyWaterRefractionTsl, waterRefractionScreenOffsetTsl } from '../tsl/waterRefractionTsl';
import {
  buildWaterMeshGraph,
  initWaterMeshUniforms,
  underSurfaceColor,
  type WaterMeshSharedOptions,
  type WaterMeshUniformHost,
} from './buildWaterMeshGraph';

export interface ReflectivePantheonWaterMeshOptions extends WaterMeshSharedOptions {
  resolutionScale: number;
}

/**
 * WebGPU reflective water based on three.js WaterMesh, with the reflector virtual
 * camera restricted to {@link WATER_REFLECTION_LAYER} so grass/props are not duplicated.
 */
export class ReflectivePantheonWaterMesh extends Mesh implements WaterMeshUniformHost {
  readonly isWaterMesh = true;

  /** Planar reflector node — adaptive quality writes resolutionScale each frame. */
  waterReflector: { resolutionScale: number } | null = null;
  /** Reflector mirror/clip plane — syncPantheonWater offsets it off the swell each frame. */
  reflectorTarget: Object3D | null = null;
  waterNormals!: WaterMeshUniformHost['waterNormals'];
  alpha!: WaterMeshUniformHost['alpha'];
  size!: WaterMeshUniformHost['size'];
  sunColor!: WaterMeshUniformHost['sunColor'];
  sunDirection!: WaterMeshUniformHost['sunDirection'];
  waterColor!: WaterMeshUniformHost['waterColor'];
  distortionScale!: WaterMeshUniformHost['distortionScale'];
  shoreUniforms: WaterMeshUniformHost['shoreUniforms'] = null;

  constructor(geometry: BufferGeometry, options: ReflectivePantheonWaterMeshOptions) {
    const material = new PantheonWaterNodeMaterial();
    super(geometry, material);

    initWaterMeshUniforms(this, options);
    const graph = buildWaterMeshGraph(this, material, options, {
      normalSampleCount: 4,
      specularStrength: 2.6,
      specularPower: 42,
      diffuseStrength: 0.5,
      includeFresnel: false,
      shadowReceiveDistortion: true,
    });
    const {
      shore,
      shoreDepth,
      shoreDistM,
      foamMask,
      refractMask,
      viewportScene,
      applyShadow,
      worldXZ,
      surfaceNormal,
      eyeDirection,
      specularLight,
      diffuseLight,
      distance,
      distortion,
    } = graph;

    const mirrorSampler = reflector();
    patchReflectorVirtualCameraLayers(mirrorSampler.reflector);
    mirrorSampler.uvNode = mirrorSampler.uvNode!.add(distortion);
    this.waterReflector = mirrorSampler.reflector;
    this.waterReflector.resolutionScale = Math.max(
      options.resolutionScale,
      VISUAL.water.adaptive.minScale,
    );
    this.add(mirrorSampler.target);
    this.reflectorTarget = mirrorSampler.target;

    const minReflectionMix = float(VISUAL.water.minReflectionMix);

    material.colorNode = underSurfaceColor(
      graph,
      Fn(() => {
        if (shore) applyWaterDryLandDiscardTsl(worldXZ, shore, shoreDistM);

        const theta = max(dot(eyeDirection, surfaceNormal), 0.0);
        const rf0 = float(0.02);
        const reflectance = mul(pow(float(1.0).sub(theta), 5.0), float(1.0).sub(rf0)).add(rf0);
        // Open sea without shore depth (no height map): the plain water colour
        const scatterWaterColor = shore
          ? waterDepthScatterTintTsl(this.waterColor, shore, shoreDepth)
          : this.waterColor;
        const scatter = max(0.0, dot(surfaceNormal, eyeDirection)).mul(scatterWaterColor);
        const reflectionMix = max(reflectance, minReflectionMix);
        const procedural = this.sunColor.mul(diffuseLight).mul(0.3).add(scatter);
        const reflected = mirrorSampler.rgb.add(specularLight);
        const albedo = mix(applyShadow(procedural), reflected, reflectionMix);
        if (!shore) return albedo;

        const refractOffset = waterRefractionScreenOffsetTsl(
          surfaceNormal.xz,
          distance,
          this.distortionScale,
          shore,
        );
        const refracted = applyWaterRefractionTsl(
          albedo,
          refractOffset,
          refractMask,
          scatterWaterColor,
          shoreDepth,
          shore,
          viewportScene,
        );
        return foamMask
          ? applyWaterSurfaceFoamColorTsl(refracted, foamMask, waterWaveUniforms)
          : refracted;
      })(),
    ) as any;
  }
}
