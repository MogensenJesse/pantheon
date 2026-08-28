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
  sqrt,
  texture,
  vec3,
} from 'three/tsl';
import { playerGlowFalloffTerrain } from '../../../rendering/playerGlowTsl';
import { computeTerrainSunVisFloor } from '../../../rendering/sunShadow';
import { guideReceiveGlowTsl } from '../../../rendering/tsl/guideReceiveGlowTsl';
import { waterWaveUniforms } from '../../water/material/waterWaveUniforms';
import { applyWaterTerrainWetnessTsl } from '../../water/tsl/waterIntersectionFoamTsl';
import { createShorelineFieldTsl } from '../../water/tsl/waterShorelineFieldTsl';
import { TERRAIN_ATLAS_BIOME_INDEX } from '../atlas/atlasConstants';
import { TERRAIN_SPECULAR_MUL } from '../config/terrainBiomeTuning';
import type { TerrainTextureSet } from '../loaders/loadTerrainTextures';
import {
  biomeAtlasTileGrads,
  sampleTiledAtlas,
  sampleTiledAtlasBreakup,
  sampleTiledAtlasVert,
  sampleTiledAtlasWithGrad,
  terrainMapUv,
} from '../tsl/biomeAtlasUv';
import {
  computeSnowWeight,
  type createBiomeHeightWeights,
  resolvePaintedHwUsed,
} from '../tsl/biomeSplatWeights';
import { applyTerrainBiomeDebugOverlay } from '../tsl/terrainBiomeDebugTsl';
import { applyTerrainLodDebugOverlay } from '../tsl/terrainLodDebugTsl';
import {
  convexAlbedoMulTsl,
  convexRoughnessMixTsl,
  mixSlopeRockWeightTsl,
} from '../tsl/terrainPackMapsTsl';
import {
  breakupDistanceWeight,
  breakupMacroWorldXZ,
  breakupMixFactor,
} from '../tsl/terrainTextureBreakupTsl';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';
import {
  TERRAIN_SHADER_PLATEAU_FLATNESS_END,
  TERRAIN_SHADER_PLATEAU_FLATNESS_START,
} from './biomeSplatUniforms';

type TslNode = any;

