// src/world/terrain/material/biomeSplatShading.ts — fragment lighting + path/meadow overlay for biome splat material
import {
  clamp,
  cross,
  Discard,
  dot,
  Fn,
  float,
  If,
  max,
  mix,
  normalize,
  positionWorld,
  pow,
  select,
  smoothstep,
  texture,
  vec3,
} from 'three/tsl';
import { playerGlowFalloffTerrain } from '../../../rendering/playerGlowTsl';
import { computeTerrainSunVisFloor } from '../../../rendering/sunShadow';
import { applyWaterIntersectionFoamTsl } from '../../water/tsl/waterIntersectionFoamTsl';
import { waterWaveUniforms } from '../../water/waterWaveUniforms';
import { TERRAIN_ATLAS_BIOME_INDEX } from '../atlas/atlasConstants';
import { TERRAIN_SPECULAR_MUL } from '../config/terrainBiomeTuning';
import type { TerrainTextureSet } from '../loaders/loadTerrainTextures';
import {
  biomeAtlasTileGrads,
  sampleTiledAtlas,
  sampleTiledAtlasVert,
  sampleTiledAtlasWithGrad,
  terrainMapUv,
} from '../tsl/biomeAtlasUv';
import {
  computeSnowWeight,
  type createBiomeHeightWeights,
  resolvePaintedHwUsed,
} from '../tsl/biomeSplatWeights';
import { createMacroHeightTsl } from '../tsl/terrainMacroHeightTsl';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';
import {
  TERRAIN_SHADER_PLATEAU_FLATNESS_END,
  TERRAIN_SHADER_PLATEAU_FLATNESS_START,
  TERRAIN_SHADER_SLOPE_ROCK_START,
} from './biomeSplatUniforms';

type TslNode = any;

export interface BiomeSplatShadingInputs {
  uniforms: TerrainSplatUniforms;
  sunShadow: TslNode;
  textures: TerrainTextureSet;
  vSurfaceWorldXZ: TslNode;
  vMacroNormal: TslNode;
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>;
  /** Play LOD: same opacityFn as material.opacityNode — early-discard before heavy splat samples. */
  earlyDiscardOpacity?: (worldXZ: TslNode) => TslNode;
  earlyDiscardThreshold?: number;
}

export interface BiomeSplatShadingOutputs {
  colorNode: TslNode;
}

