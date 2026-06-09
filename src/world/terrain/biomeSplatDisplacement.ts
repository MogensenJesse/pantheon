// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/biomeSplatDisplacement.ts — vertex displacement node for biome splat material
import {
  attribute,
  Fn,
  float,
  mix,
  normalLocal,
  positionLocal,
  positionWorld,
  smoothstep,
  step,
  texture,
  varying,
  vec2,
  vec4,
} from 'three/tsl';
import { sampleTiledAtlasVert, selectDominantDisplacement, terrainMapUv } from './biomeAtlasUv';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';
import { TERRAIN_ATLAS_BIOME_INDEX } from './terrainMapAtlas';
import type { TerrainTextureSet } from './loadTerrainTextures';

export interface BiomeSplatDisplacementInputs {
  uniforms: TerrainSplatUniforms;
  textures: TerrainTextureSet;
}

export interface BiomeSplatDisplacementOutputs {
  positionNode: unknown;
  vPathW: ReturnType<typeof varying>;
  vMeadowW: ReturnType<typeof varying>;
  biomeHeightWeights: ReturnType<typeof Fn>;
}

export function buildBiomeSplatDisplacement(
  inputs: BiomeSplatDisplacementInputs,
): BiomeSplatDisplacementOutputs {
  const { uniforms, textures } = inputs;
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

  const vPathW = varying(float());
  const vMeadowW = varying(float());

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
  const idxMeadow = float(TERRAIN_ATLAS_BIOME_INDEX.meadow);
  const idxSnow = float(TERRAIN_ATLAS_BIOME_INDEX.snow);
  const neutral = float(0.5);

  const mixBiomeDisplacement = Fn(([worldXZ, hwUsed, pathW, meadowW, snowW]) => {
    const shoreDisp = sampleTiledAtlasVert(uDetailDispAtlas, worldXZ, repeat.shore, idxShore).r;
    const forestDisp = sampleTiledAtlasVert(uDetailDispAtlas, worldXZ, repeat.forest, idxForest).r;
    const hillsDisp = sampleTiledAtlasVert(uDetailDispAtlas, worldXZ, repeat.hills, idxHills).r;
    const mountainDisp = sampleTiledAtlasVert(uDetailDispAtlas, worldXZ, repeat.mountain, idxMountain).r;

    const shoreOff = shoreDisp.sub(neutral).mul(detailDisp.shore);
    const forestOff = forestDisp.sub(neutral).mul(detailDisp.forest);
    const hillsOff = hillsDisp.sub(neutral).mul(detailDisp.hills);
    const mountainOff = mountainDisp.sub(neutral).mul(detailDisp.mountain);
    const landOff = selectDominantDisplacement(shoreOff, forestOff, hillsOff, mountainOff, hwUsed);

    const snowDisp = sampleTiledAtlasVert(uDetailDispAtlas, worldXZ, repeat.snow, idxSnow).r;
    const snowOff = snowDisp.sub(neutral).mul(detailDisp.snow);
    const withSnowOff = mix(landOff, snowOff, snowW);

    const pathDisp = sampleTiledAtlasVert(uDetailDispAtlas, worldXZ, repeat.path, idxPath).r;
    const pathOff = pathDisp.sub(neutral).mul(detailDisp.path);
    const withPathOff = mix(withSnowOff, pathOff, pathW);

    const meadowDisp = sampleTiledAtlasVert(uDetailDispAtlas, worldXZ, repeat.meadow, idxMeadow).r;
    const meadowOff = meadowDisp.sub(neutral).mul(detailDisp.meadow);
    return mix(withPathOff, meadowOff, meadowW);
  });

  const displacedPosition = Fn(() => {
    const worldXZ = vec2(positionWorld.x, positionWorld.z);
    const mapUv = terrainMapUv(uWorldSize);
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

    const dispOffset = mixBiomeDisplacement(worldXZ, hwUsed, pathW, meadowW, snowW);
    return positionLocal.add(normalLocal.mul(dispOffset));
  });

  return {
    positionNode: displacedPosition(),
    vPathW,
    vMeadowW,
    biomeHeightWeights,
  };
}
