// src/rendering/tsl/foliageWrapHemisphereTsl.ts — wrap hemi + fake SSS back-light
import { dot, float, max, mix, normalize, smoothstep, vec3 } from 'three/tsl';

type TslNode = any;

const BACKLIGHT_TINT_MIX = 0.3;
/** HDR-friendly scale — keeps defaults subtle after AgX but visible when strength → 1. */
const BACKLIGHT_OUTPUT_SCALE = 2.5;

/** Albedo × wrap diffuse × hemisphere ambient (shared by props, grass, flowers). */
export function applyFoliageWrapHemisphere(
  albedo: TslNode,
  normal: TslNode,
  uSunDirection: TslNode,
  uWrapStrength: TslNode,
  uHemisphereStrength: TslNode,
  uSkyTint: TslNode,
  uGroundTint: TslNode,
  categoryMul: TslNode = float(1),
): TslNode {
  const n = normalize(normal);
  const halfLambert = dot(n, uSunDirection).mul(0.5).add(0.5);
  const wrapMix = uWrapStrength.mul(categoryMul);
  const wrapTerm = mix(float(1), halfLambert, wrapMix);

  const hemiT = n.y.mul(0.5).add(0.5);
  const hemiColor = mix(uGroundTint, uSkyTint, hemiT);
  const hemiMix = uHemisphereStrength.mul(categoryMul);
  const hemiTerm = mix(vec3(1), hemiColor, hemiMix);

  return albedo.mul(wrapTerm).mul(hemiTerm);
}

/** Geometric back-facing weight (no strength — live-tuned via uBacklightStrength). */
export function computeFoliageBackFacing(
  normal: TslNode,
  thickness: TslNode,
  uSunDirection: TslNode,
  categoryMul: TslNode = float(1),
): TslNode {
  const n = normalize(normal);
  const back = dot(n.negate(), uSunDirection).clamp(0, 1);
  return back.mul(thickness).mul(categoryMul);
}

/** Low-sun tip scatter — uses dot(sun, up), not uniform .y (CPU trap). */
export function computeFoliageLowSunScatter(
  thickness: TslNode,
  uSunDirection: TslNode,
  scatter: TslNode = float(0.75),
): TslNode {
  const sunUp = dot(uSunDirection, vec3(0, 1, 0)).clamp(0, 1);
  const lowSun = float(1).sub(sunUp);
  return lowSun.mul(thickness).mul(scatter);
}

/** Additive sun transmission (fake SSS). Strength slider scales this directly. */
export function applyFoliageBacklight(
  albedo: TslNode,
  facing: TslNode,
  uSunColor: TslNode,
  uSunIntensity: TslNode,
  uBacklightStrength: TslNode,
  uBacklightTint: TslNode,
): TslNode {
  const tint = mix(uSunColor, uBacklightTint, float(BACKLIGHT_TINT_MIX));
  const sunLit = smoothstep(float(0), float(0.04), uSunIntensity);
  return albedo
    .mul(tint)
    .mul(facing)
    .mul(uBacklightStrength)
    .mul(sunLit)
    .mul(float(BACKLIGHT_OUTPUT_SCALE));
}

/** Partial shadow punch on diffuse when back-lit (0 = respect shadow, 1 = full lift at max facing). */
export function computeBacklightShadowLift(
  facing: TslNode,
  shadowMul: TslNode,
  uBacklightPunchThrough: TslNode,
): TslNode {
  return mix(shadowMul, float(1), facing.mul(uBacklightPunchThrough));
}

/** How much additive backlight survives in shadow (0 = fully shadowed, 1 = ignore shadow). */
export function computeBacklightShadowMul(
  shadowMul: TslNode,
  uBacklightPunchThrough: TslNode,
): TslNode {
  return mix(shadowMul, float(1), uBacklightPunchThrough);
}

/** Combine card back-light + optional low-sun scatter for blades/petals/canopy cards. */
export function computeFoliageFacing(
  normal: TslNode,
  thickness: TslNode,
  uSunDirection: TslNode,
  categoryMul: TslNode = float(1),
  lowSunScatter: TslNode = float(0.75),
): TslNode {
  const backFace = computeFoliageBackFacing(normal, thickness, uSunDirection, categoryMul);
  const tipScatter = computeFoliageLowSunScatter(thickness, uSunDirection, lowSunScatter);
  return max(backFace, tipScatter);
}
