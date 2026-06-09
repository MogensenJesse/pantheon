// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/biomeSplatShading.ts — fragment lighting + path/meadow overlay for biome splat material
import {
  attribute,
  clamp,
  cross,
  dot,
  Fn,
  float,
  max,
  mix,
  normalize,
  normalWorld,
  positionWorld,
  pow,
  smoothstep,
  texture,
  type varying,
  vec2,
  vec3,
} from 'three/tsl';
import { playerGlowFalloffTerrain } from '../../rendering/playerGlowTsl';
import { atlasTileUv } from './biomeAtlasUv';
import { TERRAIN_ATLAS_BIOME_INDEX } from './terrainMapAtlas';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';
import type { TerrainTextureSet } from './loadTerrainTextures';

export interface BiomeSplatShadingInputs {
  uniforms: TerrainSplatUniforms;
  sunShadow: unknown;
  textures: TerrainTextureSet;
  vPathW: ReturnType<typeof varying>;
  vMeadowW: ReturnType<typeof varying>;
  biomeHeightWeights: ReturnType<typeof Fn>;
}

export interface BiomeSplatShadingOutputs {
  /** Final fragment color node — assign to `material.colorNode`. */
  colorNode: unknown;
}

export function buildBiomeSplatShading(inputs: BiomeSplatShadingInputs): BiomeSplatShadingOutputs {
  const { uniforms, sunShadow, textures, vPathW, vMeadowW, biomeHeightWeights } = inputs;
  const {
    uRepeat,
    uBlendWidth,
    uSlopeRockStart,
    uNormalStrength,
    uAoStrength,
    uSpecularStrength,
    uSunDirection,
    uSunColor,
    uSunIntensity,
    uAmbientColor,
    uAmbientIntensity,
    uViewCamPos,
    uPlayerPos,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
    uDebugShadowView,
    uShadowFloor,
    uSnowHeightStart,
    uSnowHeightEnd,
    uSnowMountainWeight,
    uBiomeMap,
    uUseBiomeMap,
    uWorldSize,
    uPathTint,
  } = uniforms;
  const { atlases } = textures;

  const fragUv = vec2(positionWorld.x, positionWorld.z).mul(uRepeat);

  const uColorAtlas = texture(atlases.color, fragUv);
  const uNormalAtlas = texture(atlases.normal, fragUv);
  const uOrmAtlas = texture(atlases.orm, fragUv);

  const idxShore = float(TERRAIN_ATLAS_BIOME_INDEX.shore);
  const idxForest = float(TERRAIN_ATLAS_BIOME_INDEX.forest);
  const idxHills = float(TERRAIN_ATLAS_BIOME_INDEX.hills);
  const idxMountain = float(TERRAIN_ATLAS_BIOME_INDEX.mountain);
  const idxPath = float(TERRAIN_ATLAS_BIOME_INDEX.path);
  const idxMeadow = float(TERRAIN_ATLAS_BIOME_INDEX.meadow);
  const idxSnow = float(TERRAIN_ATLAS_BIOME_INDEX.snow);

  const heightNorm = attribute('heightNorm', 'float');

  const sampleTangentNormal = Fn(([map, uvCoord]) => {
    const n = map.sample(uvCoord).xyz.mul(2).sub(1);
    n.xy.mulAssign(uNormalStrength);
    return normalize(n);
  });

  const shadeFragment = Fn(() => {
    const worldPos = positionWorld;
    const uv = vec2(worldPos.x, worldPos.z).mul(uRepeat);
    const mapUv = vec2(worldPos.x, worldPos.z).div(uWorldSize).add(0.5);
    const painted = uBiomeMap.sample(mapUv);
    const heightWeights = biomeHeightWeights(heightNorm, uBlendWidth);
    const hw = mix(heightWeights, painted, uUseBiomeMap);

    const shoreCol = uColorAtlas.sample(atlasTileUv(uv, idxShore)).rgb;
    const forestCol = uColorAtlas.sample(atlasTileUv(uv, idxForest)).rgb;
    const hillsCol = uColorAtlas.sample(atlasTileUv(uv, idxHills)).rgb;
    const mountainCol = uColorAtlas.sample(atlasTileUv(uv, idxMountain)).rgb;
    const albedo = shoreCol
      .mul(hw.x)
      .add(forestCol.mul(hw.y))
      .add(hillsCol.mul(hw.z))
      .add(mountainCol.mul(hw.w));

    const nTS = normalize(
      sampleTangentNormal(uNormalAtlas, atlasTileUv(uv, idxShore))
        .mul(hw.x)
        .add(sampleTangentNormal(uNormalAtlas, atlasTileUv(uv, idxForest)).mul(hw.y))
        .add(sampleTangentNormal(uNormalAtlas, atlasTileUv(uv, idxHills)).mul(hw.z))
        .add(sampleTangentNormal(uNormalAtlas, atlasTileUv(uv, idxMountain)).mul(hw.w)),
    );

    const worldNormal = normalize(normalWorld);
    const up = vec3(0, 1, 0);
    const T = normalize(cross(up, worldNormal));
    const B = cross(worldNormal, T);
    const nWorld = normalize(T.mul(nTS.x).add(B.mul(nTS.y)).add(worldNormal.mul(nTS.z)));

    const shoreOrm = uOrmAtlas.sample(atlasTileUv(uv, idxShore)).rgb;
    const forestOrm = uOrmAtlas.sample(atlasTileUv(uv, idxForest)).rgb;
    const hillsOrm = uOrmAtlas.sample(atlasTileUv(uv, idxHills)).rgb;
    const mountainOrm = uOrmAtlas.sample(atlasTileUv(uv, idxMountain)).rgb;
    const blendedOrm = shoreOrm
      .mul(hw.x)
      .add(forestOrm.mul(hw.y))
      .add(hillsOrm.mul(hw.z))
      .add(mountainOrm.mul(hw.w));
    const slopeRock = float(1).sub(
      smoothstep(uSlopeRockStart.sub(0.12), uSlopeRockStart, nWorld.y),
    );
    const pathW = vPathW;
    const meadowW = vMeadowW;
    const albedoRock = mix(albedo, mountainCol, slopeRock.mul(0.85));

    const snowW = smoothstep(uSnowHeightStart, uSnowHeightEnd, heightNorm).mul(
      smoothstep(float(0), uSnowMountainWeight, hw.w),
    );
    const snowCol = uColorAtlas.sample(atlasTileUv(uv, idxSnow)).rgb;
    const albedoSnow = mix(albedoRock, snowCol, snowW);

    const pathCol = uColorAtlas.sample(atlasTileUv(uv, idxPath)).rgb.mul(uPathTint);
    const pathN = sampleTangentNormal(uNormalAtlas, atlasTileUv(uv, idxPath));
    const pathOrm = uOrmAtlas.sample(atlasTileUv(uv, idxPath)).rgb;
    const withPathCol = mix(albedoSnow, pathCol, pathW);
    const meadowCol = uColorAtlas.sample(atlasTileUv(uv, idxMeadow)).rgb;
    const albedoFinal = mix(withPathCol, meadowCol, meadowW);

    const nTSSnow = normalize(
      nTS.add(sampleTangentNormal(uNormalAtlas, atlasTileUv(uv, idxSnow)).mul(snowW)),
    );
    const nTSPath = normalize(nTSSnow.add(pathN.mul(pathW)));
    const nTSFinal = normalize(
      nTSPath.add(sampleTangentNormal(uNormalAtlas, atlasTileUv(uv, idxMeadow)).mul(meadowW)),
    );
    const nWorldFinal = normalize(
      T.mul(nTSFinal.x).add(B.mul(nTSFinal.y)).add(worldNormal.mul(nTSFinal.z)),
    );

    const ormRock = mix(blendedOrm, mountainOrm, slopeRock.mul(0.85));
    const ormSnow = mix(ormRock, uOrmAtlas.sample(atlasTileUv(uv, idxSnow)).rgb, snowW);
    const ormPath = mix(ormSnow, pathOrm, pathW);
    const ormFinal = mix(ormPath, uOrmAtlas.sample(atlasTileUv(uv, idxMeadow)).rgb, meadowW);
    const roughness = ormFinal.x;
    const ao = ormFinal.y;
    const rockMetal = ormFinal.z;

    const metalFactor = mix(float(1), rockMetal.mul(2), hw.w.add(slopeRock.mul(0.5)));
    const aoTerm = mix(float(1), ao, uAoStrength);
    const ndl = max(dot(nWorldFinal, uSunDirection), 0);
    const V = normalize(uViewCamPos.sub(worldPos));
    const H = normalize(uSunDirection.add(V));
    const ndh = max(dot(nWorldFinal, H), 0);
    const specPower = mix(float(32), float(4), clamp(roughness, 0, 1));
    const spec = pow(ndh, specPower).mul(float(1).sub(roughness)).mul(metalFactor);
    const sunVis = float(sunShadow.r);
    const sunVisFloor = mix(uShadowFloor, float(1), sunVis);
    const ambientTerm = uAmbientColor.mul(uAmbientIntensity).mul(aoTerm);
    const sunDiffuse = uSunColor.mul(uSunIntensity).mul(ndl).mul(sunVisFloor);
    const diffuse = albedoFinal.mul(ambientTerm.add(sunDiffuse));
    const specular = uSunColor.mul(uSunIntensity).mul(spec).mul(uSpecularStrength).mul(sunVisFloor);
    const baseLit = diffuse.add(specular);

    const dist = worldPos.distance(uPlayerPos);
    const playerGlow = playerGlowFalloffTerrain(
      dist,
      uLightRadius,
      uLightIntensity,
      uPlayerGlowMul,
    );
    const glowLit = albedoFinal.mul(aoTerm).mul(playerGlow);

    const normalLit = baseLit.add(glowLit);
    return mix(normalLit, vec3(sunVisFloor, sunVisFloor, sunVisFloor), uDebugShadowView);
  });

  return { colorNode: shadeFragment() };
}
