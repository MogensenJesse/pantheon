// src/world/terrain/material/biomeSplatShading.ts — fragment lighting + path/meadow overlay for biome splat material
import { Fn, float, fwidth, If, max, mix, positionWorld, texture, vec3, vec4 } from 'three/tsl';
import { playerGlowFalloffTerrain } from '../../../rendering/playerGlowTsl';
import { computeTerrainSunVisFloor } from '../../../rendering/sunShadow';
import { guideReceiveGlowTsl } from '../../../rendering/tsl/guideReceiveGlowTsl';
import { waterWaveUniforms } from '../../water/material/waterWaveUniforms';
import {
  applyWaterTerrainWetnessTsl,
  FOAM_AA_MIN_M,
} from '../../water/tsl/waterIntersectionFoamTsl';
import { createShorelineFieldTsl, SHORE_MIN_SLOPE } from '../../water/tsl/waterShorelineFieldTsl';
import { waterTideOffsetTsl } from '../../water/tsl/waterTideTsl';
import { TERRAIN_ATLAS_BIOME_INDEX } from '../atlas/atlasConstants';
import type { TerrainTextureSet } from '../loaders/loadTerrainTextures';
import { biomeAtlasTileGrads, sampleTiledAtlasWithGrad, terrainMapUv } from '../tsl/biomeAtlasUv';
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
import type { TerrainSplatUniforms } from './biomeSplatUniforms';

type TslNode = any;

