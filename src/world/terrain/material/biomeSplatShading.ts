// src/world/terrain/material/biomeSplatShading.ts — fragment lighting + path/meadow overlay for biome splat material
import { Fn, float, If, mix, normalize, positionWorld, texture, vec3 } from 'three/tsl';
import { playerGlowFalloffTerrain } from '../../../rendering/playerGlowTsl';
import { computeTerrainSunVisFloor } from '../../../rendering/sunShadow';
import { guideReceiveGlowTsl } from '../../../rendering/tsl/guideReceiveGlowTsl';
import { waterWaveUniforms } from '../../water/material/waterWaveUniforms';
import { applyWaterTerrainWetnessTsl } from '../../water/tsl/waterIntersectionFoamTsl';
import { createShorelineFieldTsl } from '../../water/tsl/waterShorelineFieldTsl';
import { TERRAIN_ATLAS_BIOME_INDEX } from '../atlas/atlasConstants';
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
import { convexAlbedoMulTsl, mixSlopeRockWeightTsl } from '../tsl/terrainPackMapsTsl';
import { stylizePaletteRamps } from '../tsl/terrainStylizeColorTsl';
import {
  applyTerrainStylizeLighting,
  STYLIZE_LIGHTING_OPEN,
} from '../tsl/terrainStylizeLightingTsl';
import {
  breakupDistanceWeight,
  breakupMacroWorldXZ,
  breakupMixFactor,
} from '../tsl/terrainTextureBreakupTsl';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';

type TslNode = any;

export interface BiomeSplatShadingInputs {
  uniforms: TerrainSplatUniforms;
  sunShadow: TslNode;
  textures: TerrainTextureSet;
  vSurfaceWorldXZ: TslNode;
  chiseledWorldNormalAtWorldXZ: TslNode;
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>;
  sampleHeightNormAtWorldXZ: TslNode;
  /**
   * Editor / color-only: albedo splat + hue-split lighting. Skips texture breakup,
   * ORM AO, sun shadows, player/guide glow, and shoreline wetness.
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
    chiseledWorldNormalAtWorldXZ,
    biomeHeightWeights,
    sampleHeightNormAtWorldXZ,
    simpleShading = false,
  } = inputs;
  const uniforms = splatUniforms as any;
  const {
    repeat,
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
    uUseConvexMap,
    uConvexRidgeLight,
    paletteSun,
    paletteGround,
    paletteShadow,
    uStylizePaletteMix,
  } = uniforms;
  const { atlases } = textures;

  const uColorAtlas = texture(atlases.color);
  const uOrmAtlas = texture(atlases.orm);
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

  /** Skip overlay atlas fetches when weight is negligible. */
  const overlayEps = float(1e-3);

