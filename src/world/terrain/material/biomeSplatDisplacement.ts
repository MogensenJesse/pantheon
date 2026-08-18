// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/terrain/material/biomeSplatDisplacement.ts — vertex displacement node for biome splat material
import { Fn, float, If, positionLocal, varying, vec2, vec3 } from 'three/tsl';
import type { TerrainTextureSet } from '../loaders/loadTerrainTextures';
import { macroSurfaceWorldXZ, terrainMapUv } from '../tsl/biomeAtlasUv';
import {
  computeSnowWeight,
  createBiomeHeightWeights,
  resolvePaintedHwUsed,
} from '../tsl/biomeSplatWeights';
import type { TerrainClipmapTsl } from '../tsl/terrainClipmapOpacityTsl';
import { createMacroHeightTsl } from '../tsl/terrainMacroHeightTsl';
import { createTerrainSurfaceHeightTsl } from '../tsl/terrainSurfaceHeightTsl';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';

type TslNode = any;

export interface BiomeSplatDisplacementInputs {
  uniforms: TerrainSplatUniforms;
  textures?: TerrainTextureSet | null;
  /** When false, skip GPU height displace (CPU-baked mesh already has macro Y). */
  vertexDisplacement?: boolean;
  /** Radial detail-disp fade + skip disp-atlas samples outside detailRadiusM (play mode). */
  clipmapTsl?: TerrainClipmapTsl;
}

export interface BiomeSplatDisplacementOutputs {
  /** Always set — captures macro surface XZ before detail displacement for texture UVs. */
  positionNode: TslNode;
  vSurfaceWorldXZ: TslNode;
  /** Vertex-interpolated macro surface normal — unused by faceted shading. */
  vMacroNormal: TslNode;
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>;
}

export function buildBiomeSplatDisplacement(
  inputs: BiomeSplatDisplacementInputs,
): BiomeSplatDisplacementOutputs {
  const { uniforms: splatUniforms, textures, vertexDisplacement = false, clipmapTsl } = inputs;
  const uniforms = splatUniforms as any;
  const { uBiomeMap, uPathMap, uUseBiomeMap, uWorldSize, uBlendWidth, uDetailRadiusM } = uniforms;

  // @ts-expect-error TSL varying node union exceeds TS representable complexity
  const vSurfaceWorldXZ: TslNode = varying(vec2());
  const vMacroNormal: TslNode = varying(vec3());

  const { macroNormalAtWorldXZ } = createMacroHeightTsl(uniforms);
  const biomeHeightWeights = createBiomeHeightWeights(uniforms);

  /** CPU mesh already has macro Y in positionLocal — shader must not add it again. */
  const cpuBakedMacroPosition = Fn(() => {
    const worldXZ = macroSurfaceWorldXZ();
    vSurfaceWorldXZ.assign(worldXZ);
    vMacroNormal.assign(macroNormalAtWorldXZ(worldXZ));
    return positionLocal;
  });

  const detailDispAtlas = textures?.detailDisplacement;
  if (!vertexDisplacement || !detailDispAtlas) {
    return {
      positionNode: cpuBakedMacroPosition(),
      vSurfaceWorldXZ,
      vMacroNormal,
      biomeHeightWeights,
    };
  }

  const { mixBiomeDisplacement, macroWorldYAtWorldXZ, sampleHeightNormAtWorldXZ } =
    createTerrainSurfaceHeightTsl({
      uniforms: splatUniforms,
      detailDispAtlas,
      clipmapDetailFade: clipmapTsl !== undefined,
    });

  const buildDisplacedPosition = (clipmap: TerrainClipmapTsl | undefined) =>
    Fn(() => {
      const worldXZ = macroSurfaceWorldXZ();
      const worldNormal = macroNormalAtWorldXZ(worldXZ);
      vSurfaceWorldXZ.assign(worldXZ);
      vMacroNormal.assign(worldNormal);
      const mapUv = terrainMapUv(uWorldSize, worldXZ);
      const painted = uBiomeMap.sample(mapUv);
      const heightNorm = sampleHeightNormAtWorldXZ(worldXZ);
      const hwUsed = resolvePaintedHwUsed(
        biomeHeightWeights,
        heightNorm,
        painted,
        uBlendWidth,
        uUseBiomeMap,
      );
      const snowW = computeSnowWeight(uniforms, heightNorm, hwUsed, worldXZ, worldNormal);
      const pathW = uPathMap.sample(mapUv).r.mul(uUseBiomeMap);
      const macroPos = vec3(
        positionLocal.x,
        macroWorldYAtWorldXZ(worldXZ).add(positionLocal.y),
        positionLocal.z,
      );

      if (clipmap) {
        const scaledDisp = float(0).toVar();
        If(clipmap.detailDiskDistanceM(worldXZ).lessThan(uDetailRadiusM), () => {
          const dispOffset = mixBiomeDisplacement(worldXZ, hwUsed, pathW, snowW);
          scaledDisp.assign(dispOffset.mul(clipmap.detailDispRadialWeight(worldXZ)));
        });
        return macroPos.add(worldNormal.mul(scaledDisp));
      }

      const dispOffset = mixBiomeDisplacement(worldXZ, hwUsed, pathW, snowW);
      return macroPos.add(worldNormal.mul(dispOffset));
    });

  return {
    positionNode: buildDisplacedPosition(clipmapTsl)(),
    vSurfaceWorldXZ,
    vMacroNormal,
    biomeHeightWeights,
  };
}
