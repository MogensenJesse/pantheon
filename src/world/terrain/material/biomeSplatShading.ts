// src/world/terrain/material/biomeSplatShading.ts — fragment lighting + path/meadow overlay for biome splat material
import {
  Fn,
  float,
  fwidth,
  If,
  max,
  min,
  mix,
  positionWorld,
  texture,
  vec3,
  vec4,
} from 'three/tsl';
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
import {
  convexAlbedoMulTsl,
  mixSlopeRockWeightTsl,
  slopeRockDerivedTsl,
} from '../tsl/terrainPackMapsTsl';
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
  /** Knife face N — snow coverage (constant per facet). */
  knifeWorldNormalAtWorldXZ: TslNode;
  /** Triangle centroid XZ — snow height/noise. */
  chiseledFaceCentroidXZAtWorldXZ: TslNode;
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>;
  sampleHeightNormAtWorldXZ: TslNode;
  chiseledWorldYAtWorldXZ: TslNode;
  macroSlopeAtWorldXZ: TslNode;
  /**
   * Editor / color-only: albedo splat + hue-split lighting. Skips atlas AO, sun
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
    knifeWorldNormalAtWorldXZ,
    chiseledFaceCentroidXZAtWorldXZ,
    biomeHeightWeights,
    sampleHeightNormAtWorldXZ,
    chiseledWorldYAtWorldXZ,
    macroSlopeAtWorldXZ,
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
    uWaterMap,
    uPropAoMap,
    uPropAoEnabled,
    uPropAoStrength,
    uPropAoSunStrength,
    uWorldSize,
    uHeightScale,
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
  const uAoAtlas = simpleShading ? null : texture(atlases.ao);
  const shoreline = simpleShading
    ? null
    : createShorelineFieldTsl({
        sampleWorldY: (worldXZ) => chiseledWorldYAtWorldXZ(worldXZ),
        sampleSlope: (worldXZ) => macroSlopeAtWorldXZ(worldXZ, waterWaveUniforms.uShoreSlopeStepM),
      });

  const idxShore = float(TERRAIN_ATLAS_BIOME_INDEX.shore);
  const idxForest = float(TERRAIN_ATLAS_BIOME_INDEX.forest);
  const idxHills = float(TERRAIN_ATLAS_BIOME_INDEX.hills);
  const idxMountain = float(TERRAIN_ATLAS_BIOME_INDEX.mountain);
  const idxPath = float(TERRAIN_ATLAS_BIOME_INDEX.path);
  const idxMeadow = float(TERRAIN_ATLAS_BIOME_INDEX.meadow);
  const idxSnow = float(TERRAIN_ATLAS_BIOME_INDEX.snow);
  const idxRock = float(TERRAIN_ATLAS_BIOME_INDEX.rock);
  const idxWater = float(TERRAIN_ATLAS_BIOME_INDEX.water);

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
    const hwUsed = resolvePaintedHwUsed(biomeHeightWeights, heightNorm, painted, uBlendWidth);

    const shoreGrads = biomeAtlasTileGrads(worldXZ, repeat.shore);
    const forestGrads = biomeAtlasTileGrads(worldXZ, repeat.forest);
    const hillsGrads = biomeAtlasTileGrads(worldXZ, repeat.hills);
    const mountainGrads = biomeAtlasTileGrads(worldXZ, repeat.mountain);
    const snowGrads = biomeAtlasTileGrads(worldXZ, repeat.snow);
    const meadowGrads = biomeAtlasTileGrads(worldXZ, repeat.meadow);
    const rockGrads = biomeAtlasTileGrads(worldXZ, repeat.rock);
    const pathGrads = biomeAtlasTileGrads(worldXZ, repeat.path);
    const waterGrads = biomeAtlasTileGrads(worldXZ, repeat.water);

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

    const aoAcc = uAoAtlas
      ? sampleGated(uAoAtlas, hwUsed.x, repeat.shore, idxShore, shoreGrads)
          .r.mul(hwUsed.x)
          .add(
            sampleGated(uAoAtlas, hwUsed.y, repeat.forest, idxForest, forestGrads).r.mul(hwUsed.y),
          )
          .add(sampleGated(uAoAtlas, hwUsed.z, repeat.hills, idxHills, hillsGrads).r.mul(hwUsed.z))
          .add(
            sampleGated(uAoAtlas, hwUsed.w, repeat.mountain, idxMountain, mountainGrads).r.mul(
              hwUsed.w,
            ),
          )
          .toVar()
      : null;

    const worldNormal = chiseledWorldNormalAtWorldXZ(worldXZ);
    const slopeRockW = mixSlopeRockWeightTsl(worldNormal);
    const pathW = uPathMap.sample(mapUv).r;
    const meadowW = uMeadowMap.sample(mapUv).r;
    const waterW = uWaterMap.sample(mapUv).r;
    const snowFaceXZ = chiseledFaceCentroidXZAtWorldXZ(worldXZ);
    const snowFaceN = knifeWorldNormalAtWorldXZ(worldXZ);
    const snowHeightNorm = chiseledWorldYAtWorldXZ(snowFaceXZ).div(uHeightScale);
    const snowW = computeSnowWeight(uniforms, snowHeightNorm, hwUsed, snowFaceXZ, snowFaceN).mul(
      float(1).sub(slopeRockDerivedTsl(snowFaceN)),
    );

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
        if (aoAcc && uAoAtlas) {
          aoAcc.assign(
            mix(
              aoAcc,
              sampleTiledAtlasWithGrad(uAoAtlas, worldXZ, worldRepeat, index, grads).r,
              weight,
            ),
          );
        }
      });
    };

    mixOverlay(snowW, repeat.snow, idxSnow, snowGrads);
    mixOverlay(slopeRockW, repeat.rock, idxRock, rockGrads);
    mixOverlay(pathW, repeat.path, idxPath, pathGrads, uPathTint);
    mixOverlay(meadowW, repeat.meadow, idxMeadow, meadowGrads);
    mixOverlay(waterW, repeat.water, idxWater, waterGrads);

    const convexMul = float(1).toVar();
    If(uUseConvexMap.greaterThan(float(0.5)), () => {
      convexMul.assign(convexAlbedoMulTsl(uTerrainAux.sample(mapUv).r, packConvexU));
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
      waterW,
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
    // Trees already cast PCSS — take the darker of umbra vs contact-sun, do not multiply.
    const sunVisWithPropAo = min(sunVisFloor, propSunMul);
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
    const heightM = chiseledWorldYAtWorldXZ(worldXZ);
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