  const shadeFragment = Fn(() => {
    const worldXZ = vSurfaceWorldXZ;
    const mapUv = terrainMapUv(uWorldSize, worldXZ);
    const auxSample = uTerrainAux.sample(mapUv);
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
      const worldNormal = chiseledWorldNormalAtWorldXZ(worldXZ);
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

      const slopeRockW = mixSlopeRockWeightTsl(worldNormal);
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
      const ramps = stylizePaletteRamps({
        sampledAlbedo: albedoAcc,
        paletteSun,
        paletteGround,
        paletteShadow,
        hwUsed,
        slopeRockW,
        snowW,
        pathW,
        meadowW,
      });
      const faceN = normalize(worldNormal);
      const { diffuse } = applyTerrainStylizeLighting({
        sampledAlbedo: albedoAcc,
        unlitRamp: ramps.unlit,
        litRamp: ramps.lit,
        paletteMix: uStylizePaletteMix,
        faceNormal: faceN,
        sunDirection: uSunDirection,
        sunColor: uSunColor,
        sunIntensity: uSunIntensity,
        ambientColor: uAmbientColor,
        ambientIntensity: uAmbientIntensity,
        sunVis: STYLIZE_LIGHTING_OPEN,
        aoTerm: STYLIZE_LIGHTING_OPEN,
      });
      if (import.meta.env.DEV) {
        return applyTerrainBiomeDebugOverlay(
          diffuse,
          vSurfaceWorldXZ,
          splatUniforms,
          slopeRockW,
          snowW,
        );
      }
      return diffuse;
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

    const worldNormal = chiseledWorldNormalAtWorldXZ(worldXZ);

    const shoreAo = sampleTiledAtlas(uOrmAtlas, worldXZ, repeat.shore, idxShore).g;
    const forestAo = sampleTiledAtlas(uOrmAtlas, worldXZ, repeat.forest, idxForest).g;
    const hillsAo = sampleTiledAtlas(uOrmAtlas, worldXZ, repeat.hills, idxHills).g;
    const mountainAo = sampleTiledAtlas(uOrmAtlas, worldXZ, repeat.mountain, idxMountain).g;
    const blendedAo = shoreAo
      .mul(hwUsed.x)
      .add(forestAo.mul(hwUsed.y))
      .add(hillsAo.mul(hwUsed.z))
      .add(mountainAo.mul(hwUsed.w));

    const slopeRockW = mixSlopeRockWeightTsl(worldNormal);
    const pathW = uPathMap.sample(mapUv).r.mul(uUseBiomeMap);
    const meadowW = uMeadowMap.sample(mapUv).r.mul(uUseBiomeMap);
    const snowW = computeSnowWeight(uniforms, heightNorm, hwUsed, worldXZ, worldNormal);

    const snowGrads = biomeAtlasTileGrads(worldXZ, repeat.snow);
    const snowGradsB = biomeAtlasTileGrads(worldXZB, repeat.snow);
    const meadowGrads = biomeAtlasTileGrads(worldXZ, repeat.meadow);
    const meadowGradsB = biomeAtlasTileGrads(worldXZB, repeat.meadow);
    const rockGrads = biomeAtlasTileGrads(worldXZ, repeat.rock);

    const albedoAcc = albedo.toVar();
    const aoAcc = blendedAo.toVar();

    If(slopeRockW.greaterThan(overlayEps), () => {
      const rockCol = sampleTiledAtlasWithGrad(
        uColorAtlas,
        worldXZ,
        repeat.rock,
        idxRock,
        rockGrads,
      ).rgb;
      albedoAcc.assign(mix(albedoAcc, rockCol, slopeRockW));
      const rockAo = sampleTiledAtlasWithGrad(
        uOrmAtlas,
        worldXZ,
        repeat.rock,
        idxRock,
        rockGrads,
      ).g;
      aoAcc.assign(mix(aoAcc, rockAo, slopeRockW));
    });

    If(snowW.greaterThan(overlayEps), () => {
      const snowCol = sampleBreakupRgb(repeat.snow, idxSnow, snowGrads, snowGradsB);
      albedoAcc.assign(mix(albedoAcc, snowCol, snowW));
      const snowAo = sampleTiledAtlasWithGrad(
        uOrmAtlas,
        worldXZ,
        repeat.snow,
        idxSnow,
        snowGrads,
      ).g;
      aoAcc.assign(mix(aoAcc, snowAo, snowW));
    });

    If(pathW.greaterThan(overlayEps), () => {
      const pathCol = sampleTiledAtlasVert(uColorAtlas, worldXZ, repeat.path, idxPath).rgb.mul(
        uPathTint,
      );
      albedoAcc.assign(mix(albedoAcc, pathCol, pathW));
      const pathAo = sampleTiledAtlasVert(uOrmAtlas, worldXZ, repeat.path, idxPath).g;
      aoAcc.assign(mix(aoAcc, pathAo, pathW));
    });

    If(meadowW.greaterThan(overlayEps), () => {
      const meadowCol = sampleBreakupRgb(repeat.meadow, idxMeadow, meadowGrads, meadowGradsB);
      albedoAcc.assign(mix(albedoAcc, meadowCol, meadowW));
      const meadowAo = sampleTiledAtlasWithGrad(
        uOrmAtlas,
        worldXZ,
        repeat.meadow,
        idxMeadow,
        meadowGrads,
      ).g;
      aoAcc.assign(mix(aoAcc, meadowAo, meadowW));
    });

    albedoAcc.assign(albedoAcc.mul(convexAlbedoMulTsl(auxSample.a, packConvexU)));
    const ramps = stylizePaletteRamps({
      sampledAlbedo: albedoAcc,
      paletteSun,
      paletteGround,
      paletteShadow,
      hwUsed,
      slopeRockW,
      snowW,
      pathW,
      meadowW,
    });
    const albedoFinal = mix(albedoAcc, ramps.paletteAlbedo, uStylizePaletteMix);

    const propOpen = uPropAoMap.sample(mapUv).r;
    const propAoAmt = float(1).sub(propOpen).mul(uPropAoEnabled) as TslNode;
    const propAo = (mix as any)(float(1), float(1).sub(uPropAoStrength), propAoAmt);
    const aoTerm = aoAcc.mul(propAo);
    const sunVisFloor = computeTerrainSunVisFloor(sunShadow, uShadowFloor);
    const propSunMul = (mix as any)(float(1), float(1).sub(uPropAoSunStrength), propAoAmt);
    const sunVisWithPropAo = sunVisFloor.mul(propSunMul);
    const { diffuse } = applyTerrainStylizeLighting({
      sampledAlbedo: albedoAcc,
      unlitRamp: ramps.unlit,
      litRamp: ramps.lit,
      paletteMix: uStylizePaletteMix,
      faceNormal: worldNormal,
      sunDirection: uSunDirection,
      sunColor: uSunColor,
      sunIntensity: uSunIntensity,
      ambientColor: uAmbientColor,
      ambientIntensity: uAmbientIntensity,
      sunVis: sunVisWithPropAo,
      aoTerm,
    });

    const dist = worldPos.distance(uPlayerPos);
    const playerGlow = playerGlowFalloffTerrain(
      dist,
      uLightRadius,
      uLightIntensity,
      uPlayerGlowMul,
    );
    const guideGlow = guideReceiveGlowTsl(uGuideGlowMap, mapUv, uGuideLightIntensity);
    const glowLit = albedoFinal.mul(aoTerm).mul(playerGlow.add(guideGlow));

    const normalLit = diffuse.add(glowLit);
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
      return applyTerrainBiomeDebugOverlay(
        withWetness,
        vSurfaceWorldXZ,
        splatUniforms,
        slopeRockW,
        snowW,
      );
    }
    return withWetness;
  });

  return { colorNode: shadeFragment() };
}
