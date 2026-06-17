// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/material/biomeSplatDisplacement.ts — vertex displacement node for biome splat material
import {
  Fn,
  float,
  mix,
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
import type { TerrainClipmapTsl } from '../tsl/terrainClipmapOpacityTsl';
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
  /** When false with vertexDisplacement, macro height only — no detail disp atlas samples. */
  sampleDetailDisplacement?: boolean;
  /** Clipmap radial fade on detail disp — pass from a single `createTerrainClipmapTsl` in the composer. */
  clipmapTsl?: TerrainClipmapTsl;
}

export interface BiomeSplatDisplacementOutputs {
  /** Always set — captures macro surface XZ before detail displacement for texture UVs. */
  positionNode: unknown;
  vSurfaceWorldXZ: ReturnType<typeof varying>;
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>;
}

export function buildBiomeSplatDisplacement(
  inputs: BiomeSplatDisplacementInputs,
): BiomeSplatDisplacementOutputs {
  const {
    uniforms,
    textures,
    vertexDisplacement = true,
    sampleDetailDisplacement = true,
    clipmapTsl,
  } = inputs;
  const { repeat, detailDisp, uBlendWidth, uBiomeMap, uPathMap, uUseBiomeMap, uWorldSize } =
    uniforms;
  const { detailDisplacement } = textures;

  const vSurfaceWorldXZ = varying(vec2());

  const { sampleHeightNormAtWorldXZ, macroWorldYAtWorldXZ, macroNormalAtWorldXZ } =
    createMacroHeightTsl(uniforms);

  const applyMacroSurface = Fn(([worldXZ]) => {
    const macroY = macroWorldYAtWorldXZ(worldXZ);
    return vec3(positionLocal.x, macroY.add(positionLocal.y), positionLocal.z);
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
    const hwUsed = resolvePaintedHwUsed(
      biomeHeightWeights,
      heightNorm,
      painted,
      uBlendWidth,
      uUseBiomeMap,
    );
    const snowW = computeSnowWeight(uniforms, heightNorm, hwUsed);

    const pathW = uPathMap.sample(mapUv).r.mul(uUseBiomeMap);
    const macroPos = vec3(
      positionLocal.x,
      macroWorldYAtWorldXZ(worldXZ).add(positionLocal.y),
      positionLocal.z,
    );
    const dispOffset = mixBiomeDisplacement(worldXZ, hwUsed, pathW, snowW);
    const scaledDisp = clipmapTsl
      ? dispOffset.mul(clipmapTsl.detailDispRadialWeight(worldXZ))
      : dispOffset;
    return macroPos.add(macroNormalAtWorldXZ(worldXZ).mul(scaledDisp));
  });

  const useDetailDisplacement = vertexDisplacement && sampleDetailDisplacement;

  return {
    positionNode: vertexDisplacement
      ? useDetailDisplacement
        ? displacedPosition()
        : captureSurfaceWorldXZ()
      : captureSurfaceWorldXZ(),
    vSurfaceWorldXZ,
    biomeHeightWeights,
  };
}
