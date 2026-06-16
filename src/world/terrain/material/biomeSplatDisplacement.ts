// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/material/biomeSplatDisplacement.ts — vertex displacement node for biome splat material
import {
  Fn,
  float,
  mix,
  normalLocal,
  positionLocal,
  step,
  texture,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { TERRAIN_ATLAS_BIOME_INDEX } from '../atlas/atlasConstants';
import type { TerrainTextureSet } from '../loaders/loadTerrainTextures';
import { macroSurfaceWorldXZ, sampleTiledDispAtlasVert, terrainMapUv } from '../tsl/biomeAtlasUv';
import {
  computeSnowWeight,
  createBiomeHeightWeights,
  resolvePaintedHwUsed,
} from '../tsl/biomeSplatWeights';
import { createMacroHeightTsl } from '../tsl/terrainMacroHeightTsl';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';

export interface BiomeSplatDisplacementInputs {
  uniforms: TerrainSplatUniforms;
  textures: TerrainTextureSet;
  /** When false, skip positionNode (no vertex displacement shader path). */
  vertexDisplacement?: boolean;
}

export interface BiomeSplatDisplacementOutputs {
  /** Always set — captures macro surface XZ before detail displacement for texture UVs. */
  positionNode: unknown;
  vSurfaceWorldXZ: ReturnType<typeof varying>;
  vPathW: ReturnType<typeof varying>;
  vMeadowW: ReturnType<typeof varying>;
  vHeightNorm: ReturnType<typeof varying>;
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>;
}

export function buildBiomeSplatDisplacement(
  inputs: BiomeSplatDisplacementInputs,
): BiomeSplatDisplacementOutputs {
  const { uniforms, textures, vertexDisplacement = true } = inputs;
  const {
    repeat,
    detailDisp,
    uBlendWidth,
    uBiomeMap,
    uPathMap,
    uMeadowMap,
    uUseBiomeMap,
    uWorldSize,
  } = uniforms;
  const { detailDisplacement } = textures;

  const vSurfaceWorldXZ = varying(vec2());
  const vPathW = varying(float());
  const vMeadowW = varying(float());
  const vHeightNorm = varying(float());

  const { sampleHeightNormAtWorldXZ, macroWorldYAtWorldXZ } = createMacroHeightTsl(uniforms);

  const applyMacroSurface = Fn(([worldXZ]) => {
    const heightNorm = sampleHeightNormAtWorldXZ(worldXZ);
    vHeightNorm.assign(heightNorm);
    const macroY = macroWorldYAtWorldXZ(worldXZ);
    return vec3(positionLocal.x, macroY, positionLocal.z);
  });

  /** Macro surface XZ — must match between vertex disp sample and fragment albedo sample. */
  const captureSurfaceWorldXZ = Fn(() => {
    const worldXZ = macroSurfaceWorldXZ();
    vSurfaceWorldXZ.assign(worldXZ);
    return applyMacroSurface(worldXZ);
  });

  const biomeHeightWeights = createBiomeHeightWeights(uniforms);
  const uDetailDispAtlas = texture(detailDisplacement);

  const idxShore = float(TERRAIN_ATLAS_BIOME_INDEX.shore);
  const idxForest = float(TERRAIN_ATLAS_BIOME_INDEX.forest);
  const idxHills = float(TERRAIN_ATLAS_BIOME_INDEX.hills);
  const idxMountain = float(TERRAIN_ATLAS_BIOME_INDEX.mountain);
  const idxPath = float(TERRAIN_ATLAS_BIOME_INDEX.path);
  const idxSnow = float(TERRAIN_ATLAS_BIOME_INDEX.snow);

  const mixBiomeDisplacement = Fn(([worldXZ, hwUsed, pathW, snowW]) => {
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

    const snowDisp = sampleTiledDispAtlasVert(uDetailDispAtlas, worldXZ, repeat.snow, idxSnow).r;
    const snowOff = snowDisp.mul(detailDisp.snow);
    const withSnowOff = mix(landOff, snowOff, snowW);

    const pathDisp = sampleTiledDispAtlasVert(uDetailDispAtlas, worldXZ, repeat.path, idxPath).r;
    const pathOff = step(float(0.5), pathDisp).mul(detailDisp.path);
    return mix(withSnowOff, pathOff, pathW);
  });

  const displacedPosition = Fn(() => {
    const worldXZ = macroSurfaceWorldXZ();
    vSurfaceWorldXZ.assign(worldXZ);
    const mapUv = terrainMapUv(uWorldSize, worldXZ);
    const painted = uBiomeMap.sample(mapUv);
    const heightNorm = sampleHeightNormAtWorldXZ(worldXZ);
    vHeightNorm.assign(heightNorm);
    const hwUsed = resolvePaintedHwUsed(
      biomeHeightWeights,
      heightNorm,
      painted,
      uBlendWidth,
      uUseBiomeMap,
    );
    const snowW = computeSnowWeight(uniforms, heightNorm, hwUsed);

    const pathMask = uPathMap.sample(mapUv).r;
    const pathW = pathMask.mul(uUseBiomeMap);
    vPathW.assign(pathW);

    const meadowMask = uMeadowMap.sample(mapUv).r;
    const meadowW = meadowMask.mul(uUseBiomeMap);
    vMeadowW.assign(meadowW);

    const macroPos = vec3(positionLocal.x, macroWorldYAtWorldXZ(worldXZ), positionLocal.z);
    const dispOffset = mixBiomeDisplacement(worldXZ, hwUsed, pathW, snowW);
    return macroPos.add(normalLocal.mul(dispOffset));
  });

  return {
    positionNode: vertexDisplacement ? displacedPosition() : captureSurfaceWorldXZ(),
    vSurfaceWorldXZ,
    vPathW,
    vMeadowW,
    vHeightNorm,
    biomeHeightWeights,
  };
}