export function buildBiomeSplatShading(inputs: BiomeSplatShadingInputs): BiomeSplatShadingOutputs {
  const {
    uniforms: splatUniforms,
    sunShadow,
    textures,
    vSurfaceWorldXZ,
    vMacroNormal,
    biomeHeightWeights,
    earlyDiscardOpacity,
    earlyDiscardThreshold,
  } = inputs;
  const earlyDiscardThresholdNode =
    earlyDiscardThreshold !== undefined ? float(earlyDiscardThreshold) : null;
  const uniforms = splatUniforms as any;
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
  const uPlateauFlatStart = float(TERRAIN_SHADER_PLATEAU_FLATNESS_START);
  const uPlateauFlatEnd = float(TERRAIN_SHADER_PLATEAU_FLATNESS_END);
  const uSpecularStrength = float(TERRAIN_SPECULAR_MUL);

  const { sampleHeightNormAtWorldXZ } = createMacroHeightTsl(uniforms);

  const sampleTangentNormal = Fn(([map, worldXZ, repeat, index, strength]: TslNode[]) => {
    const n = sampleTiledAtlas(map, worldXZ, repeat, index).xyz.mul(2).sub(1);
    n.xy.mulAssign(strength);
    return normalize(n);
  });

  /** Mip-safe normal sample with precomputed grads — safe inside divergent `If`. */
  const sampleTangentNormalGrad = Fn(
    ([map, worldXZ, repeat, index, strength, grads]: TslNode[]) => {
      const n = sampleTiledAtlasWithGrad(map, worldXZ, repeat, index, grads).xyz.mul(2).sub(1);
      n.xy.mulAssign(strength);
      return normalize(n);
    },
  );

  /** Mip-free — matches vertex displacement sampling (path overlay). */
  const sampleTangentNormalVert = Fn(([map, worldXZ, repeat, index, strength]: TslNode[]) => {
    const n = sampleTiledAtlasVert(map, worldXZ, repeat, index).xyz.mul(2).sub(1);
    n.xy.mulAssign(strength);
    return normalize(n);
  });

  /** Skip overlay atlas fetches when weight is negligible (Phase 5.2). */
  const overlayEps = float(1e-3);

  const shadeFragment = Fn(() => {
    const worldXZ = vSurfaceWorldXZ;
    if (earlyDiscardOpacity && earlyDiscardThresholdNode) {
      const layerOpacity = earlyDiscardOpacity(worldXZ);
      If(layerOpacity.lessThan(earlyDiscardThresholdNode), () => {
        Discard();
      });
    }
    const worldPos = positionWorld;
    const mapUv = terrainMapUv(uWorldSize, worldXZ);
    const heightNorm = sampleHeightNormAtWorldXZ(worldXZ);
    const painted = uBiomeMap.sample(mapUv);
    const hwUsed = resolvePaintedHwUsed(
      biomeHeightWeights,
      heightNorm,
      painted,
      uBlendWidth,
      uUseBiomeMap,
    );

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
          sampleTangentNormal(
            uNormalAtlas,
            worldXZ,
            repeat.forest,
            idxForest,
            normalStrength.forest,
          ).mul(hwUsed.y),
        )
        .add(
          sampleTangentNormal(
            uNormalAtlas,
            worldXZ,
            repeat.hills,
            idxHills,
            normalStrength.hills,
          ).mul(hwUsed.z),
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

    const worldNormal = vMacroNormal as any;
    const tFallback = vec3(1, 0, 0);
    const Tbasis: TslNode = select(
      worldNormal.y.greaterThan(0.999),
      tFallback,
      cross(worldNormal, vec3(0, 0, 1)),
    );
    const T = normalize(Tbasis);
    const B = cross(worldNormal, T as TslNode);

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
      smoothstep(uSlopeRockStart.sub(0.12), uSlopeRockStart, worldNormal.y),
    );
    const pathW = uPathMap.sample(mapUv).r.mul(uUseBiomeMap);
    const meadowW = uMeadowMap.sample(mapUv).r.mul(uUseBiomeMap);
    const albedoRock = mix(albedo, mountainCol, slopeRock.mul(0.85));

    const ormRock = mix(blendedOrm, mountainOrm, slopeRock.mul(0.85));
    const roughRock = mix(
      blendedRoughness,
      mountainOrm.x.mul(roughnessMul.mountain),
      slopeRock.mul(0.85),
    );
    const specRock = mix(blendedSpec, mountainSpec, slopeRock.mul(0.85));

    const snowW = computeSnowWeight(uniforms, heightNorm, hwUsed, worldXZ, worldNormal);

    // Derivatives outside branches — textureSampleGrad is legal inside divergent If.
    const snowGrads = biomeAtlasTileGrads(worldXZ, repeat.snow);
    const meadowGrads = biomeAtlasTileGrads(worldXZ, repeat.meadow);

    const albedoAcc = albedoRock.toVar();
    const nTSAcc = nTS.toVar();
    const ormAcc = ormRock.toVar();
    const roughAcc = roughRock.toVar();
    const specAcc = specRock.toVar();

    If(snowW.greaterThan(overlayEps), () => {
      const snowCol = sampleTiledAtlasWithGrad(
        uColorAtlas,
        worldXZ,
        repeat.snow,
        idxSnow,
        snowGrads,
      ).rgb;
      albedoAcc.assign(mix(albedoAcc, snowCol, snowW));
      const snowN = sampleTangentNormalGrad(
        uNormalAtlas,
        worldXZ,
        repeat.snow,
        idxSnow,
        normalStrength.snow,
        snowGrads,
      );
      nTSAcc.assign(normalize(nTSAcc.add(snowN.mul(snowW))));
      const snowOrm = sampleTiledAtlasWithGrad(
        uOrmAtlas,
        worldXZ,
        repeat.snow,
        idxSnow,
        snowGrads,
      ).rgb;
      ormAcc.assign(mix(ormAcc, snowOrm, snowW));
      roughAcc.assign(mix(roughAcc, snowOrm.x.mul(roughnessMul.snow), snowW));
      const snowSpec = sampleTiledAtlasWithGrad(
        uSpecAtlas,
        worldXZ,
        repeat.snow,
        idxSnow,
        snowGrads,
      ).r;
      specAcc.assign(mix(specAcc, snowSpec, snowW));
    });

    If(pathW.greaterThan(overlayEps), () => {
      const pathCol = sampleTiledAtlasVert(uColorAtlas, worldXZ, repeat.path, idxPath).rgb.mul(
        uPathTint,
      );
      albedoAcc.assign(mix(albedoAcc, pathCol, pathW));
      const pathN = sampleTangentNormalVert(
        uNormalAtlas,
        worldXZ,
        repeat.path,
        idxPath,
        normalStrength.path,
      );
      nTSAcc.assign(normalize(nTSAcc.add(pathN.mul(pathW))));
      const pathOrm = sampleTiledAtlasVert(uOrmAtlas, worldXZ, repeat.path, idxPath).rgb;
      ormAcc.assign(mix(ormAcc, pathOrm, pathW));
      roughAcc.assign(mix(roughAcc, pathOrm.x.mul(roughnessMul.path), pathW));
      const pathSpec = sampleTiledAtlasVert(uSpecAtlas, worldXZ, repeat.path, idxPath).r;
      specAcc.assign(mix(specAcc, pathSpec, pathW));
    });

    If(meadowW.greaterThan(overlayEps), () => {
      const meadowCol = sampleTiledAtlasWithGrad(
        uColorAtlas,
        worldXZ,
        repeat.meadow,
        idxMeadow,
        meadowGrads,
      ).rgb;
      albedoAcc.assign(mix(albedoAcc, meadowCol, meadowW));
      const meadowN = sampleTangentNormalGrad(
        uNormalAtlas,
        worldXZ,
        repeat.meadow,
        idxMeadow,
        normalStrength.meadow,
        meadowGrads,
      );
      nTSAcc.assign(normalize(nTSAcc.add(meadowN.mul(meadowW))));
      const meadowOrm = sampleTiledAtlasWithGrad(
        uOrmAtlas,
        worldXZ,
        repeat.meadow,
        idxMeadow,
        meadowGrads,
      ).rgb;
      ormAcc.assign(mix(ormAcc, meadowOrm, meadowW));
      roughAcc.assign(mix(roughAcc, meadowOrm.x.mul(roughnessMul.meadow), meadowW));
      const meadowSpec = sampleTiledAtlasWithGrad(
        uSpecAtlas,
        worldXZ,
        repeat.meadow,
        idxMeadow,
        meadowGrads,
      ).r;
      specAcc.assign(mix(specAcc, meadowSpec, meadowW));
    });

    const albedoFinal = albedoAcc;
    const nTSFinal = nTSAcc as TslNode;
    const ormFinal = ormAcc;
    const roughness = roughAcc;
    const specFinal = specAcc;
    const nWorldFinal = normalize(
      T.mul(nTSFinal.x).add(B.mul(nTSFinal.y)).add(worldNormal.mul(nTSFinal.z)),
    );
    const ao = (ormFinal as any).y;
    const rockMetal = (ormFinal as any).z;

    const metalFactor = mix(
      float(1),
      rockMetal.mul(2),
      clamp(hwUsed.w.add(slopeRock.mul(0.5)), 0, 1),
    );
    const aoTerm = ao;
    const plateauFlatness = smoothstep(uPlateauFlatStart, uPlateauFlatEnd, worldNormal.y);
    const nWorldLit = normalize(mix(nWorldFinal, worldNormal, plateauFlatness));
    const ndl = max(dot(nWorldLit, uSunDirection), 0);
    const V = normalize(uViewCamPos.sub(worldPos));
    const H = normalize(uSunDirection.add(V));
    const ndh = max(dot(nWorldLit, H), 0);
    const specPower = mix(float(32), float(4), clamp(roughness, 0, 1));
    const spec = pow(ndh, specPower).mul(float(1).sub(roughness)).mul(metalFactor).mul(specFinal);
    const sunVisFloor = computeTerrainSunVisFloor(sunShadow, uShadowFloor);
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
    const shadowDebug = mix(
      normalLit,
      vec3(sunVisFloor, sunVisFloor, sunVisFloor),
      uDebugShadowView,
    );
    return (applyWaterIntersectionFoamTsl as any)(
      shadowDebug,
      worldPos.y,
      vSurfaceWorldXZ,
      waterWaveUniforms,
    );
  });

  return { colorNode: shadeFragment() };
}
