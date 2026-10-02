// src/rendering/clouds/cloudProfiles.ts — cumulus particle distribution (mesh cluster)
import { clamp01, lerp } from '../../core/math/scalar';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface CloudParticleProfile extends Vec3Like {
  sx: number;
  sy: number;
  sz: number;
}

/** Deterministic 0-1 hash - matches procedural-clouds skill seededRandom. */
export function cloudSeededRandom(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Deck-sitter count from CloudSettings.deckBaseFraction. */
function deckBaseSitterCount(fraction: number, particlesPerCloud: number): number {
  if (fraction <= 0 || particlesPerCloud <= 0) return 0;
  return Math.max(1, Math.floor(particlesPerCloud * fraction));
}

/**
 * Local-space offset + non-uniform scale for one puff in a cluster.
 * Coordinates are meters relative to the cluster anchor.
 * Local +X = along-wind, +Z = crosswind (MeshCloudSystem rotates by windDirectionDeg).
 *
 * One mass. deckBaseFraction puffs are the wide body; the rest are lobes whose
 * bottoms overlap that body. The flat underside is the shared condensation clip
 * (cumulusDeck.deckYBiasM).
 */
export function profileCloudParticle(
  particleIndex: number,
  particlesPerCloud: number,
  seed: number,
  deckBaseFraction = 0,
): CloudParticleProfile {
  const r = cloudSeededRandom;
  const radiusNorm = Math.sqrt(r(seed + 1));
  const edge = clamp01(radiusNorm);
  const angle = r(seed) * Math.PI * 2;
  const deckBaseCount = deckBaseSitterCount(deckBaseFraction, particlesPerCloud);
  const isDeckBase = particleIndex < deckBaseCount;

  if (isDeckBase) {
    const sy = lerp(12, 16, r(seed + 4)) * (1 - edge * 0.2);
    const along = lerp(18, 32, r(seed + 3) * (1 - edge * 0.35));
    const cross = lerp(14, 26, r(seed + 5) * (1 - edge * 0.35));
    const radius = radiusNorm * 16;
    return {
      x: Math.cos(angle) * radius * 1.15,
      y: sy * 0.42,
      z: Math.sin(angle) * radius * 0.95,
      sx: along,
      sy,
      sz: cross,
    };
  }

  // lobe 0 sits inside the body; lobe 1 is a smaller crown bump that still overlaps it.
  const lobe = r(seed + 2) ** 0.55;
  const sy = lerp(14, 7, lobe) * (1 - edge * 0.3);
  const along = lerp(16, 9, lobe);
  const cross = lerp(13, 8, lobe);
  const radius = radiusNorm * lerp(16, 9, lobe);
  const y = 12 * (0.4 + 0.75 * lobe);
  return {
    x: Math.cos(angle) * radius * 1.05,
    y,
    z: Math.sin(angle) * radius * 0.9,
    sx: along,
    sy,
    sz: cross,
  };
}

/**
 * Skip puffs whose volume would lie almost entirely below the bank condensation deck
 * (hard material clip would erase them). Centers below the plane are also rejected.
 */
export function shouldKeepCondensationPuff(profile: CloudParticleProfile): boolean {
  if (profile.y < 0) return false;
  // Keep if any meaningful mass remains above the deck after clip.
  return profile.y + profile.sy * 0.2 > 0;
}
