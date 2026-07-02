// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/world/grass/tsl/grassNightLightingTsl.ts — day/night dim + player glow (matches prop foliage)
import { float, length, mix, smoothstep, vec2 } from 'three/tsl';
import { playerGlowFalloff } from '../../../rendering/playerGlowTsl';

/** Lit grass color: ambient day/night ramp + distance-based player glow (additive). */
export function applyGrassNightLighting(
  color,
  {
    uDaylight,
    uNightSkyDaylight,
    uNightColorFloor,
    offsetX,
    offsetZ,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
  },
) {
  const dayT = smoothstep(uNightSkyDaylight, float(1), uDaylight);
  const nightMul = mix(uNightColorFloor, float(1), dayT);

  const dist = length(vec2(offsetX, offsetZ));
  const glow = playerGlowFalloff(dist, uLightRadius, uLightIntensity, uPlayerGlowMul);

  const baseLit = color.mul(nightMul);
  // Player glow is additive at full strength (terrain splat does not dim glow by nightMul).
  const glowLit = color.mul(glow);
  return baseLit.add(glowLit);
}
