// src/world/water/mesh/cheapPantheonWater.ts — normal-map water without planar reflector (performance tier)
import type { BufferGeometry } from 'three';
import { Mesh } from 'three';
import { dot, Fn, max, vec3 } from 'three/tsl';
import {
  applySunShadowVisibility,
  buildWaterMeshGraph,
  initWaterMeshUniforms,
  type WaterMeshSharedOptions,
  type WaterMeshUniformHost,
} from './buildWaterMeshGraph';
import { PantheonWaterNodeMaterial } from '../material/PantheonWaterNodeMaterial';
import { applyWaterDryLandDiscardTsl, waterDepthScatterTintTsl } from '../tsl/waterDepthTsl';
import { applyWaterRefractionTsl, waterRefractionScreenOffsetTsl } from '../tsl/waterRefractionTsl';

export type CheapPantheonWaterOptions = WaterMeshSharedOptions;

/** Non-reflective water fallback — same uniform API surface as ReflectivePantheonWaterMesh for syncPantheonWater. */
export class CheapPantheonWaterMesh extends Mesh implements WaterMeshUniformHost {
  readonly isWaterMesh = true;
  resolutionScale: number = 0;
  waterReflector = null;

  waterNormals!: WaterMeshUniformHost['waterNormals'];
  alpha!: WaterMeshUniformHost['alpha'];
  size!: WaterMeshUniformHost['size'];
  sunColor!: WaterMeshUniformHost['sunColor'];
  sunDirection!: WaterMeshUniformHost['sunDirection'];
  waterColor!: WaterMeshUniformHost['waterColor'];
  distortionScale!: WaterMeshUniformHost['distortionScale'];
  uSunIntensity!: WaterMeshUniformHost['uSunIntensity'];
  uShadowFloor!: WaterMeshUniformHost['uShadowFloor'];
  shoreUniforms: WaterMeshUniformHost['shoreUniforms'] = null;

  constructor(geometry: BufferGeometry, options: CheapPantheonWaterOptions) {
    const material = new PantheonWaterNodeMaterial();
    super(geometry, material);

    initWaterMeshUniforms(this, options);
    const graph = buildWaterMeshGraph(this, material, options, {
      normalSampleCount: 2,
      specularStrength: 1.5,
      diffuseStrength: 0.4,
      includeFresnel: true,
      shadowReceiveDistortion: false,
    });
    const {
      shore,
      shoreDepth,
      refractMask,
      viewportScene,
      sunShadow,
      uShadowFloor,
      uSunIntensity,
      worldXZ,
      surfaceNormal,
      eyeDirection,
      specularLight,
      diffuseLight,
      distance,
      fresnel,
    } = graph;

    if (shore) {
      material.colorNode = Fn(() => {
        applyWaterDryLandDiscardTsl(worldXZ, shore);
        const shoreWaterColor = waterDepthScatterTintTsl(
          this.waterColor,
          worldXZ,
          shore,
          shoreDepth,
        );
        const scatter = max(0.0, dot(surfaceNormal, eyeDirection)).mul(shoreWaterColor);
        const baseColor = shoreWaterColor
          .mul(0.65)
          .add(this.sunColor.mul(diffuseLight).mul(0.25))
          .add(scatter.mul(0.35))
          .add(specularLight.mul(fresnel))
          .add(vec3(0.02, 0.04, 0.06).mul(fresnel));
        return applyWaterRefractionTsl(
          applySunShadowVisibility(baseColor, sunShadow, uShadowFloor, uSunIntensity),
          waterRefractionScreenOffsetTsl(surfaceNormal.xz, distance, this.distortionScale, shore),
          refractMask,
          shoreWaterColor,
          shoreDepth,
          shore,
          viewportScene,
        );
      })() as any;
    } else {
      const scatter = max(0.0, dot(surfaceNormal, eyeDirection)).mul(this.waterColor);
      const baseColor = this.waterColor
        .mul(0.65)
        .add(this.sunColor.mul(diffuseLight).mul(0.25))
        .add(scatter.mul(0.35))
        .add(specularLight.mul(fresnel))
        .add(vec3(0.02, 0.04, 0.06).mul(fresnel));
      material.colorNode = applySunShadowVisibility(
        baseColor,
        sunShadow,
        uShadowFloor,
        uSunIntensity,
      ) as any;
    }
  }
}
