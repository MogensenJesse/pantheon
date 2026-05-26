// src/rendering/playerGlowTsl.ts — shared player point-light falloff for TSL materials
import { clamp, float, smoothstep } from 'three/tsl';

export function playerGlowFalloff(
  dist: ReturnType<typeof float>,
  uLightRadius: ReturnType<typeof import('three/tsl').uniform>,
  uLightIntensity: ReturnType<typeof import('three/tsl').uniform>,
  uPlayerGlowMul: ReturnType<typeof import('three/tsl').uniform>,
) {
  const playerFalloff = float(1).sub(smoothstep(float(0), uLightRadius, dist));
  return playerFalloff.mul(uLightIntensity).mul(uPlayerGlowMul);
}

/** Terrain splat caps glow so shadows stay readable. */
export function playerGlowFalloffTerrain(
  dist: ReturnType<typeof float>,
  uLightRadius: ReturnType<typeof import('three/tsl').uniform>,
  uLightIntensity: ReturnType<typeof import('three/tsl').uniform>,
  uPlayerGlowMul: ReturnType<typeof import('three/tsl').uniform>,
) {
  return clamp(playerGlowFalloff(dist, uLightRadius, uLightIntensity, uPlayerGlowMul), 0, 0.6);
}
