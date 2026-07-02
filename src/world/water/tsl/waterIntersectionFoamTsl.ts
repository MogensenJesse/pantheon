// src/world/water/tsl/waterIntersectionFoamTsl.ts — shore stripe synced to tidal water + XZ ripples

import { Fn, float, mix, sin, smoothstep, sub, time } from 'three/tsl';
import {
  getValleyFogAreaNode,
  getValleyFogUniforms,
} from '../../../rendering/atmosphere/valleyFog';
import type { WaterWaveUniforms } from '../waterWaveUniforms';
import { waterFoamWaterlineHeightAtXzTsl } from './waterTideTsl';

type TslNode = any;

const STRIPE_EDGE_M = 0.01;

/** Slower patch field [0,1] — drives thick/opaque vs thin/translucent foam along the shore. */
function waterFoamPatchMaskTsl(worldXZ: TslNode, wave: WaterWaveUniforms) {
  const t = time.mul(wave.uFoamRippleSpeed.mul(0.28));
  const scale = wave.uFoamPatchScale;
  const blobA = sin(worldXZ.x.mul(scale).add(t.mul(0.65)))
    .mul(sin(worldXZ.y.mul(scale.mul(1.13)).add(t.mul(0.45))))
    .mul(0.6);
  const blobB = sin(worldXZ.x.mul(scale.mul(1.9)).sub(t.mul(0.9))).mul(0.25);
  const blobC = sin(worldXZ.y.mul(scale.mul(2.4)).add(t.mul(1.1))).mul(0.2);
  const raw = blobA.add(blobB).add(blobC).mul(0.5).add(0.5).clamp(0, 1);
  return mix(float(1), raw, wave.uFoamPatchVariation);
}

/**
 * Animated intersection foam on terrain (difference of two smoothstep bands).
 * `worldXZ` must be macro surface XZ (vSurfaceWorldXZ) — matches water vertex ripple sampling.
 * `worldY` is displaced terrain height where the stripe is painted.
 */
export const applyWaterIntersectionFoamTsl = Fn(([baseColor, worldY, worldXZ, wave]: TslNode[]) => {
  const patch = waterFoamPatchMaskTsl(worldXZ, wave);
  const depthScale = mix(wave.uFoamDepthMinRatio, float(1), patch);
  const foamOpacity = mix(wave.uFoamOpacityMin, float(1), patch);
  const stripeDepth = wave.uFoamDepth.mul(depthScale);

  const fogArea = getValleyFogAreaNode();
  const fogU = getValleyFogUniforms();
  const coastRelief = float(1).sub(wave.uShoreFogBypass.mul(0.4));
  const fogVisibility =
    fogArea !== null
      ? float(1).sub(fogArea.mul(wave.uFoamFogHazeStrength.mul(coastRelief)))
      : float(1);
  const foamColor =
    fogArea !== null && fogU !== null
      ? mix(
          wave.uFoamColor,
          (fogU as TslNode).uFogColor,
          fogArea.mul(wave.uFoamFogColorTint) as TslNode,
        )
      : wave.uFoamColor;

  const currentWaterHeight = waterFoamWaterlineHeightAtXzTsl(wave.uWaterY, wave, worldXZ);
  const edge = float(STRIPE_EDGE_M);
  const inner = smoothstep(currentWaterHeight.sub(edge), currentWaterHeight.add(edge), worldY);
  const outer = smoothstep(
    currentWaterHeight.add(stripeDepth).sub(edge),
    currentWaterHeight.add(stripeDepth).add(edge),
    worldY,
  );
  const stripe = sub(inner, outer).mul(foamOpacity).mul(fogVisibility);

  const darkened = baseColor.sub(stripe);
  const withStripe = mix(darkened, foamColor, stripe as TslNode);
  return mix(baseColor, withStripe, wave.uTideEnabled as TslNode);
});