export interface BiomeSplatShadingInputs {
  uniforms: TerrainSplatUniforms;
  sunShadow: TslNode | null;
  textures: TerrainTextureSet;
  vSurfaceWorldXZ: TslNode;
  chiseledWorldNormalAtWorldXZ: TslNode;
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>;
  sampleHeightNormAtWorldXZ: TslNode;
  /**
   * Editor / color-only: albedo splat + hue-split lighting. Skips ORM AO, sun
   * shadows, player/guide glow, and shoreline wetness.
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
  const uOrmAtlas = simpleShading ? null : texture(atlases.orm);
  const shoreline = simpleShading
    ? null
    : createShorelineFieldTsl({
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
    const sampleGated = (
      atlas: TslNode,
      layerW: TslNode,
      worldRepeat: TslNode,
      index: TslNode,
      grads: TslNode,
    ) => {
      const s = vec4(0).toVar();
      If(layerW.greaterThan(overlayEps), () => {
        s.assign(sampleTiledAtlasWithGrad(atlas, worldXZ, worldRepeat, index, grads));
      });
      return s;
    };
    const mapUv = terrainMapUv(uWorldSize, worldXZ);
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

    const shoreGrads = biomeAtlasTileGrads(worldXZ, repeat.shore);
    const forestGrads = biomeAtlasTileGrads(worldXZ, repeat.forest);
    const hillsGrads = biomeAtlasTileGrads(worldXZ, repeat.hills);
    const mountainGrads = biomeAtlasTileGrads(worldXZ, repeat.mountain);
    const snowGrads = biomeAtlasTileGrads(worldXZ, repeat.snow);
    const meadowGrads = biomeAtlasTileGrads(worldXZ, repeat.meadow);
    const rockGrads = biomeAtlasTileGrads(worldXZ, repeat.rock);
    const pathGrads = biomeAtlasTileGrads(worldXZ, repeat.path);

    const shoreCol = sampleGated(uColorAtlas, hwUsed.x, repeat.shore, idxShore, shoreGrads);
    const forestCol = sampleGated(uColorAtlas, hwUsed.y, repeat.forest, idxForest, forestGrads);
    const hillsCol = sampleGated(uColorAtlas, hwUsed.z, repeat.hills, idxHills, hillsGrads);
    const mountainCol = sampleGated(
      uColorAtlas,
      hwUsed.w,
      repeat.mountain,
      idxMountain,
      mountainGrads,
    );
    const albedoAcc = shoreCol.rgb
      .mul(hwUsed.x)
      .add(forestCol.rgb.mul(hwUsed.y))
      .add(hillsCol.rgb.mul(hwUsed.z))
      .add(mountainCol.rgb.mul(hwUsed.w))
      .toVar();

    const aoAcc = uOrmAtlas
      ? sampleGated(uOrmAtlas, hwUsed.x, repeat.shore, idxShore, shoreGrads)
          .g.mul(hwUsed.x)
          .add(
            sampleGated(uOrmAtlas, hwUsed.y, repeat.forest, idxForest, forestGrads).g.mul(hwUsed.y),
          )
          .add(sampleGated(uOrmAtlas, hwUsed.z, repeat.hills, idxHills, hillsGrads).g.mul(hwUsed.z))
          .add(
            sampleGated(uOrmAtlas, hwUsed.w, repeat.mountain, idxMountain, mountainGrads).g.mul(
              hwUsed.w,
            ),
          )
          .toVar()
      : null;

    const worldNormal = chiseledWorldNormalAtWorldXZ(worldXZ);
    const slopeRockW = mixSlopeRockWeightTsl(worldNormal);
    const pathW = uPathMap.sample(mapUv).r.mul(uUseBiomeMap);
    const meadowW = uMeadowMap.sample(mapUv).r.mul(uUseBiomeMap);
    const snowW = computeSnowWeight(uniforms, heightNorm, hwUsed, worldXZ, worldNormal);

    const mixOverlay = (
      weight: TslNode,
      worldRepeat: TslNode,
      index: TslNode,
      grads: TslNode,
      tint?: TslNode,
    ) => {
      If(weight.greaterThan(overlayEps), () => {
        const rgb = sampleTiledAtlasWithGrad(uColorAtlas, worldXZ, worldRepeat, index, grads).rgb;
        albedoAcc.assign(mix(albedoAcc, tint ? rgb.mul(tint) : rgb, weight));
        if (aoAcc && uOrmAtlas) {
          aoAcc.assign(
            mix(
              aoAcc,
              sampleTiledAtlasWithGrad(uOrmAtlas, worldXZ, worldRepeat, index, grads).g,
              weight,
            ),
          );
        }
      });
    };

    mixOverlay(slopeRockW, repeat.rock, idxRock, rockGrads);
    mixOverlay(snowW, repeat.snow, idxSnow, snowGrads);
    mixOverlay(pathW, repeat.path, idxPath, pathGrads, uPathTint);
    mixOverlay(meadowW, repeat.meadow, idxMeadow, meadowGrads);

    const convexMul = float(1).toVar();
    If(uUseConvexMap.greaterThan(float(0.5)), () => {
      convexMul.assign(convexAlbedoMulTsl(uTerrainAux.sample(mapUv).a, packConvexU));
    });
    albedoAcc.assign(albedoAcc.mul(convexMul));
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

    if (simpleShading) {
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

    const albedoFinal = mix(albedoAcc, ramps.paletteAlbedo, uStylizePaletteMix);
    const propOpen = uPropAoMap.sample(mapUv).r;
    const propAoAmt = float(1).sub(propOpen).mul(uPropAoEnabled) as TslNode;
    const propAo = (mix as any)(float(1), float(1).sub(uPropAoStrength), propAoAmt);
    const aoTerm = (aoAcc as TslNode).mul(propAo);
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

    const worldPos = positionWorld;
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

    const wave = waterWaveUniforms;
    const heightM = heightNorm.mul(uniforms.uHeightScale);
    const waterY = wave.uWaterY.add(waterTideOffsetTsl(wave));
    const heightDelta = heightM.sub(waterY).abs();
    const maxSlope = max(wave.uShoreMaxSlope, float(SHORE_MIN_SLOPE));
    const wetGateM = wave.uWetSandM
      .add(wave.uFoamRippleAmplitude)
      .add(wave.uRunUpM)
      .add(float(0.35));
    const cheapDistM = waterY.sub(heightM).div(float(SHORE_MIN_SLOPE));
    const wetAa = max(fwidth(cheapDistM), float(FOAM_AA_MIN_M));
    const withWetness = shadowDebug.toVar();
    If(
      heightDelta.lessThan(wetGateM.mul(maxSlope)).and(wave.uTideEnabled.greaterThan(float(0.5))),
      () => {
        withWetness.assign(
          applyWaterTerrainWetnessTsl(
            shadowDebug,
            vSurfaceWorldXZ,
            shoreline!.shoreDistanceM(vSurfaceWorldXZ),
            wave,
            wetAa,
          ),
        );
      },
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
