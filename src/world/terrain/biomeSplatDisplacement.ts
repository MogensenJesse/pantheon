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
  sampleTiledAtlasVert,
  selectDominantLandAtlasIndex,
  selectDominantLandScalar,
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

const OVERLAY_WEIGHT_EPS = float(0.001);

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

  const idxPath = float(TERRAIN_ATLAS_BIOME_INDEX.path);
  const idxSnow = float(TERRAIN_ATLAS_BIOME_INDEX.snow);
  const neutral = float(0.5);

  const mixBiomeDisplacement = Fn(([worldXZ, hwUsed, pathW, snowW]) => {
    const landIdx = selectDominantLandAtlasIndex(hwUsed);
    const landRepeat = selectDominantLandScalar(
      repeat.shore,
      repeat.forest,
      repeat.hills,
      repeat.mountain,
      hwUsed,
    );
    const landScale = selectDominantLandScalar(
      detailDisp.shore,
      detailDisp.forest,
      detailDisp.hills,
      detailDisp.mountain,
      hwUsed,
    );
    const landDisp = sampleTiledAtlasVert(uDetailDispAtlas, worldXZ, landRepeat, landIdx).r;
    const landOff = landDisp.sub(neutral).mul(landScale);

    // step-gated mix (not nested If/Else — that cycles TSL getNodeType / getDataFromNode)
    const snowDisp = sampleTiledAtlasVert(uDetailDispAtlas, worldXZ, repeat.snow, idxSnow).r;
    const snowOff = snowDisp.sub(neutral).mul(detailDisp.snow);
    const snowBlend = mix(landOff, snowOff, snowW);
    const withSnowOff = mix(landOff, snowBlend, step(OVERLAY_WEIGHT_EPS, snowW));

    const pathDisp = sampleTiledAtlasVert(uDetailDispAtlas, worldXZ, repeat.path, idxPath).r;
    const pathOff = pathDisp.sub(neutral).mul(detailDisp.path);
    const pathBlend = mix(withSnowOff, pathOff, pathW);
    return mix(withSnowOff, pathBlend, step(OVERLAY_WEIGHT_EPS, pathW));
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
