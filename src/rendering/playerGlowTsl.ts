// src/rendering/playerGlowTsl.ts — shared player point-light falloff for TSL materials
import { clamp, float, smoothstep } from 'three/tsl';

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

/** Receive glow from a 0–1 world-XZ mask (guide ribbon atlas). */
export function glowFromMask(mask: TslNode, intensity: TslNode) {
  return clamp(mask.mul(intensity), 0, 0.6);
}
