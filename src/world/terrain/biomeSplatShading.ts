// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/biomeSplatShading.ts — fragment lighting + path blend for biome splat material
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
  positionWorld,
  pow,
  smoothstep,
  texture,
  varying,
  vec2,
  vec3,
} from 'three/tsl';
import { playerGlowFalloffTerrain } from '../../rendering/playerGlowTsl';
import type { TerrainTextureSet } from './loadTerrainTextures';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';

export interface BiomeSplatShadingInputs {
  uniforms: TerrainSplatUniforms;
  sunShadow: unknown;
  textures: TerrainTextureSet;
  vPathW: ReturnType<typeof varying>;
  biomeHeightWeights: ReturnType<typeof Fn>;
}

export interface BiomeSplatShadingOutputs {
  /** Final fragment color node — assign to `material.colorNode`. */
  colorNode: unknown;
}

export function buildBiomeSplatShading(
  inputs: BiomeSplatShadingInputs,
): BiomeSplatShadingOutputs {
  const { uniforms, sunShadow, textures, vPathW, biomeHeightWeights } = inputs;
  const {
    uRepeat,
    uBlendWidth,
    uSlopeRockStart,
    uNormalStrength,
    uAoStrength,
    uSpecularStrength,
    uPathRoughness,
    uPathAo,
    uPathTint,
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
  } = uniforms;
  const { shore, forest, hills, rock, path } = textures;

  const fragUv = vec2(positionWorld.x, positionWorld.z).mul(uRepeat);

  const uShore = texture(shore.color, fragUv);
  const uShoreNorm = texture(shore.normal, fragUv);
  const uShoreOrm = texture(shore.orm, fragUv);
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

  const heightNorm = attribute('heightNorm', 'float');

  const sampleTangentNormal = Fn(([map, uvCoord]) => {
    const n = map.sample(uvCoord).xyz.mul(2).sub(1);
    n.xy.mulAssign(uNormalStrength);
    return normalize(n);
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
    const playerGlow = playerGlowFalloffTerrain(
      dist,
      uLightRadius,
      uLightIntensity,
      uPlayerGlowMul,
    );
    const glowLit = albedoFinal.mul(aoTerm).mul(playerGlow);

    // Additive composite so shadows are not erased by the bright player aura.
    // (Was max(baseLit, glowLit) — that masked shadows wherever glow > shadowed sun.)
    const normalLit = baseLit.add(glowLit);
    // Debug view: when uDebugShadowView>=1, paint raw shadow visibility (1=lit, 0=shadowed) as grayscale.
    return mix(normalLit, vec3(sunVisFloor, sunVisFloor, sunVisFloor), uDebugShadowView);
  });

  return { colorNode: shadeFragment() };
}
