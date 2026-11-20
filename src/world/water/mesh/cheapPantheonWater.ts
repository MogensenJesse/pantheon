// src/world/water/mesh/cheapPantheonWater.ts — normal-map water without planar reflector (performance tier)
import type { BufferGeometry } from 'three';
import { Mesh } from 'three';
import { dot, Fn, max, vec3 } from 'three/tsl';
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

export type CheapPantheonWaterOptions = WaterMeshSharedOptions;

/** Non-reflective water fallback — same uniform API surface as ReflectivePantheonWaterMesh for syncPantheonWater. */
export class CheapPantheonWaterMesh extends Mesh implements WaterMeshUniformHost {
  readonly isWaterMesh = true;
  waterReflector = null;
  reflectorTarget = null;

  waterNormals!: WaterMeshUniformHost['waterNormals'];
  alpha!: WaterMeshUniformHost['alpha'];
  size!: WaterMeshUniformHost['size'];
  sunColor!: WaterMeshUniformHost['sunColor'];
  sunDirection!: WaterMeshUniformHost['sunDirection'];
  waterColor!: WaterMeshUniformHost['waterColor'];
  distortionScale!: WaterMeshUniformHost['distortionScale'];
  shoreUniforms: WaterMeshUniformHost['shoreUniforms'] = null;

  constructor(geometry: BufferGeometry, options: CheapPantheonWaterOptions) {
    const material = new PantheonWaterNodeMaterial();
    super(geometry, material);

    initWaterMeshUniforms(this, options);
    const graph = buildWaterMeshGraph(this, material, options, {
      normalSampleCount: 2,
      specularStrength: 1.5,
      specularPower: 48,
      diffuseStrength: 0.4,
      includeFresnel: true,
      shadowReceiveDistortion: false,
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
      fresnel,
    } = graph;

    material.colorNode = underSurfaceColor(
      graph,
      Fn(() => {
        if (shore) applyWaterDryLandDiscardTsl(worldXZ, shore, shoreDistM);
        // Open sea without shore depth (no height map): the plain water colour
        const waterColor = shore
          ? waterDepthScatterTintTsl(this.waterColor, shore, shoreDepth)
          : this.waterColor;
        const scatter = max(0.0, dot(surfaceNormal, eyeDirection)).mul(waterColor);
        const baseColor = waterColor
          .mul(0.65)
          .add(this.sunColor.mul(diffuseLight).mul(0.25))
          .add(scatter.mul(0.35))
          .add(specularLight.mul(fresnel))
          .add(vec3(0.02, 0.04, 0.06).mul(fresnel));
        const shaded = applyShadow(baseColor);
        if (!shore) return shaded;

        const refracted = applyWaterRefractionTsl(
          shaded,
          waterRefractionScreenOffsetTsl(surfaceNormal.xz, distance, this.distortionScale, shore),
          refractMask,
          waterColor,
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
