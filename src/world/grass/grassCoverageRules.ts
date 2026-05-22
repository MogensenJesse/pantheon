// src/world/grass/grassCoverageRules.ts — CPU mirror of terrain landGrassMask rules
import { devSettings } from '../../core/GameState';
import { PHASE0 } from '../../config/phase0';
import { distanceToJourneyPath } from '../JourneyPath';
import { getBiomeSplatThresholds } from '../terrain/biomeSplat';
import { WORLD, LANDMARK_XZ_POSITIONS } from '../WorldConfig';

const { GRASS: G } = PHASE0;

export interface BiomeHeightWeights {
  wShore: number;
  wForest: number;
  wHills: number;
  wRock: number;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Same height→biome weights as `biomeHeightWeights` in biomeSplat.ts. */
export function computeBiomeHeightWeights(heightNorm: number): BiomeHeightWeights {
  const { waterMax, shoreMax, forestMax, hillsMax, blendWidth } = getBiomeSplatThresholds();
  const blend = blendWidth;
  const wShore =
    smoothstep(waterMax, waterMax + blend, heightNorm) *
    (1 - smoothstep(shoreMax - blend, shoreMax, heightNorm));
  const wForest =
    smoothstep(shoreMax - blend, shoreMax, heightNorm) *
    (1 - smoothstep(forestMax - blend, forestMax, heightNorm));
  const wHills =
    smoothstep(forestMax - blend, forestMax, heightNorm) *
    (1 - smoothstep(hillsMax - blend, hillsMax, heightNorm));
  const wRockH = smoothstep(hillsMax - blend, hillsMax, heightNorm);
  const sum = wShore + wForest + wHills + wRockH + 0.0001;
  return {
    wShore: wShore / sum,
    wForest: wForest / sum,
    wHills: wHills / sum,
    wRock: wRockH / sum,
  };
}

function shoreForestHillBlend(hw: BiomeHeightWeights, heightNorm: number): number {
  const { shoreMax, blendWidth } = getBiomeSplatThresholds();
  const shoreUpper = smoothstep(shoreMax * 0.55, shoreMax - blendWidth * 0.5, heightNorm);
  return hw.wShore * shoreUpper * (hw.wForest + hw.wHills);
}

function tooCloseLandmarks(x: number, z: number, clearance: number): boolean {
  const minSq = clearance * clearance;
  for (const [lx, lz] of LANDMARK_XZ_POSITIONS) {
    const dx = lx - x;
    const dz = lz - z;
    if (dx * dx + dz * dz < minSq) return true;
  }
  return false;
}

function cellNoise(i: number, j: number): number {
  const n = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return (n - Math.floor(n)) * 0.3 + 0.7;
}

/** Low-frequency lush/sparse patches (~20 m scale on 200 m world). */
export function patchNoiseMultiplier(x: number, z: number, enabled = true): number {
  if (!enabled) return 1;
  const s = G.PATCH_NOISE_SCALE;
  const n1 = Math.sin(x * s + z * s * 0.71) * 43758.5453;
  const n2 = Math.sin(x * s * 1.93 + z * s * 2.17 + 17.3) * 12345.6789;
  const h = ((n1 - Math.floor(n1)) + (n2 - Math.floor(n2))) * 0.5;
  const strength = devSettings.grass.patchNoiseEnabled ? G.PATCH_NOISE_STRENGTH : 0;
  const lush = 0.55 + h * 0.45;
  return 1 - strength * (1 - lush);
}

/**
 * Blade density ∈ [0, 1] for a world XZ sample.
 * Forest + hills full; sparse upper-shore→land blend; zero on wet shore, path, water, rock.
 */
export function sampleGrassCoverageDensity(
  x: number,
  z: number,
  heightNorm: number,
  slopeY: number,
  globalScale = 1,
): number {
  const { waterMax } = getBiomeSplatThresholds();
  if (heightNorm < waterMax) return 0;

  const hw = computeBiomeHeightWeights(heightNorm);
  const notRock = 1 - Math.min(1, hw.wRock * 1.35);
  const shoreBlend = shoreForestHillBlend(hw, heightNorm);
  let base = Math.min(1, hw.wForest + hw.wHills + shoreBlend * G.SHORE_GRASS_SPARSITY);
  base *= notRock;

  const slopeGrass = smoothstep(0.32, 0.58, slopeY);
  base *= slopeGrass;

  // Mirror terrain `pathBlendWeight` + `clearOfPath` in biomeSplat.ts (pathW high on trail).
  const pathDist = distanceToJourneyPath(x, z);
  const pathInner = WORLD.JOURNEY.PATH_SURFACE.WIDTH * 0.5;
  const pathOuter = pathInner + WORLD.JOURNEY.PATH_SURFACE.BLEND_SOFT;
  const pathW = 1 - smoothstep(pathInner, pathOuter, pathDist);
  const clearOfPath = 1 - smoothstep(0.55, 0.98, pathW);
  base *= clearOfPath;

  if (tooCloseLandmarks(x, z, 2.5)) return 0;

  const gridI = Math.floor((x + WORLD.SIZE * 0.5) / (WORLD.SIZE / G.GRID_RES));
  const gridJ = Math.floor((z + WORLD.SIZE * 0.5) / (WORLD.SIZE / G.GRID_RES));
  base *= cellNoise(gridI, gridJ);
  base *= patchNoiseMultiplier(x, z);

  return Math.max(0, Math.min(1, base * globalScale));
}
