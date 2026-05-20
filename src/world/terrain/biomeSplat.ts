// src/world/terrain/biomeSplat.ts — height/slope splat GLSL + biome threshold uniforms

import { WORLD } from '../WorldConfig';
import { pathBlendGlsl } from './pathBlendGlsl';

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

/** Shared height weights (vertex + fragment). */
export const biomeHeightWeightsGlsl = /* glsl */`
  vec4 biomeHeightWeights(float h, float blend) {
    float wShore = smoothstep(uWaterMax, uWaterMax + blend, h)
      * (1.0 - smoothstep(uShoreMax - blend, uShoreMax, h));
    float wForest = smoothstep(uShoreMax - blend, uShoreMax, h)
      * (1.0 - smoothstep(uForestMax - blend, uForestMax, h));
    float wHills = smoothstep(uForestMax - blend, uForestMax, h)
      * (1.0 - smoothstep(uHillsMax - blend, uHillsMax, h));
    float wRockH = smoothstep(uHillsMax - blend, uHillsMax, h);
    float sum = wShore + wForest + wHills + wRockH + 0.0001;
    return vec4(wShore, wForest, wHills, wRockH) / sum;
  }
`;

export const biomeSplatVertex = /* glsl */`
  attribute float heightNorm;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  varying float vHeightNorm;

  uniform float uRepeat;
  uniform float uDispScale;
  uniform float uWaterMax;
  uniform float uShoreMax;
  uniform float uForestMax;
  uniform float uHillsMax;
  uniform float uBlendWidth;

  uniform sampler2D uShoreDisp;
  /** Forest/hills/rock share one displacement map to stay within 16 texture units. */
  uniform sampler2D uLandDisp;
  uniform sampler2D uPathDisp;

  ${biomeHeightWeightsGlsl}
  ${pathBlendGlsl}

  void main() {
    vec2 uv = vec2(position.x, position.z) * uRepeat;
    vec4 hw = biomeHeightWeights(heightNorm, uBlendWidth);

    float landDisp = texture2D(uLandDisp, uv).r;
    float disp =
      hw.x * texture2D(uShoreDisp, uv).r +
      (hw.y + hw.z + hw.w) * landDisp;

    float pathW = pathBlendWeight(vec2(position.x, position.z));
    float pathDisp = texture2D(uPathDisp, uv).r;
    disp = mix(disp, pathDisp, pathW);

    vec3 pos = position;
    pos.y += (disp - 0.5) * uDispScale;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;
    vHeightNorm = heightNorm;

    vec3 worldNormal = normalize(mat3(modelMatrix) * normal);
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 T = normalize(cross(up, worldNormal));
    if (dot(T, T) < 1e-6) T = vec3(1.0, 0.0, 0.0);
    vec3 B = cross(worldNormal, T);
    vTangent = T;
    vBitangent = B;
    vWorldNormal = worldNormal;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const biomeSplatFragmentHeader = /* glsl */`
  precision highp float;

  varying vec3 vWorldPosition;
  varying vec3 vWorldNormal;
  varying vec3 vTangent;
  varying vec3 vBitangent;
  varying float vHeightNorm;

  uniform float uRepeat;
  uniform float uWaterMax;
  uniform float uShoreMax;
  uniform float uForestMax;
  uniform float uHillsMax;
  uniform float uBlendWidth;
  uniform float uSlopeRockStart;
  uniform float uNormalStrength;
  uniform float uAoStrength;
  uniform float uSpecularStrength;

  uniform sampler2D uShore;
  uniform sampler2D uShoreNorm;
  uniform sampler2D uShoreOrm;

  uniform sampler2D uForest;
  uniform sampler2D uForestNorm;
  uniform sampler2D uForestOrm;

  uniform sampler2D uHills;
  uniform sampler2D uHillsNorm;
  uniform sampler2D uHillsOrm;

  uniform sampler2D uRock;
  uniform sampler2D uRockNorm;
  uniform sampler2D uRockOrm;

  uniform sampler2D uPath;
  uniform vec3 uPathTint;
  uniform float uPathRoughness;
  uniform float uPathAo;

  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uSunIntensity;
  uniform vec3 uAmbientColor;
  uniform float uAmbientIntensity;
  uniform vec3 uViewCamPos;

  ${biomeHeightWeightsGlsl}
  ${pathBlendGlsl}

  vec3 sampleTangentNormal(sampler2D map, vec2 uv) {
    vec3 n = texture2D(map, uv).xyz * 2.0 - 1.0;
    n.xy *= uNormalStrength;
    return normalize(n);
  }
