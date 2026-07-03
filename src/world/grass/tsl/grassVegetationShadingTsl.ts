// src/world/grass/tsl/grassVegetationShadingTsl.ts — shared wrap/hemi + sun + night for grass and flowers
import { float, mix, smoothstep } from 'three/tsl';
import { computeEffectiveSunShadowFloor, type SunShadowNode } from '../../../rendering/sunShadow';
import {
  applyFoliageBacklight,
  applyFoliageWrapHemisphere,
  computeBacklightShadowLift,
  computeBacklightShadowMul,
  computeFoliageFacing,
} from '../../../rendering/tsl/foliageWrapHemisphereTsl';
import { grassSharedUniforms } from '../config/grassUniforms';
import { applyGrassNightLighting } from './grassNightLightingTsl';
import type { TslNode } from './tslNode';

export type GrassVegetationBacklightMode = 'full' | 'shadow-only';
export type GrassVegetationNightMode = 'player-glow' | 'simple-dim';

export interface GrassVegetationShadingParams {
  albedo: TslNode;
  wrapNormal: TslNode;
  bladeNormalWorld?: TslNode;
  thickness: TslNode;
  sunShadow: SunShadowNode;
  backlightMode: GrassVegetationBacklightMode;
  /** Optional facing multiplier for flower petals (default 1). */
  backlightFacingMul?: TslNode;
  nightMode: GrassVegetationNightMode;
  offsetX: TslNode;
  offsetZ: TslNode;
}

export function applyGrassVegetationShading(params: GrassVegetationShadingParams): TslNode {
  const {
    uSunDirection,
    uShadowFloor,
    uSunIntensity,
    uBacklightPunchThrough,
    uDaylight,
    uNightSkyDaylight,
    uNightColorFloor,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
    uWrapStrength,
    uHemisphereStrength,
    uSkyTint,
    uGroundTint,
    uSunColor,
    uBacklightStrength,
    uBacklightTint,
  } = grassSharedUniforms as any;

  const shaped = applyFoliageWrapHemisphere(
    params.albedo,
    params.wrapNormal,
    uSunDirection,
    uWrapStrength,
    uHemisphereStrength,
    uSkyTint,
    uGroundTint,
    float(1),
  );
  const shadowMul = computeEffectiveSunShadowFloor(params.sunShadow, uShadowFloor, uSunIntensity);

  let shaded: TslNode;
  if (params.backlightMode === 'full' && params.bladeNormalWorld) {
    const facingMul = params.backlightFacingMul ?? float(1);
    const facing = computeFoliageFacing(
      params.bladeNormalWorld,
      params.thickness,
      uSunDirection,
      float(1),
      facingMul,
    );
    const backlight = applyFoliageBacklight(
      params.albedo,
      facing,
      uSunColor,
      uSunIntensity,
      uBacklightStrength,
      uBacklightTint,
    );
    const shadowLift = computeBacklightShadowLift(facing, shadowMul, uBacklightPunchThrough);
    const backlightShadow = computeBacklightShadowMul(shadowMul, uBacklightPunchThrough);
    shaded = shaped.mul(shadowLift).add(backlight.mul(backlightShadow));
  } else {
    shaded = shaped.mul(shadowMul);
  }

  if (params.nightMode === 'simple-dim') {
    const dayT = smoothstep(uNightSkyDaylight, float(1), uDaylight);
    const nightMul = mix(uNightColorFloor, float(1), dayT);
    return shaded.mul(nightMul);
  }

  return applyGrassNightLighting(shaded, {
    uDaylight,
    uNightSkyDaylight,
    uNightColorFloor,
    offsetX: params.offsetX,
    offsetZ: params.offsetZ,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
  });
}
