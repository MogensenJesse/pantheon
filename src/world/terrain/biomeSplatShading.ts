// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/biomeSplatShading.ts — fragment lighting + path/meadow overlay for biome splat material
import {
  attribute,
  clamp,
  cross,
  dot,
  float,
  Fn,
  max,
  mix,
  normalize,
  normalWorld,
  positionWorld,
  pow,
  smoothstep,
  step,
  texture,
  type varying,
  vec2,
  vec3,
} from 'three/tsl';
import { playerGlowFalloffTerrain } from '../../rendering/playerGlowTsl';
import { sampleTiledAtlas } from './biomeAtlasUv';
import { TERRAIN_SHADER_SLOPE_ROCK_START } from './biomeSplatUniforms';
import { TERRAIN_ATLAS_BIOME_INDEX } from './terrainMapAtlas';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';
import { TERRAIN_SPECULAR_MUL } from './terrainBiomeTuning';
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
  colorNode: unknown;
}

export function buildBiomeSplatShading(inputs: BiomeSplatShadingInputs): BiomeSplatShadingOutputs {
  const { uniforms, sunShadow, textures, biomeHeightWeights } = inputs;
  const {
    repeat,
    normal: normalStrength,
    roughness: roughnessMul,
    uBlendWidth,
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
    uPathMap,
    uMeadowMap,
    uUseBiomeMap,
    uWorldSize,
    uPathTint,
  } = uniforms;
  const { atlases } = textures;

  const uColorAtlas = texture(atlases.color);
  const uNormalAtlas = texture(atlases.normal);
  const uOrmAtlas = texture(atlases.orm);
  const uSpecAtlas = texture(atlases.spec);

  const idxShore = float(TERRAIN_ATLAS_BIOME_INDEX.shore);
  const idxForest = float(TERRAIN_ATLAS_BIOME_INDEX.forest);
  const idxHills = float(TERRAIN_ATLAS_BIOME_INDEX.hills);
  const idxMountain = float(TERRAIN_ATLAS_BIOME_INDEX.mountain);
  const idxPath = float(TERRAIN_ATLAS_BIOME_INDEX.path);
  const idxMeadow = float(TERRAIN_ATLAS_BIOME_INDEX.meadow);
  const idxSnow = float(TERRAIN_ATLAS_BIOME_INDEX.snow);
  const uSlopeRockStart = float(TERRAIN_SHADER_SLOPE_ROCK_START);
  const uSpecularStrength = float(TERRAIN_SPECULAR_MUL);

  const heightNorm = attribute('heightNorm', 'float');

  const sampleTangentNormal = Fn(([map, worldXZ, repeat, index, strength]) => {
    const n = sampleTiledAtlas(map, worldXZ, repeat, index).xyz.mul(2).sub(1);
    n.xy.mulAssign(strength);
    return normalize(n);
  });

  const shadeFragment = Fn(() => {
    const worldPos = positionWorld;
    const worldXZ = vec2(worldPos.x, worldPos.z);
    const mapUv = vec2(worldPos.x, worldPos.z).div(uWorldSize).add(0.5);
    const painted = uBiomeMap.sample(mapUv);
    const heightWeights = biomeHeightWeights(heightNorm, uBlendWidth);
    const hw = mix(heightWeights, painted, uUseBiomeMap);
    const hwSum = hw.x.add(hw.y).add(hw.z).add(hw.w);
    const hwUsed = mix(heightWeights, hw, step(0.001, hwSum));

    const shoreCol = sampleTiledAtlas(uColorAtlas, worldXZ, repeat.shore, idxShore).rgb;
    const forestCol = sampleTiledAtlas(uColorAtlas, worldXZ, repeat.forest, idxForest).rgb;
    const hillsCol = sampleTiledAtlas(uColorAtlas, worldXZ, repeat.hills, idxHills).rgb;
    const mountainCol = sampleTiledAtlas(uColorAtlas, worldXZ, repeat.mountain, idxMountain).rgb;
    const albedo = shoreCol
      .mul(hwUsed.x)
      .add(forestCol.mul(hwUsed.y))
      .add(hillsCol.mul(hwUsed.z))
      .add(mountainCol.mul(hwUsed.w));

    const nTS = normalize(
      sampleTangentNormal(uNormalAtlas, worldXZ, repeat.shore, idxShore, normalStrength.shore)
        .mul(hwUsed.x)
        .add(
          sampleTangentNormal(uNormalAtlas, worldXZ, repeat.forest, idxForest, normalStrength.forest).mul(
            hwUsed.y,
          ),
        )
        .add(
          sampleTangentNormal(uNormalAtlas, worldXZ, repeat.hills, idxHills, normalStrength.hills).mul(
            hwUsed.z,
          ),
        )
        .add(
          sampleTangentNormal(
            uNormalAtlas,
            worldXZ,
            repeat.mountain,
            idxMountain,
            normalStrength.mountain,
          ).mul(hwUsed.w),
        ),
    );

    const worldNormal = normalize(normalWorld);
    const up = vec3(0, 1, 0);
    const T = normalize(cross(up, worldNormal));
    const B = cross(worldNormal, T);
    const nWorld = normalize(T.mul(nTS.x).add(B.mul(nTS.y)).add(worldNormal.mul(nTS.z)));

    const shoreOrm = sampleTiledAtlas(uOrmAtlas, worldXZ, repeat.shore, idxShore).rgb;
    const forestOrm = sampleTiledAtlas(uOrmAtlas, worldXZ, repeat.forest, idxForest).rgb;
    const hillsOrm = sampleTiledAtlas(uOrmAtlas, worldXZ, repeat.hills, idxHills).rgb;
    const mountainOrm = sampleTiledAtlas(uOrmAtlas, worldXZ, repeat.mountain, idxMountain).rgb;
    const blendedOrm = shoreOrm
      .mul(hwUsed.x)
      .add(forestOrm.mul(hwUsed.y))
      .add(hillsOrm.mul(hwUsed.z))
      .add(mountainOrm.mul(hwUsed.w));
    const blendedRoughness = shoreOrm.x
      .mul(roughnessMul.shore)
      .mul(hwUsed.x)
      .add(forestOrm.x.mul(roughnessMul.forest).mul(hwUsed.y))
      .add(hillsOrm.x.mul(roughnessMul.hills).mul(hwUsed.z))
      .add(mountainOrm.x.mul(roughnessMul.mountain).mul(hwUsed.w));

    const shoreSpec = sampleTiledAtlas(uSpecAtlas, worldXZ, repeat.shore, idxShore).r;
    const forestSpec = sampleTiledAtlas(uSpecAtlas, worldXZ, repeat.forest, idxForest).r;
    const hillsSpec = sampleTiledAtlas(uSpecAtlas, worldXZ, repeat.hills, idxHills).r;
    const mountainSpec = sampleTiledAtlas(uSpecAtlas, worldXZ, repeat.mountain, idxMountain).r;
    const blendedSpec = shoreSpec
      .mul(hwUsed.x)
      .add(forestSpec.mul(hwUsed.y))
      .add(hillsSpec.mul(hwUsed.z))
      .add(mountainSpec.mul(hwUsed.w));

    const slopeRock = float(1).sub(
      smoothstep(uSlopeRockStart.sub(0.12), uSlopeRockStart, nWorld.y),
    );
    const pathW = uPathMap.sample(mapUv).r.mul(uUseBiomeMap);
    const meadowW = uMeadowMap.sample(mapUv).r.mul(uUseBiomeMap);
    const albedoRock = mix(albedo, mountainCol, slopeRock.mul(0.85));

    const snowStartPad = uSnowMountainWeight.mul(0.12);
    const snowEndPad = uSnowMountainWeight.mul(0.08);
    const heightSnow = smoothstep(
      uSnowHeightStart.sub(snowStartPad),
      uSnowHeightEnd.sub(snowEndPad),
      heightNorm,
    );
    const snowW = heightSnow.mul(mix(float(1), hwUsed.w, uSnowMountainWeight));
    const snowCol = sampleTiledAtlas(uColorAtlas, worldXZ, repeat.snow, idxSnow).rgb;
    const albedoSnow = mix(albedoRock, snowCol, snowW);

    const pathCol = sampleTiledAtlas(uColorAtlas, worldXZ, repeat.path, idxPath).rgb.mul(uPathTint);
    const pathN = sampleTangentNormal(uNormalAtlas, worldXZ, repeat.path, idxPath, normalStrength.path);
    const pathOrm = sampleTiledAtlas(uOrmAtlas, worldXZ, repeat.path, idxPath).rgb;
    const pathRough = pathOrm.x.mul(roughnessMul.path);
    const pathSpec = sampleTiledAtlas(uSpecAtlas, worldXZ, repeat.path, idxPath).r;
    const withPathCol = mix(albedoSnow, pathCol, pathW);
    const meadowCol = sampleTiledAtlas(uColorAtlas, worldXZ, repeat.meadow, idxMeadow).rgb;
    const albedoFinal = mix(withPathCol, meadowCol, meadowW);

    const nTSSnow = normalize(
      nTS.add(
        sampleTangentNormal(uNormalAtlas, worldXZ, repeat.snow, idxSnow, normalStrength.snow).mul(
          snowW,
        ),
      ),
    );
    const nTSPath = normalize(nTSSnow.add(pathN.mul(pathW)));
    const nTSFinal = normalize(
      nTSPath.add(
        sampleTangentNormal(
          uNormalAtlas,
          worldXZ,
          repeat.meadow,
          idxMeadow,
          normalStrength.meadow,
        ).mul(meadowW),
      ),
    );
    const nWorldFinal = normalize(
      T.mul(nTSFinal.x).add(B.mul(nTSFinal.y)).add(worldNormal.mul(nTSFinal.z)),
    );

    const ormRock = mix(blendedOrm, mountainOrm, slopeRock.mul(0.85));
    const roughRock = mix(blendedRoughness, mountainOrm.x.mul(roughnessMul.mountain), slopeRock.mul(0.85));
    const snowOrm = sampleTiledAtlas(uOrmAtlas, worldXZ, repeat.snow, idxSnow).rgb;
    const snowRough = snowOrm.x.mul(roughnessMul.snow);
    const ormSnow = mix(ormRock, snowOrm, snowW);
    const roughSnow = mix(roughRock, snowRough, snowW);
    const ormPath = mix(ormSnow, pathOrm, pathW);
    const roughPath = mix(roughSnow, pathRough, pathW);
    const meadowOrm = sampleTiledAtlas(uOrmAtlas, worldXZ, repeat.meadow, idxMeadow).rgb;
    const meadowRough = meadowOrm.x.mul(roughnessMul.meadow);
    const ormFinal = mix(ormPath, meadowOrm, meadowW);
    const roughness = mix(roughPath, meadowRough, meadowW);
    const ao = ormFinal.y;
    const rockMetal = ormFinal.z;

    const specRock = mix(blendedSpec, mountainSpec, slopeRock.mul(0.85));
    const specSnow = mix(specRock, sampleTiledAtlas(uSpecAtlas, worldXZ, repeat.snow, idxSnow).r, snowW);
    const specPath = mix(specSnow, pathSpec, pathW);
    const specFinal = mix(
      specPath,
      sampleTiledAtlas(uSpecAtlas, worldXZ, repeat.meadow, idxMeadow).r,
      meadowW,
    );

    const metalFactor = mix(float(1), rockMetal.mul(2), hwUsed.w.add(slopeRock.mul(0.5)));
    const aoTerm = ao;
    const ndl = max(dot(nWorldFinal, uSunDirection), 0);
    const V = normalize(uViewCamPos.sub(worldPos));
    const H = normalize(uSunDirection.add(V));
    const ndh = max(dot(nWorldFinal, H), 0);
    const specPower = mix(float(32), float(4), clamp(roughness, 0, 1));
    const spec = pow(ndh, specPower)
      .mul(float(1).sub(roughness))
      .mul(metalFactor)
      .mul(specFinal);
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
