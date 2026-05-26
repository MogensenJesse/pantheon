// src/rendering/playerGlowTsl.ts — shared player point-light falloff for TSL materials
import { clamp, float, smoothstep } from 'three/tsl';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

export function playerGlowFalloff(
  dist: TslNode,
  uLightRadius: TslNode,
  uLightIntensity: TslNode,
  uPlayerGlowMul: TslNode,
) {
  const playerFalloff = float(1).sub(smoothstep(float(0), uLightRadius, dist));
  return playerFalloff.mul(uLightIntensity).mul(uPlayerGlowMul);
}

/** Terrain splat caps glow so shadows stay readable. */
export function playerGlowFalloffTerrain(
  dist: TslNode,
  uLightRadius: TslNode,
  uLightIntensity: TslNode,
  uPlayerGlowMul: TslNode,
) {
  return clamp(playerGlowFalloff(dist, uLightRadius, uLightIntensity, uPlayerGlowMul), 0, 0.6);
}
