// src/world/terrain/material/biomeSplatShading.ts — solid-color faceted lighting for biome splat material
import {
  cross,
  Discard,
  dFdx,
  dFdy,
  dot,
  Fn,
  float,
  If,
  max,
  mix,
  normalize,
  positionWorld,
  select,
  step,
  vec3,
} from 'three/tsl';
import { playerGlowFalloffTerrain } from '../../../rendering/playerGlowTsl';
import { computeTerrainSunVisFloor } from '../../../rendering/sunShadow';
import { waterWaveUniforms } from '../../water/material/waterWaveUniforms';
import { applyWaterIntersectionFoamTsl } from '../../water/tsl/waterIntersectionFoamTsl';
import { terrainMapUv } from '../tsl/biomeAtlasUv';
import {
  computeSnowWeight,
  type createBiomeHeightWeights,
  resolvePaintedHwUsed,
} from '../tsl/biomeSplatWeights';
import { createMacroHeightTsl } from '../tsl/terrainMacroHeightTsl';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';
import { TERRAIN_SHADER_SLOPE_ROCK_START } from './biomeSplatUniforms';

type TslNode = any;

export interface BiomeSplatShadingInputs {
  uniforms: TerrainSplatUniforms;
  sunShadow: TslNode;
  vSurfaceWorldXZ: TslNode;
  biomeHeightWeights: ReturnType<typeof createBiomeHeightWeights>;
  /** Play LOD: same opacityFn as material.opacityNode — early-discard before splat. */
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
    vSurfaceWorldXZ,
    biomeHeightWeights,
    earlyDiscardOpacity,
    earlyDiscardThreshold,
  } = inputs;
  const earlyDiscardThresholdNode =
    earlyDiscardThreshold !== undefined ? float(earlyDiscardThreshold) : null;
  const uniforms = splatUniforms as any;
  const {
    solidColor,
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
  } = uniforms;
  const uSlopeRockStart = float(TERRAIN_SHADER_SLOPE_ROCK_START);

  const { sampleHeightNormAtWorldXZ } = createMacroHeightTsl(uniforms);

  const overlayEps = float(1e-3);

  const shadeFragment = Fn(() => {
    const worldPos = positionWorld;
    const nFaceRaw = normalize(cross((dFdx as any)(worldPos), (dFdy as any)(worldPos)));
    const nWorldLit = select(nFaceRaw.y.lessThan(0), nFaceRaw.negate(), nFaceRaw);

    const worldXZ = vSurfaceWorldXZ;
    if (earlyDiscardOpacity && earlyDiscardThresholdNode) {
      const layerOpacity = earlyDiscardOpacity(worldXZ);
      If(layerOpacity.lessThan(earlyDiscardThresholdNode), () => {
        Discard();
      });
    }
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

    const albedo = solidColor.shore
      .mul(hwUsed.x)
      .add(solidColor.forest.mul(hwUsed.y))
      .add(solidColor.hills.mul(hwUsed.z))
      .add(solidColor.mountain.mul(hwUsed.w));

    const slopeRock = float(1).sub(step(uSlopeRockStart, nWorldLit.y));
    const albedoRock = mix(albedo, solidColor.mountain, slopeRock);

    const snowW = computeSnowWeight(uniforms, heightNorm, hwUsed, worldXZ, nWorldLit);
    const pathW = step(float(0.5), uPathMap.sample(mapUv).r).mul(uUseBiomeMap);
    const meadowW = step(float(0.5), uMeadowMap.sample(mapUv).r).mul(uUseBiomeMap);

    const albedoAcc = albedoRock.toVar();
    If(snowW.greaterThan(overlayEps), () => {
      albedoAcc.assign((mix as any)(albedoAcc, solidColor.snow, snowW));
    });
    If(pathW.greaterThan(overlayEps), () => {
      albedoAcc.assign((mix as any)(albedoAcc, solidColor.path, pathW));
    });
    If(meadowW.greaterThan(overlayEps), () => {
      albedoAcc.assign((mix as any)(albedoAcc, solidColor.meadow, meadowW));
    });

    const albedoFinal = albedoAcc;
    const propOpen = uPropAoMap.sample(mapUv).r;
    const propAoAmt = float(1).sub(propOpen).mul(uPropAoEnabled) as TslNode;
    const propAo = (mix as any)(float(1), float(1).sub(uPropAoStrength), propAoAmt);
    const ndl = max(dot(nWorldLit, uSunDirection), 0);
    const sunVisFloor = computeTerrainSunVisFloor(sunShadow, uShadowFloor);
    const propSunMul = (mix as any)(float(1), float(1).sub(uPropAoSunStrength), propAoAmt);
    const sunVisWithPropAo = sunVisFloor.mul(propSunMul);
    const ambientTerm = uAmbientColor.mul(uAmbientIntensity).mul(propAo);
    const sunDiffuse = uSunColor.mul(uSunIntensity).mul(ndl).mul(sunVisWithPropAo);
    const baseLit = albedoFinal.mul(ambientTerm.add(sunDiffuse));

    const dist = worldPos.distance(uPlayerPos);
    const playerGlow = playerGlowFalloffTerrain(
      dist,
      uLightRadius,
      uLightIntensity,
      uPlayerGlowMul,
    );
    const glowLit = albedoFinal.mul(propAo).mul(playerGlow);

    const normalLit = baseLit.add(glowLit);
    const shadowDebug = mix(
      normalLit,
      vec3(sunVisWithPropAo as any, sunVisWithPropAo as any, sunVisWithPropAo as any),
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