export interface BiomeSplatShadingInputs {
  uniforms: TerrainSplatUniforms;
  sunShadow: TslNode;
  textures: TerrainTextureSet;
  vSurfaceWorldXZ: TslNode;
  vMacroNormal: TslNode;
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>;
  sampleHeightNormAtWorldXZ: TslNode;
  /** Play LOD: true → discard fragment (ring coverage). */
  earlyDiscardWhen?: (worldXZ: TslNode) => TslNode;
  /**
   * Editor / color-only: albedo splat + Lambert. Skips texture breakup, PBR atlas
   * fetches, sun shadows, player/guide glow, and shoreline wetness.
   */
  simpleShading?: boolean;
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
    sampleHeightNormAtWorldXZ,
    earlyDiscardWhen,
    simpleShading = false,
  } = inputs;
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
    uGuideGlowMap,
    uGuideLightIntensity,
    uDebugShadowView,
    uShadowFloor,
    uBiomeMap,
    uPathMap,
    uMeadowMap,
    uPropAoMap,
    uPropAoEnabled,
    uPropAoStrength,
    uPropAoSunStrength,
    uUseBiomeMap,
    uWorldSize,
    uPathTint,
    uTerrainAux,
    uUseSlopeMap,
    uUseConvexMap,
    uUsePackNormal,
    uSlopeMaskLow,
    uSlopeMaskHigh,
    uSlopeAuthoredStrength,
    uSlopeDerivedStrength,
    uConvexRidgeLight,
    uConvexRidgeRough,
    uPackNormalBlend,
  } = uniforms;
  const { atlases } = textures;

  const uColorAtlas = texture(atlases.color);
  const uNormalAtlas = texture(atlases.normal);
  const uOrmAtlas = texture(atlases.orm);
  const uSpecAtlas = texture(atlases.spec);
  const shoreline = createShorelineFieldTsl({
    sampleHeightNorm: (worldXZ) => sampleHeightNormAtWorldXZ(worldXZ),
    uHeightScale: uniforms.uHeightScale,
  });

  const idxShore = float(TERRAIN_ATLAS_BIOME_INDEX.shore);
  const idxForest = float(TERRAIN_ATLAS_BIOME_INDEX.forest);
  const idxHills = float(TERRAIN_ATLAS_BIOME_INDEX.hills);
  const idxMountain = float(TERRAIN_ATLAS_BIOME_INDEX.mountain);
  const idxPath = float(TERRAIN_ATLAS_BIOME_INDEX.path);
  const idxMeadow = float(TERRAIN_ATLAS_BIOME_INDEX.meadow);
  const idxSnow = float(TERRAIN_ATLAS_BIOME_INDEX.snow);
  const idxRock = float(TERRAIN_ATLAS_BIOME_INDEX.rock);
  const uPlateauFlatStart = float(TERRAIN_SHADER_PLATEAU_FLATNESS_START);
  const uPlateauFlatEnd = float(TERRAIN_SHADER_PLATEAU_FLATNESS_END);
  const uSpecularStrength = float(TERRAIN_SPECULAR_MUL);

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
    if (earlyDiscardWhen) {
      If(earlyDiscardWhen(worldXZ), () => {
        Discard();
      });
    }
    const mapUv = terrainMapUv(uWorldSize, worldXZ);
    const auxSample = uTerrainAux.sample(mapUv);
    const packSlopeU = {
      uUseSlopeMap,
      uSlopeMaskLow,
      uSlopeMaskHigh,
      uSlopeAuthoredStrength,
      uSlopeDerivedStrength,
    };
    const packConvexU = { uUseConvexMap, uConvexRidgeLight };
    const heightNorm = sampleHeightNormAtWorldXZ(worldXZ);
    const painted = uBiomeMap.sample(mapUv);
    const hwUsed = resolvePaintedHwUsed(
      biomeHeightWeights,
      heightNorm,
      painted,
      uBlendWidth,
      uUseBiomeMap,
    );

    if (simpleShading) {
      const worldNormal = vMacroNormal as any;
      const shoreGrads = biomeAtlasTileGrads(worldXZ, repeat.shore);
      const forestGrads = biomeAtlasTileGrads(worldXZ, repeat.forest);
      const hillsGrads = biomeAtlasTileGrads(worldXZ, repeat.hills);
      const mountainGrads = biomeAtlasTileGrads(worldXZ, repeat.mountain);
      const sampleLandRgb = (
        layerW: TslNode,
        worldRepeat: TslNode,
        index: TslNode,
        grads: TslNode,
      ) => {
        const col = vec3(0).toVar();
        If(layerW.greaterThan(overlayEps), () => {
          col.assign(sampleTiledAtlasWithGrad(uColorAtlas, worldXZ, worldRepeat, index, grads).rgb);
        });
        return col;
      };
      const albedoAcc = sampleLandRgb(hwUsed.x, repeat.shore, idxShore, shoreGrads)
        .mul(hwUsed.x)
        .add(sampleLandRgb(hwUsed.y, repeat.forest, idxForest, forestGrads).mul(hwUsed.y))
        .add(sampleLandRgb(hwUsed.z, repeat.hills, idxHills, hillsGrads).mul(hwUsed.z))
        .add(sampleLandRgb(hwUsed.w, repeat.mountain, idxMountain, mountainGrads).mul(hwUsed.w))
        .toVar();

      const slopeRockW = mixSlopeRockWeightTsl(worldNormal, auxSample.b, packSlopeU);
      const pathW = uPathMap.sample(mapUv).r.mul(uUseBiomeMap);
      const meadowW = uMeadowMap.sample(mapUv).r.mul(uUseBiomeMap);
      const snowW = computeSnowWeight(uniforms, heightNorm, hwUsed, worldXZ, worldNormal);
      const snowGrads = biomeAtlasTileGrads(worldXZ, repeat.snow);
      const meadowGrads = biomeAtlasTileGrads(worldXZ, repeat.meadow);
      const rockGrads = biomeAtlasTileGrads(worldXZ, repeat.rock);

      If(slopeRockW.greaterThan(overlayEps), () => {
        albedoAcc.assign(
          mix(
            albedoAcc,
            sampleTiledAtlasWithGrad(uColorAtlas, worldXZ, repeat.rock, idxRock, rockGrads).rgb,
            slopeRockW,
          ),
        );
      });
      If(snowW.greaterThan(overlayEps), () => {
        albedoAcc.assign(
          mix(
            albedoAcc,
            sampleTiledAtlasWithGrad(uColorAtlas, worldXZ, repeat.snow, idxSnow, snowGrads).rgb,
            snowW,
          ),
        );
      });
      If(pathW.greaterThan(overlayEps), () => {
        albedoAcc.assign(
          mix(
            albedoAcc,
            sampleTiledAtlasVert(uColorAtlas, worldXZ, repeat.path, idxPath).rgb.mul(uPathTint),
            pathW,
          ),
        );
      });
      If(meadowW.greaterThan(overlayEps), () => {
        albedoAcc.assign(
          mix(
            albedoAcc,
            sampleTiledAtlasWithGrad(uColorAtlas, worldXZ, repeat.meadow, idxMeadow, meadowGrads)
              .rgb,
            meadowW,
          ),
        );
      });

      albedoAcc.assign(albedoAcc.mul(convexAlbedoMulTsl(auxSample.a, packConvexU)));

      const nWorldLit = normalize(worldNormal);
      const ndl = max(dot(nWorldLit, uSunDirection), 0);
      const ambientTerm = uAmbientColor.mul(uAmbientIntensity);
      const sunDiffuse = uSunColor.mul(uSunIntensity).mul(ndl);
      const lit = albedoAcc.mul(ambientTerm.add(sunDiffuse));
      if (import.meta.env.DEV) {
        return applyTerrainBiomeDebugOverlay(
          lit,
          vSurfaceWorldXZ,
          splatUniforms,
          slopeRockW,
          snowW,
        );
      }
      return lit;
    }

    const worldPos = positionWorld;
    const worldXZB = breakupMacroWorldXZ(worldXZ, uniforms.uBreakupMacroScale);
    const mixW = breakupMixFactor(
      breakupDistanceWeight(worldPos, uViewCamPos, uniforms.uBreakupStartM, uniforms.uBreakupEndM),
      uniforms.uBreakupBlend,
    );
    const sampleBreakupRgb = (
      worldRepeat: TslNode,
      index: TslNode,
      gradsA: TslNode,
      gradsB: TslNode,
    ) =>
      sampleTiledAtlasBreakup(
        uColorAtlas,
        worldXZ,
        worldXZB,
        worldRepeat,
        index,
        gradsA,
        gradsB,
        mixW,
        uniforms.uBreakupPatchRotate,
        uniforms.uBreakupPatchRadius,
        uniforms.uBreakupPatchFade,
      ).rgb;
    const landBreakupRgb = (
      layerW: TslNode,
      worldRepeat: TslNode,
      index: TslNode,
      gradsA: TslNode,
      gradsB: TslNode,
    ) => {
      const col = vec3(0).toVar();
      If(layerW.greaterThan(overlayEps), () => {
        col.assign(sampleBreakupRgb(worldRepeat, index, gradsA, gradsB));
      });
      return col;
    };
    const shoreGrads = biomeAtlasTileGrads(worldXZ, repeat.shore);
    const shoreGradsB = biomeAtlasTileGrads(worldXZB, repeat.shore);
    const forestGrads = biomeAtlasTileGrads(worldXZ, repeat.forest);
    const forestGradsB = biomeAtlasTileGrads(worldXZB, repeat.forest);
    const hillsGrads = biomeAtlasTileGrads(worldXZ, repeat.hills);
    const hillsGradsB = biomeAtlasTileGrads(worldXZB, repeat.hills);
    const mountainGrads = biomeAtlasTileGrads(worldXZ, repeat.mountain);
    const mountainGradsB = biomeAtlasTileGrads(worldXZB, repeat.mountain);

    const shoreCol = landBreakupRgb(hwUsed.x, repeat.shore, idxShore, shoreGrads, shoreGradsB);
    const forestCol = landBreakupRgb(hwUsed.y, repeat.forest, idxForest, forestGrads, forestGradsB);
    const hillsCol = landBreakupRgb(hwUsed.z, repeat.hills, idxHills, hillsGrads, hillsGradsB);
    const mountainCol = landBreakupRgb(
      hwUsed.w,
      repeat.mountain,
      idxMountain,
      mountainGrads,
      mountainGradsB,
    );
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

    const slopeRockW = mixSlopeRockWeightTsl(worldNormal, auxSample.b, packSlopeU);
    const pathW = uPathMap.sample(mapUv).r.mul(uUseBiomeMap);
    const meadowW = uMeadowMap.sample(mapUv).r.mul(uUseBiomeMap);

    const snowW = computeSnowWeight(uniforms, heightNorm, hwUsed, worldXZ, worldNormal);

    // Derivatives outside branches — textureSampleGrad is legal inside divergent If.
    const snowGrads = biomeAtlasTileGrads(worldXZ, repeat.snow);
    const snowGradsB = biomeAtlasTileGrads(worldXZB, repeat.snow);
    const meadowGrads = biomeAtlasTileGrads(worldXZ, repeat.meadow);
    const meadowGradsB = biomeAtlasTileGrads(worldXZB, repeat.meadow);
    const rockGrads = biomeAtlasTileGrads(worldXZ, repeat.rock);

    const albedoAcc = albedo.toVar();
    const nTSAcc = nTS.toVar();
    const ormAcc = blendedOrm.toVar();
    const roughAcc = blendedRoughness.toVar();
    const specAcc = blendedSpec.toVar();

    If(slopeRockW.greaterThan(overlayEps), () => {
      const rockCol = sampleTiledAtlasWithGrad(
        uColorAtlas,
        worldXZ,
        repeat.rock,
        idxRock,
        rockGrads,
      ).rgb;
      albedoAcc.assign(mix(albedoAcc, rockCol, slopeRockW));
      const rockN = sampleTangentNormalGrad(
        uNormalAtlas,
        worldXZ,
        repeat.rock,
        idxRock,
        normalStrength.rock,
        rockGrads,
      );
      nTSAcc.assign(normalize(mix(nTSAcc, rockN, slopeRockW)));
      const rockOrm = sampleTiledAtlasWithGrad(
        uOrmAtlas,
        worldXZ,
        repeat.rock,
        idxRock,
        rockGrads,
      ).rgb;
      ormAcc.assign(mix(ormAcc, rockOrm, slopeRockW));
      roughAcc.assign(mix(roughAcc, rockOrm.x.mul(roughnessMul.rock), slopeRockW));
      const rockSpec = sampleTiledAtlasWithGrad(
        uSpecAtlas,
        worldXZ,
        repeat.rock,
        idxRock,
        rockGrads,
      ).r;
      specAcc.assign(mix(specAcc, rockSpec, slopeRockW));
    });

    If(snowW.greaterThan(overlayEps), () => {
      const snowCol = sampleBreakupRgb(repeat.snow, idxSnow, snowGrads, snowGradsB);
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
      const meadowCol = sampleBreakupRgb(repeat.meadow, idxMeadow, meadowGrads, meadowGradsB);
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

    albedoAcc.assign(albedoAcc.mul(convexAlbedoMulTsl(auxSample.a, packConvexU)));
    roughAcc.assign(
      convexRoughnessMixTsl(roughAcc, auxSample.a, { uUseConvexMap, uConvexRidgeRough }),
    );

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
      clamp(hwUsed.w.add(slopeRockW.mul(0.5)), 0, 1),
    );
    // Prop contact AO: 1 = open ground, 0 = under prop base. Gate with uPropAoEnabled.
    const propOpen = uPropAoMap.sample(mapUv).r;
    const propAoAmt = float(1).sub(propOpen).mul(uPropAoEnabled) as TslNode;
    const propAo = (mix as any)(float(1), float(1).sub(uPropAoStrength), propAoAmt);
    const aoTerm = ao.mul(propAo);
    const plateauFlatness = smoothstep(uPlateauFlatStart, uPlateauFlatEnd, worldNormal.y);
    const packNx = auxSample.r.mul(2).sub(1);
    const packNz = auxSample.g.mul(2).sub(1);
    const packNy = sqrt(max(float(0), float(1).sub(packNx.mul(packNx)).sub(packNz.mul(packNz))));
    const packN = normalize(vec3(packNx, packNy, packNz));
    const nWorldLit = normalize(
      mix(
        mix(nWorldFinal, worldNormal, plateauFlatness),
        packN,
        uPackNormalBlend.mul(uUsePackNormal),
      ),
    );
    const ndl = max(dot(nWorldLit, uSunDirection), 0);
    const V = normalize(uViewCamPos.sub(worldPos));
    const H = normalize(uSunDirection.add(V));
    const ndh = max(dot(nWorldLit, H), 0);
    const specPower = mix(float(32), float(4), clamp(roughness, 0, 1));
    const spec = pow(ndh, specPower).mul(float(1).sub(roughness)).mul(metalFactor).mul(specFinal);
    const sunVisFloor = computeTerrainSunVisFloor(sunShadow, uShadowFloor);
    const propSunMul = (mix as any)(float(1), float(1).sub(uPropAoSunStrength), propAoAmt);
    const sunVisWithPropAo = sunVisFloor.mul(propSunMul);
    const ambientTerm = uAmbientColor.mul(uAmbientIntensity).mul(aoTerm);
    const sunDiffuse = uSunColor.mul(uSunIntensity).mul(ndl).mul(sunVisWithPropAo);
    const diffuse = albedoFinal.mul(ambientTerm.add(sunDiffuse));
    const specular = uSunColor
      .mul(uSunIntensity)
      .mul(spec)
      .mul(uSpecularStrength)
      .mul(sunVisWithPropAo);
    const baseLit = diffuse.add(specular);

    const dist = worldPos.distance(uPlayerPos);
    const playerGlow = playerGlowFalloffTerrain(
      dist,
      uLightRadius,
      uLightIntensity,
      uPlayerGlowMul,
    );
    const guideGlow = guideReceiveGlowTsl(uGuideGlowMap, mapUv, uGuideLightIntensity);
    const glowLit = albedoFinal.mul(aoTerm).mul(playerGlow.add(guideGlow));

    const normalLit = baseLit.add(glowLit);
    const shadowDebug = mix(
      normalLit,
      vec3(sunVisWithPropAo as any, sunVisWithPropAo as any, sunVisWithPropAo as any),
      uDebugShadowView,
    );
    const withWetness = applyWaterTerrainWetnessTsl(
      shadowDebug,
      vSurfaceWorldXZ,
      shoreline.shoreDistanceM(vSurfaceWorldXZ),
      waterWaveUniforms,
    );
    if (import.meta.env.DEV) {
      const withBiomeDebug = applyTerrainBiomeDebugOverlay(
        withWetness,
        vSurfaceWorldXZ,
        splatUniforms,
        slopeRockW,
        snowW,
      );
      return applyTerrainLodDebugOverlay(withBiomeDebug, vSurfaceWorldXZ, splatUniforms);
    }
    return withWetness;
  });

  return { colorNode: shadeFragment() };
}
