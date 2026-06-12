// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/biomeSplatDisplacement.ts — vertex displacement node for biome splat material
import {
  attribute,
  Fn,
  float,
  mix,
  normalLocal,
  positionLocal,
  smoothstep,
  step,
  texture,
  varying,
  vec2,
  vec4,
} from 'three/tsl';
import {
  macroSurfaceWorldXZ,
  sampleTiledDispAtlasVert,
  terrainMapUv,
} from './biomeAtlasUv';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';
import { TERRAIN_ATLAS_BIOME_INDEX } from './terrainMapAtlas';
import type { TerrainTextureSet } from './loadTerrainTextures';

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
  biomeHeightWeights: ReturnType<typeof Fn>;
}

export function buildBiomeSplatDisplacement(
  inputs: BiomeSplatDisplacementInputs,
): BiomeSplatDisplacementOutputs {
  const { uniforms, textures, vertexDisplacement = true } = inputs;
  const {
    repeat,
    detailDisp,
    uWaterMax,
    uShoreMax,
    uForestMax,
    uHillsMax,
    uBlendWidth,
    uSnowHeightStart,
    uSnowHeightEnd,
    uSnowMountainWeight,
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

  /** Macro surface XZ — must match between vertex disp sample and fragment albedo sample. */
  const captureSurfaceWorldXZ = Fn(() => {
    vSurfaceWorldXZ.assign(macroSurfaceWorldXZ());
    return positionLocal;
  });

  const biomeHeightWeights = Fn(([h, blend]) => {
    const wShore = smoothstep(uWaterMax, uWaterMax.add(blend), h).mul(
      float(1).sub(smoothstep(uShoreMax.sub(blend), uShoreMax, h)),
    );
    const wForest = smoothstep(uShoreMax.sub(blend), uShoreMax, h).mul(
      float(1).sub(smoothstep(uForestMax.sub(blend), uForestMax, h)),
    );
    const wHills = smoothstep(uForestMax.sub(blend), uForestMax, h).mul(
      float(1).sub(smoothstep(uHillsMax.sub(blend), uHillsMax, h)),
    );
    const wRockH = smoothstep(uHillsMax.sub(blend), uHillsMax, h);
    const sum = wShore.add(wForest).add(wHills).add(wRockH).add(0.0001);
    return vec4(wShore, wForest, wHills, wRockH).div(sum);
  });

  const heightNorm = attribute('heightNorm', 'float');
  const uDetailDispAtlas = texture(detailDisplacement);

  const idxShore = float(TERRAIN_ATLAS_BIOME_INDEX.shore);
  const idxForest = float(TERRAIN_ATLAS_BIOME_INDEX.forest);
  const idxHills = float(TERRAIN_ATLAS_BIOME_INDEX.hills);
  const idxMountain = float(TERRAIN_ATLAS_BIOME_INDEX.mountain);
  const idxPath = float(TERRAIN_ATLAS_BIOME_INDEX.path);
  const idxSnow = float(TERRAIN_ATLAS_BIOME_INDEX.snow);

  const mixBiomeDisplacement = Fn(([worldXZ, hwUsed, pathW, snowW]) => {
    const shoreDisp = sampleTiledDispAtlasVert(uDetailDispAtlas, worldXZ, repeat.shore, idxShore).r;
    const forestDisp = sampleTiledDispAtlasVert(uDetailDispAtlas, worldXZ, repeat.forest, idxForest).r;
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
    const heightWeights = biomeHeightWeights(heightNorm, uBlendWidth);
    const hw = mix(heightWeights, painted, uUseBiomeMap);
    const hwSum = hw.x.add(hw.y).add(hw.z).add(hw.w);
    const hwUsed = mix(heightWeights, hw, step(0.001, hwSum));

    const snowStartPad = uSnowMountainWeight.mul(0.12);
    const snowEndPad = uSnowMountainWeight.mul(0.08);
    const heightSnow = smoothstep(
      uSnowHeightStart.sub(snowStartPad),
      uSnowHeightEnd.sub(snowEndPad),
      heightNorm,
    );
    const snowW = heightSnow.mul(mix(float(1), hwUsed.w, uSnowMountainWeight));

    const pathMask = uPathMap.sample(mapUv).r;
    const pathW = pathMask.mul(uUseBiomeMap);
    vPathW.assign(pathW);

    const meadowMask = uMeadowMap.sample(mapUv).r;
    const meadowW = meadowMask.mul(uUseBiomeMap);
    vMeadowW.assign(meadowW);

    const dispOffset = mixBiomeDisplacement(worldXZ, hwUsed, pathW, snowW);
    return positionLocal.add(normalLocal.mul(dispOffset));
  });

  return {
    positionNode: vertexDisplacement ? displacedPosition() : captureSurfaceWorldXZ(),
    vSurfaceWorldXZ,
    vPathW,
    vMeadowW,
    biomeHeightWeights,
  };
}
