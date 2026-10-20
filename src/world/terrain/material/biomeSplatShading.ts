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
import { applyWetLookTsl } from '../../../rendering/weather/weatherLookTsl';
import { waterWaveUniforms } from '../../water/material/waterWaveUniforms';
import {
  applyWaterTerrainWetnessTsl,
  FOAM_AA_MIN_M,
} from '../../water/tsl/waterIntersectionFoamTsl';
import { createShorelineFieldTsl, SHORE_MIN_SLOPE } from '../../water/tsl/waterShorelineFieldTsl';
import { waterTideOffsetTsl } from '../../water/tsl/waterTideTsl';
import { TERRAIN_ATLAS_BIOME_INDEX } from '../atlas/atlasConstants';
import type { TerrainTextureSet } from '../loaders/loadTerrainTextures';
import {
  biomeAtlasTileGrads,
  sampleTiledAtlasWithGrad,
  terrainGridUv,
  terrainMapUv,
} from '../tsl/biomeAtlasUv';
import { computeSnowWeight } from '../tsl/snowDistributionTsl';
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
    chiseledWorldYAtWorldXZ,
    macroSlopeAtWorldXZ,
    simpleShading = false,
  } = inputs;
  const uniforms = splatUniforms as any;
  const {
    repeat,
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
    uShadeSunKeep,
    uBiomeMap,
    uOverlayMap,
    uPropAoMap,
    uPropAoEnabled,
    uPropAoStrength,
    uPropAoSunStrength,
    uWorldSize,
    uHeightScale,
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
    // Own-raster maps (prop AO, guide glow) are edge-aligned; the painted grids are node-aligned.
    const mapUv = terrainMapUv(uWorldSize, worldXZ);
    const gridUv = terrainGridUv(uWorldSize, worldXZ);
    const packConvexU = { uUseConvexMap, uConvexRidgeLight };
    // Painted land weights (shore, forest, hills, mountain) always sum to 1 after the bake.
    const hwUsed = uBiomeMap.sample(gridUv);

    // `.toVar()` pins each derivative to this point, in uniform control flow: left as expressions
    // they are emitted at first use, inside the `If` gates below, where dFdx/dFdy are undefined.
    const shoreGrads = biomeAtlasTileGrads(worldXZ, repeat.shore).toVar();
    const forestGrads = biomeAtlasTileGrads(worldXZ, repeat.forest).toVar();
    const hillsGrads = biomeAtlasTileGrads(worldXZ, repeat.hills).toVar();
    const mountainGrads = biomeAtlasTileGrads(worldXZ, repeat.mountain).toVar();
    const snowGrads = biomeAtlasTileGrads(worldXZ, repeat.snow).toVar();
    const meadowGrads = biomeAtlasTileGrads(worldXZ, repeat.meadow).toVar();
    const rockGrads = biomeAtlasTileGrads(worldXZ, repeat.rock).toVar();
    const pathGrads = biomeAtlasTileGrads(worldXZ, repeat.path).toVar();
    const waterGrads = biomeAtlasTileGrads(worldXZ, repeat.water).toVar();

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
    // One fetch for every per-cell overlay: R path, G meadow, B water, A convex (overlayChannels.ts).
    const overlay = uOverlayMap.sample(gridUv);
    const pathW = overlay.r;
    // Path wins over meadow: painted paths never overlap meadow, but the village writes roads and
    // yards into the path mask at runtime, often on meadow ground that would otherwise cover them.
    const meadowW = overlay.g.mul(float(1).sub(pathW));
    const waterW = overlay.b;
    const snowFaceXZ = chiseledFaceCentroidXZAtWorldXZ(worldXZ);
    const snowFaceN = knifeWorldNormalAtWorldXZ(worldXZ);
    const snowHeightNorm = chiseledWorldYAtWorldXZ(snowFaceXZ).div(uHeightScale);
    const snowW = computeSnowWeight(uniforms, snowHeightNorm, hwUsed, snowFaceXZ, snowFaceN).mul(
      float(1).sub(slopeRockDerivedTsl(snowFaceN)),
    );

    const mixOverlay = (weight: TslNode, worldRepeat: TslNode, index: TslNode, grads: TslNode) => {
      If(weight.greaterThan(overlayEps), () => {
        const rgb = sampleTiledAtlasWithGrad(uColorAtlas, worldXZ, worldRepeat, index, grads).rgb;
        albedoAcc.assign(mix(albedoAcc, rgb, weight));
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
    mixOverlay(pathW, repeat.path, idxPath, pathGrads);
    mixOverlay(meadowW, repeat.meadow, idxMeadow, meadowGrads);
    mixOverlay(waterW, repeat.water, idxWater, waterGrads);

    albedoAcc.assign(albedoAcc.mul(convexAlbedoMulTsl(overlay.a, packConvexU)));
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
      shadeSunKeep: uShadeSunKeep,
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
    // Rain (M8): wet ground is darker and richer, one uniform shared with props and grass.
    const wetGround = applyWetLookTsl(withWetness);
    if (import.meta.env.DEV) {
      return applyTerrainBiomeDebugOverlay(
        wetGround,
        vSurfaceWorldXZ,
        splatUniforms,
        slopeRockW,
        snowW,
      );
    }
    return wetGround;
  });

  return { colorNode: shadeFragment() };
}
