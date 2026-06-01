// @ts-nocheck — TSL Fn parameter typings incomplete in r176
// src/world/terrain/biomeSplatDisplacement.ts — vertex displacement node for biome splat material
import {
  Fn,
  attribute,
  float,
  mix,
  positionLocal,
  smoothstep,
  texture,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import type { TerrainTextureSet } from './loadTerrainTextures';
import type { TerrainSplatUniforms } from './biomeSplatUniforms';

export interface BiomeSplatDisplacementInputs {
  uniforms: TerrainSplatUniforms;
  textures: TerrainTextureSet;
}

export interface BiomeSplatDisplacementOutputs {
  /** Vertex node — assign to `material.positionNode`. */
  positionNode: unknown;
  /** Varying carrying the path blend weight from vertex to fragment shader. */
  vPathW: ReturnType<typeof varying>;
  /** Fragment-side reusable Fn that returns the biome height weight vec4 (wShore, wForest, wHills, wRock). */
  biomeHeightWeights: ReturnType<typeof Fn>;
}

export function buildBiomeSplatDisplacement(
  inputs: BiomeSplatDisplacementInputs,
): BiomeSplatDisplacementOutputs {
  const { uniforms, textures } = inputs;
  const {
    uRepeat,
    uDispScale,
    uWaterMax,
    uShoreMax,
    uForestMax,
    uHillsMax,
    uBlendWidth,
    uBiomeMap,
    uPathMap,
    uUseBiomeMap,
    uWorldSize,
  } = uniforms;
  const { shore, forest, path } = textures;

  const vPathW = varying(float());

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

  const uShoreDisp = texture(shore.displacement, vertUv);
  const uLandDisp = texture(forest.displacement, vertUv);
  const uPathDisp = texture(path.displacement, vertUv);

  const displacedPosition = Fn(() => {
    const uv = vec2(positionLocal.x, positionLocal.z).mul(uRepeat);
    const mapUv = vec2(positionLocal.x, positionLocal.z).div(uWorldSize).add(0.5);
    const painted = uBiomeMap.sample(mapUv);
    const heightWeights = biomeHeightWeights(heightNorm, uBlendWidth);
    const hw = mix(heightWeights, painted, uUseBiomeMap);
    const landDisp = uLandDisp.sample(uv).r;
    const disp = hw.x
      .mul(uShoreDisp.sample(uv).r)
      .add(hw.y.add(hw.z).add(hw.w).mul(landDisp));
    const pathMask = uPathMap.sample(mapUv).r;
    const pathW = pathMask.mul(uUseBiomeMap);
    vPathW.assign(pathW);
    const pathDisp = uPathDisp.sample(uv).r;
    const mixedDisp = mix(disp, pathDisp, pathW);
    const offsetY = mixedDisp.sub(0.5).mul(uDispScale);
    return positionLocal.add(vec3(0, offsetY, 0));
  });

  return {
    positionNode: displacedPosition(),
    vPathW,
    biomeHeightWeights,
  };
}
