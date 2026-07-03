// src/world/grass/tsl/grassNightLightingTsl.ts — day/night dim + player glow (matches prop foliage)
import { float, length, mix, smoothstep, vec2 } from 'three/tsl';
import { playerGlowFalloff } from '../../../rendering/playerGlowTsl';
import type { TslNode } from './tslNode';

/** Lit grass color: ambient day/night ramp + distance-based player glow (additive). */
export function applyGrassNightLighting(
  color: TslNode,
  {
    uDaylight,
    uNightSkyDaylight,
    uNightColorFloor,
    offsetX,
    offsetZ,
    uLightRadius,
    uLightIntensity,
    uPlayerGlowMul,
  }: {
    uDaylight: TslNode;
    uNightSkyDaylight: TslNode;
    uNightColorFloor: TslNode;
    offsetX: TslNode;
    offsetZ: TslNode;
    uLightRadius: TslNode;
    uLightIntensity: TslNode;
    uPlayerGlowMul: TslNode;
  },
): TslNode {
  const dayT = smoothstep(uNightSkyDaylight, float(1), uDaylight);
  const nightMul = mix(uNightColorFloor, float(1), dayT);

  const dist = length(vec2(offsetX, offsetZ));
  const glow = playerGlowFalloff(dist, uLightRadius, uLightIntensity, uPlayerGlowMul);

  const baseLit = color.mul(nightMul);
  const glowLit = color.mul(glow);
  return baseLit.add(glowLit);
}
