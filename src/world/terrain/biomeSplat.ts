// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/biomeSplat.ts — height/slope splat TSL + biome threshold uniforms (WebGPU)
import {
  Fn,
  attribute,
  clamp,
  cross,
  dot,
  float,
  max,
  mix,
  normalize,
  normalWorld,
  positionLocal,
  positionWorld,
  pow,
  shadow,
  smoothstep,
  texture,
  uniform,
  uniformArray,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { Color, Vector3, type DirectionalLight } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { WORLD } from '../WorldConfig';
import { getJourneyPathShaderSegments } from '../JourneyPath';
import { PHASE0 } from '../../config/phase0';
import { createPathBlendNodes } from './pathBlendTsl';
import type { TerrainTextureSet } from './loadTerrainTextures';

export interface BiomeSplatThresholds {
  waterMax: number;
  shoreMax: number;
  forestMax: number;
  hillsMax: number;
  blendWidth: number;
}

export function getBiomeSplatThresholds(): BiomeSplatThresholds {
  const { BIOMES } = WORLD;
  return {
    waterMax: BIOMES.WATER.max,
    shoreMax: BIOMES.SHORE.max,
    forestMax: BIOMES.FOREST.max,
    hillsMax: BIOMES.HILLS.max,
    blendWidth: 0.06,
  };
}

export interface TerrainSplatUniforms {
  uRepeat: ReturnType<typeof uniform>;
  uDispScale: ReturnType<typeof uniform>;
  uWaterMax: ReturnType<typeof uniform>;
  uShoreMax: ReturnType<typeof uniform>;
  uForestMax: ReturnType<typeof uniform>;
  uHillsMax: ReturnType<typeof uniform>;
  uBlendWidth: ReturnType<typeof uniform>;
  uSlopeRockStart: ReturnType<typeof uniform>;
  uNormalStrength: ReturnType<typeof uniform>;
  uAoStrength: ReturnType<typeof uniform>;
  uSpecularStrength: ReturnType<typeof uniform>;
  uPathRoughness: ReturnType<typeof uniform>;
  uPathAo: ReturnType<typeof uniform>;
  uPathTint: ReturnType<typeof uniform>;
  uPathBlendInner: ReturnType<typeof uniform>;
  uPathBlendOuter: ReturnType<typeof uniform>;
  uPathSegCount: ReturnType<typeof uniform>;
  uSunDirection: ReturnType<typeof uniform>;
  uSunColor: ReturnType<typeof uniform>;
  uSunIntensity: ReturnType<typeof uniform>;
  uAmbientColor: ReturnType<typeof uniform>;
  uAmbientIntensity: ReturnType<typeof uniform>;
  uViewCamPos: ReturnType<typeof uniform>;
  uPlayerPos: ReturnType<typeof uniform>;
  uLightRadius: ReturnType<typeof uniform>;
  uLightIntensity: ReturnType<typeof uniform>;
  uPlayerGlowMul: ReturnType<typeof uniform>;
  uDebugShadowView: ReturnType<typeof uniform>;
  uShadowFloor: ReturnType<typeof uniform>;
}

export type TerrainSplatMaterial = MeshBasicNodeMaterial & {
  terrainUniforms: TerrainSplatUniforms;
};

export function createBiomeSplatMaterial(
  textures: TerrainTextureSet,
  sun: DirectionalLight,
): TerrainSplatMaterial {
  const thresholds = getBiomeSplatThresholds();
  const { shore, forest, hills, rock, path } = textures;
  const pathSegs = getJourneyPathShaderSegments();
  const pathInner = WORLD.JOURNEY.PATH_SURFACE.WIDTH * 0.5;
  const pathOuter = pathInner + WORLD.JOURNEY.PATH_SURFACE.BLEND_SOFT;

  const uRepeat = uniform(PHASE0.TERRAIN_TEXTURE_REPEAT);
  const uDispScale = uniform(PHASE0.TERRAIN_DISPLACEMENT_SCALE);
  const uWaterMax = uniform(thresholds.waterMax);
  const uShoreMax = uniform(thresholds.shoreMax);
  const uForestMax = uniform(thresholds.forestMax);
  const uHillsMax = uniform(thresholds.hillsMax);
  const uBlendWidth = uniform(thresholds.blendWidth);
  const uSlopeRockStart = uniform(PHASE0.TERRAIN_SLOPE_ROCK_START);
  const uNormalStrength = uniform(PHASE0.TERRAIN_NORMAL_STRENGTH);
  const uAoStrength = uniform(PHASE0.TERRAIN_AO_STRENGTH);
  const uSpecularStrength = uniform(PHASE0.TERRAIN_SPECULAR_STRENGTH);
  const uPathRoughness = uniform(WORLD.JOURNEY.PATH_SURFACE.ROUGHNESS);
  const uPathAo = uniform(WORLD.JOURNEY.PATH_SURFACE.AO);
  const uPathTint = uniform(new Color(WORLD.JOURNEY.PATH_SURFACE.COLOR));
  const uPathBlendInner = uniform(pathInner);
  const uPathBlendOuter = uniform(pathOuter);
  const uPathSegCount = uniform(pathSegs.count);
  const uPathSegA = uniformArray(pathSegs.segA, 'vec2');
  const uPathSegB = uniformArray(pathSegs.segB, 'vec2');
  const uSunDirection = uniform(new Vector3(0.55, 0.75, 0.45).normalize());
  const uSunColor = uniform(new Color(0xffecd0));
  const uSunIntensity = uniform(0);
  const uAmbientColor = uniform(new Color(0xe8dfc8));
  const uAmbientIntensity = uniform(0.04);
  const uViewCamPos = uniform(new Vector3());
  const uPlayerPos = uniform(new Vector3());
  const uLightRadius = uniform(6);
  const uLightIntensity = uniform(2.2);
  const uPlayerGlowMul = uniform(PHASE0.GRASS.PLAYER_GLOW_MUL);
  const uDebugShadowView = uniform(0);
  const uShadowFloor = uniform(0.06);
  const sunShadow = shadow(sun);

  const terrainUniforms: TerrainSplatUniforms = {
    uRepeat,
    uDispScale,
    uWaterMax,
    uShoreMax,
    uForestMax,
    uHillsMax,
    uBlendWidth,
    uSlopeRockStart,
    uNormalStrength,
    uAoStrength,
    uSpecularStrength,
    uPathRoughness,
    uPathAo,
    uPathTint,
    uPathBlendInner,
    uPathBlendOuter,
    uPathSegCount,
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
  };

  const vPathW = varying(float());

  const { pathBlendWeight } = createPathBlendNodes({
    uPathSegCount,
    uPathSegA,
    uPathSegB,
    uPathBlendInner,
    uPathBlendOuter,
  });

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

  const vertUv = vec2(positionLocal.x, positionLocal.z).mul(uRepeat);
  const fragUv = vec2(positionWorld.x, positionWorld.z).mul(uRepeat);

  const uShore = texture(shore.color, fragUv);
  const uShoreNorm = texture(shore.normal, fragUv);
  const uShoreOrm = texture(shore.orm, fragUv);
  const uShoreDisp = texture(shore.displacement, vertUv);
  const uLandDisp = texture(forest.displacement, vertUv);
  const uForest = texture(forest.color, fragUv);
  const uForestNorm = texture(forest.normal, fragUv);
  const uForestOrm = texture(forest.orm, fragUv);
  const uHills = texture(hills.color, fragUv);
  const uHillsNorm = texture(hills.normal, fragUv);
  const uHillsOrm = texture(hills.orm, fragUv);
  const uRock = texture(rock.color, fragUv);
  const uRockNorm = texture(rock.normal, fragUv);
  const uRockOrm = texture(rock.orm, fragUv);
  const uPath = texture(path.color, fragUv);
  const uPathDisp = texture(path.displacement, vertUv);

  const sampleTangentNormal = Fn(([map, uvCoord]) => {
    const n = map.sample(uvCoord).xyz.mul(2).sub(1);
    n.xy.mulAssign(uNormalStrength);
    return normalize(n);
  });

  const displacedPosition = Fn(() => {
    const uv = vec2(positionLocal.x, positionLocal.z).mul(uRepeat);
    const hw = biomeHeightWeights(heightNorm, uBlendWidth);
    const landDisp = uLandDisp.sample(uv).r;
    const disp = hw.x
      .mul(uShoreDisp.sample(uv).r)
      .add(hw.y.add(hw.z).add(hw.w).mul(landDisp));
    const pathW = pathBlendWeight(vec2(positionLocal.x, positionLocal.z));
    vPathW.assign(pathW);
    const pathDisp = uPathDisp.sample(uv).r;
    const mixedDisp = mix(disp, pathDisp, pathW);
    const offsetY = mixedDisp.sub(0.5).mul(uDispScale);
    return positionLocal.add(vec3(0, offsetY, 0));
  });

  const shadeFragment = Fn(() => {
    const worldPos = positionWorld;
    const uv = vec2(worldPos.x, worldPos.z).mul(uRepeat);
    const hw = biomeHeightWeights(heightNorm, uBlendWidth);

    const shoreCol = uShore.sample(uv).rgb;
    const forestCol = uForest.sample(uv).rgb;
    const hillsCol = uHills.sample(uv).rgb;
    const rockCol = uRock.sample(uv).rgb;
    const albedo = shoreCol
      .mul(hw.x)
      .add(forestCol.mul(hw.y))
      .add(hillsCol.mul(hw.z))
      .add(rockCol.mul(hw.w));

    const nTS = normalize(
      sampleTangentNormal(uShoreNorm, uv)
        .mul(hw.x)
        .add(sampleTangentNormal(uForestNorm, uv).mul(hw.y))
        .add(sampleTangentNormal(uHillsNorm, uv).mul(hw.z))
        .add(sampleTangentNormal(uRockNorm, uv).mul(hw.w)),
    );

    const worldNormal = normalize(normalWorld);
    const up = vec3(0, 1, 0);
    const T = normalize(cross(up, worldNormal));
    const B = cross(worldNormal, T);
    const nWorld = normalize(T.mul(nTS.x).add(B.mul(nTS.y)).add(worldNormal.mul(nTS.z)));

    const shoreOrm = uShoreOrm.sample(uv).rgb;
    const forestOrm = uForestOrm.sample(uv).rgb;
    const hillsOrm = uHillsOrm.sample(uv).rgb;
    const rockOrm = uRockOrm.sample(uv).rgb;
    const blendedOrm = shoreOrm
      .mul(hw.x)
      .add(forestOrm.mul(hw.y))
      .add(hillsOrm.mul(hw.z))
      .add(rockOrm.mul(hw.w));
    const slopeRock = float(1).sub(
      smoothstep(uSlopeRockStart.sub(0.12), uSlopeRockStart, nWorld.y),
    );
    const pathW = vPathW;
    const albedoRock = mix(albedo, rockCol, slopeRock.mul(0.85));

    const pathCol = uPath.sample(uv).rgb.mul(uPathTint);
    const albedoFinal = mix(albedoRock, pathCol, pathW);
    const roughness = mix(
      mix(blendedOrm.x, rockOrm.x, slopeRock.mul(0.85)),
      uPathRoughness,
      pathW,
    );
    const ao = mix(
      mix(blendedOrm.y, rockOrm.y, slopeRock.mul(0.85)),
      uPathAo,
      pathW,
    );
    const rockMetal = mix(blendedOrm.z, rockOrm.z, slopeRock.mul(0.85));

    // Stylized specular boost from ORM metalness (not PBR); tune if switching to StandardNodeMaterial.
    const metalFactor = mix(float(1), rockMetal.mul(2), hw.w.add(slopeRock.mul(0.5)));
    const aoTerm = mix(float(1), ao, uAoStrength);
    const ndl = max(dot(nWorld, uSunDirection), 0);
    const V = normalize(uViewCamPos.sub(worldPos));
    const H = normalize(uSunDirection.add(V));
    const ndh = max(dot(nWorld, H), 0);
    const specPower = mix(float(32), float(4), clamp(roughness, 0, 1));
    const spec = pow(ndh, specPower).mul(float(1).sub(roughness)).mul(metalFactor);
    // shadow() returns vec3 visibility (1 = lit). Apply shadow only to direct sun terms;
    // ambient still reaches shadowed surfaces so they read as occluded-but-not-black.
    const sunVis = float(sunShadow.r);
    // Soft-floor visibility so even fully occluded areas keep a hint of bounce.
    const sunVisFloor = mix(uShadowFloor, float(1), sunVis);
    const ambientTerm = uAmbientColor.mul(uAmbientIntensity).mul(aoTerm);
    const sunDiffuse = uSunColor.mul(uSunIntensity).mul(ndl).mul(sunVisFloor);
    const diffuse = albedoFinal.mul(ambientTerm.add(sunDiffuse));
    const specular = uSunColor
      .mul(uSunIntensity)
      .mul(spec)
      .mul(uSpecularStrength)
      .mul(sunVisFloor);
    const baseLit = diffuse.add(specular);

    const dist = worldPos.distance(uPlayerPos);
    const playerFalloff = float(1).sub(smoothstep(float(0), uLightRadius, dist));
    // Cap the glow factor so the aura cannot dwarf shadow contrast. At full
    // energy uLightIntensity reaches ~7 which (uncapped) erases shadow detail
    // across the entire ~48u falloff radius.
    const playerGlow = clamp(
      playerFalloff.mul(uLightIntensity).mul(uPlayerGlowMul),
      0,
      0.6,
    );
    const glowLit = albedoFinal.mul(aoTerm).mul(playerGlow);

    // Additive composite so shadows are not erased by the bright player aura.
    // (Was max(baseLit, glowLit) — that masked shadows wherever glow > shadowed sun.)
    const normalLit = baseLit.add(glowLit);
    // Debug view: when uDebugShadowView>=1, paint raw shadow visibility (1=lit, 0=shadowed) as grayscale.
    return mix(normalLit, vec3(sunVisFloor, sunVisFloor, sunVisFloor), uDebugShadowView);
  });

  const material = new MeshBasicNodeMaterial() as TerrainSplatMaterial;
  material.lights = false;
  material.positionNode = displacedPosition();
  material.receivedShadowPositionNode = positionWorld;
  material.colorNode = shadeFragment();
  material.terrainUniforms = terrainUniforms;

  return material;
}
