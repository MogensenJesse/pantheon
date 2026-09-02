// src/world/grass/tsl/grassBladeLookTsl.ts — Revo blade color, fake AO, grazing sheen + transmission
import {
  cameraPosition,
  clamp,
  cos,
  float,
  mix,
  normalize,
  PI2,
  saturate,
  sin,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import type { TslNode } from './tslNode';

/** Dark → green → rust/warm, then tip mix. `positionNoise` is 0–1. */
export function mixGrassBladeColor(bladeHeight: TslNode, positionNoise: TslNode): TslNode {
  const {
    uBaseColorDark,
    uBaseColor,
    uTipColor,
    uRustColor,
    uWarmColor,
    uColorMixFactor,
    uColorVariationStrength,
    uRustVariationStrength,
    uWarmVariationStrength,
  } = grassSharedUniforms as any;

  const colorVariation = (mix as any)(float(1), positionNoise, uColorVariationStrength);
  const greenColor = (mix as any)(uBaseColorDark, uBaseColor, colorVariation);
  const rustMask = positionNoise
    .mul(float(1).sub(positionNoise))
    .mul(4)
    .mul(uRustVariationStrength);
  const warmMask = (clamp as any)(positionNoise.sub(0.6).mul(2.5), float(0), float(1)).mul(
    uWarmVariationStrength,
  );
  const bladeColor = (mix as any)(
    (mix as any)(greenColor, uRustColor, rustMask),
    uWarmColor,
    warmMask,
  );
  return (mix as any)(
    bladeColor,
    uTipColor,
    (smoothstep as any)(float(0.25), float(1), bladeHeight).mul(uColorMixFactor),
  );
}

/**
 * Proximity (near player) × edge rim × root. Needs strip UVs with left u=0, right u=1.
 * Returns 0–1 multiply (1 = fully lit).
 */
export function grassBladeOcclusion(bladeUv: TslNode, offsetX: TslNode, offsetZ: TslNode): TslNode {
  const { uAoScale, uAoRimSmoothness, uAoRadius } = grassSharedUniforms as any;
  const distanceSquared = offsetX.mul(offsetX).add(offsetZ.mul(offsetZ));
  const aoRadiusSquared = uAoRadius.mul(uAoRadius);
  const proximityMask = float(1).sub(
    (smoothstep as any)(float(0), aoRadiusSquared, distanceSquared),
  );
  const proximityOcclusion = uAoScale.mul(0.25).mul(proximityMask);
  const edgeDistance = bladeUv.x.mul(2).sub(1).abs();
  const edgeMask = (smoothstep as any)(uAoRimSmoothness.negate(), uAoRimSmoothness, edgeDistance);
  const rootMask = float(1).sub((smoothstep as any)(float(0.1), float(0.85), bladeUv.y));
  return float(1).sub(proximityOcclusion.mul(edgeMask).mul(rootMask));
}

export interface GrassBladeSheenParams {
  lit: TslNode;
  albedo: TslNode;
  bladeHash: TslNode;
  bladeHeight: TslNode;
  worldPosition: TslNode;
}

/** Additive grazing sheen + view-sun transmission on top of wrap/PCSS. */
export function applyGrassBladeSheenTransmission(params: GrassBladeSheenParams): TslNode {
  const { uSunDirection, uSunColor, uSunIntensity, uSheenStrength, uTransmissionStrength } =
    grassSharedUniforms as any;

  const bladeAngle = params.bladeHash.mul(53.3).fract().mul(PI2);
  const restingNormal = vec3(cos(bladeAngle), 0, sin(bladeAngle));
  const viewDirection = normalize(cameraPosition.sub(params.worldPosition));
  const grazing = float(1).sub(restingNormal.dot(viewDirection).abs().clamp());
  const localBacklight = saturate(restingNormal.dot(uSunDirection).negate());
  const sunRayXz = normalize(vec2(uSunDirection.x, uSunDirection.z)).negate();
  const viewXz = normalize(vec2(viewDirection.x, viewDirection.z));
  const viewSunAlignment = viewXz.dot(sunRayXz).mul(0.5).add(0.5).clamp();

  const grazingSheen = grazing
    .mul(grazing)
    .mul((mix as any)(float(0.25), float(1), viewSunAlignment))
    .mul(uSheenStrength);
  const transmission = viewSunAlignment
    .mul((mix as any)(float(0.35), float(1), localBacklight))
    .mul(uTransmissionStrength);
  const sunLit = (smoothstep as any)(float(0), float(0.04), uSunIntensity);
  const detailStrength = (smoothstep as any)(float(0.1), float(0.9), params.bladeHeight).mul(
    sunLit,
  );
  const sheenColor = uSunColor.mul(uSunIntensity).mul(grazingSheen).mul(detailStrength);
  const transmittedColor = (mix as any)(params.albedo, uSunColor, float(0.55)).mul(
    transmission.mul(detailStrength),
  );
  return params.lit.add(sheenColor).add(transmittedColor);
}