`;

export const biomeSplatFragmentMain = /* glsl */`
  void main() {
    vec2 uv = vWorldPosition.xz * uRepeat;

    vec4 hw = biomeHeightWeights(vHeightNorm, uBlendWidth);

    vec3 shoreCol = texture2D(uShore, uv).rgb;
    vec3 forestCol = texture2D(uForest, uv).rgb;
    vec3 hillsCol = texture2D(uHills, uv).rgb;
    vec3 rockCol = texture2D(uRock, uv).rgb;

    vec3 albedo = hw.x * shoreCol + hw.y * forestCol + hw.z * hillsCol + hw.w * rockCol;

    vec3 nTS =
      hw.x * sampleTangentNormal(uShoreNorm, uv) +
      hw.y * sampleTangentNormal(uForestNorm, uv) +
      hw.z * sampleTangentNormal(uHillsNorm, uv) +
      hw.w * sampleTangentNormal(uRockNorm, uv);
    nTS = normalize(nTS);

    mat3 tbn = mat3(vTangent, vBitangent, vWorldNormal);
    vec3 nWorld = normalize(tbn * nTS);

    vec3 shoreOrm = texture2D(uShoreOrm, uv).rgb;
    vec3 forestOrm = texture2D(uForestOrm, uv).rgb;
    vec3 hillsOrm = texture2D(uHillsOrm, uv).rgb;
    vec3 rockOrm = texture2D(uRockOrm, uv).rgb;

    vec3 blendedOrm = hw.x * shoreOrm + hw.y * forestOrm + hw.z * hillsOrm + hw.w * rockOrm;
    float roughness = blendedOrm.r;
    float ao = blendedOrm.g;
    float rockMetal = blendedOrm.b;

    float slopeRock = 1.0 - smoothstep(uSlopeRockStart - 0.12, uSlopeRockStart, vWorldNormal.y);
    albedo = mix(albedo, rockCol, slopeRock * 0.85);
    roughness = mix(roughness, rockOrm.r, slopeRock * 0.85);
    ao = mix(ao, rockOrm.g, slopeRock * 0.85);
    rockMetal = mix(rockMetal, rockOrm.b, slopeRock * 0.85);

    float pathW = pathBlendWeight(vWorldPosition.xz);
    vec3 pathCol = texture2D(uPath, uv).rgb * uPathTint;

    albedo = mix(albedo, pathCol, pathW);
    roughness = mix(roughness, uPathRoughness, pathW);
    ao = mix(ao, uPathAo, pathW);

    float metalFactor = mix(1.0, rockMetal * 2.0, hw.w + slopeRock * 0.5);

    float aoTerm = mix(1.0, ao, uAoStrength);

    float ndl = max(dot(nWorld, uSunDirection), 0.0);
    vec3 V = normalize(uViewCamPos - vWorldPosition);
    vec3 H = normalize(uSunDirection + V);
    float ndh = max(dot(nWorld, H), 0.0);
    float specPower = mix(32.0, 4.0, clamp(roughness, 0.0, 1.0));
    float spec = pow(ndh, specPower) * (1.0 - roughness) * metalFactor;

    vec3 diffuse = albedo * (uAmbientColor * uAmbientIntensity * aoTerm + uSunColor * uSunIntensity * ndl);
    vec3 specular = uSunColor * uSunIntensity * spec * uSpecularStrength;
    vec3 lit = diffuse + specular;

    gl_FragColor = vec4(lit, 1.0);
  }
`;

export const biomeSplatFragmentShader = [
  biomeSplatFragmentHeader,
  biomeSplatFragmentMain,
].join('\n');
