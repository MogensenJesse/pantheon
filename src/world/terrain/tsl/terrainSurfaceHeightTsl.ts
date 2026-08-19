// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/terrain/tsl/terrainSurfaceHeightTsl.ts — macro + detail displacement surface Y (shared with grass)
import type { Texture } from 'three';
import { Fn, float, If, mix, smoothstep, step, texture, vec3 } from 'three/tsl';
import { TERRAIN_ATLAS_BIOME_INDEX } from '../atlas/atlasConstants';
import {
  TERRAIN_SLOPE_ROCK_BLEND,
  TERRAIN_SLOPE_ROCK_SOFTNESS,
  TERRAIN_SLOPE_ROCK_START,
} from '../config/terrainBiomeTuning';
import type { TerrainSplatUniforms } from '../material/biomeSplatUniforms';
import { sampleTiledDispAtlasVert, terrainMapUv } from './biomeAtlasUv';
import {
  computeSnowWeight,
  createBiomeHeightWeights,
  resolvePaintedHwUsed,
} from './biomeSplatWeights';
import { createTerrainClipmapTsl } from './terrainClipmapOpacityTsl';
import { createMacroHeightTsl } from './terrainMacroHeightTsl';

export interface TerrainSurfaceHeightInputs {
  uniforms: TerrainSplatUniforms;
  detailDispAtlas: Texture;
  /** Play clipmap radial fade — match terrain detail mesh. */
  clipmapDetailFade?: boolean;
}

export function createTerrainSurfaceHeightTsl(inputs: TerrainSurfaceHeightInputs) {
  const { uniforms, detailDispAtlas, clipmapDetailFade = false } = inputs;
  const {
    repeat,
    detailDisp,
    uBlendWidth,
    uBiomeMap,
    uPathMap,
    uUseBiomeMap,
    uWorldSize,
    uDetailRadiusM,
  } = uniforms as any;

  const uDetailDispAtlas = texture(detailDispAtlas);
  const clipmapTsl = clipmapDetailFade ? createTerrainClipmapTsl(uniforms) : null;
  const biomeHeightWeights = createBiomeHeightWeights(uniforms);
  const { sampleHeightNormAtWorldXZ, macroWorldYAtWorldXZ, macroNormalAtWorldXZ } =
    createMacroHeightTsl(uniforms);

  const idxShore = float(TERRAIN_ATLAS_BIOME_INDEX.shore);
  const idxForest = float(TERRAIN_ATLAS_BIOME_INDEX.forest);
  const idxHills = float(TERRAIN_ATLAS_BIOME_INDEX.hills);
  const idxMountain = float(TERRAIN_ATLAS_BIOME_INDEX.mountain);
  const idxPath = float(TERRAIN_ATLAS_BIOME_INDEX.path);
  const idxSnow = float(TERRAIN_ATLAS_BIOME_INDEX.snow);
  const idxRock = float(TERRAIN_ATLAS_BIOME_INDEX.rock);
  const uSlopeRockStart = float(TERRAIN_SLOPE_ROCK_START);
  const uSlopeRockSoftness = float(TERRAIN_SLOPE_ROCK_SOFTNESS);
  const uSlopeRockBlend = float(TERRAIN_SLOPE_ROCK_BLEND);

  const mixBiomeDisplacement = Fn(([worldXZ, hwUsed, pathW, snowW, worldNormal]) => {
    const shoreDisp = sampleTiledDispAtlasVert(uDetailDispAtlas, worldXZ, repeat.shore, idxShore).r;
    const forestDisp = sampleTiledDispAtlasVert(
      uDetailDispAtlas,
      worldXZ,
      repeat.forest,
      idxForest,
    ).r;
    const hillsDisp = sampleTiledDispAtlasVert(uDetailDispAtlas, worldXZ, repeat.hills, idxHills).r;
    const mountainDisp = sampleTiledDispAtlasVert(
      uDetailDispAtlas,
      worldXZ,
      repeat.mountain,
      idxMountain,
    ).r;
    const landOff = shoreDisp
      .mul(detailDisp.shore)
      .mul(hwUsed.x)
      .add(forestDisp.mul(detailDisp.forest).mul(hwUsed.y))
      .add(hillsDisp.mul(detailDisp.hills).mul(hwUsed.z))
      .add(mountainDisp.mul(detailDisp.mountain).mul(hwUsed.w));

    const slopeRockW = float(1)
      .sub(smoothstep(uSlopeRockStart.sub(uSlopeRockSoftness), uSlopeRockStart, worldNormal.y))
      .mul(uSlopeRockBlend);
    const rockDisp = sampleTiledDispAtlasVert(uDetailDispAtlas, worldXZ, repeat.rock, idxRock).r;
    const withRockOff = mix(landOff, rockDisp.mul(detailDisp.rock), slopeRockW);

    const snowDisp = sampleTiledDispAtlasVert(uDetailDispAtlas, worldXZ, repeat.snow, idxSnow).r;
    const snowOff = snowDisp.mul(detailDisp.snow);
    const withSnowOff = mix(withRockOff, snowOff, snowW);

    const pathDisp = sampleTiledDispAtlasVert(uDetailDispAtlas, worldXZ, repeat.path, idxPath).r;
    const pathOff = step(float(0.5), pathDisp).mul(detailDisp.path);
    return mix(withSnowOff, pathOff, pathW);
  });

  const sampleTerrainSurfacePosition = Fn(([worldXZ]) => {
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
    const worldNormal = macroNormalAtWorldXZ(worldXZ);
    const snowW = computeSnowWeight(uniforms, heightNorm, hwUsed, worldXZ, worldNormal);
    const pathW = uPathMap.sample(mapUv).r.mul(uUseBiomeMap);
    const macroY = macroWorldYAtWorldXZ(worldXZ);
    const macroPos = vec3(worldXZ.x, macroY, worldXZ.y);

    if (clipmapTsl) {
      // mixBiomeDisplacement must be *inside* the If callback — calling it outside still
      // emits all disp-atlas samples in WGSL even when scaledDisp stays 0.
      const scaledDisp = float(0).toVar();
      If(clipmapTsl.detailDiskDistanceM(worldXZ).lessThan(uDetailRadiusM), () => {
        const dispOffset = mixBiomeDisplacement(worldXZ, hwUsed, pathW, snowW, worldNormal);
        scaledDisp.assign(dispOffset.mul(clipmapTsl.detailDispRadialWeight(worldXZ)));
      });
      return macroPos.add(worldNormal.mul(scaledDisp));
    }

    const dispOffset = mixBiomeDisplacement(worldXZ, hwUsed, pathW, snowW, worldNormal);
    return macroPos.add(worldNormal.mul(dispOffset));
  });

  const sampleTerrainSurfaceY = Fn(([worldXZ]) => sampleTerrainSurfacePosition(worldXZ).y);

  return {
    sampleTerrainSurfaceY,
    sampleTerrainSurfacePosition,
    sampleHeightNormAtWorldXZ,
    mixBiomeDisplacement,
    macroNormalAtWorldXZ,
    macroWorldYAtWorldXZ,
  };
}
