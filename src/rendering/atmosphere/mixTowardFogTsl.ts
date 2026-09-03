// src/rendering/atmosphere/mixTowardFogTsl.ts — one mix convention for water, clouds, sky
type TslNode = any;

/**
 * Mix RGB toward fog tint. TSL `.mix(a, b)` on a factor is `mix(a, b, t)`.
 * Callers must pass already-lit / intensity-scaled RGB (HDRI intensity before this).
 */
export function mixTowardFog(rgb: TslNode, fogColor: TslNode, factor: TslNode): TslNode {
  return (factor as TslNode).mix(rgb, fogColor);
}
