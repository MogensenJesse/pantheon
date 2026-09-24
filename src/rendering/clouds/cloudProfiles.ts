// src/rendering/clouds/cloudProfiles.ts - per-genus particle distributions (mesh cluster)
import type { CloudGenus } from './cloudConfig';
import { getCloudGenusProfile } from './cloudGenusProfiles';

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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function saturate(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Deck-sitter count from live genus profile (designer + play share getCloudGenusProfile). */
function deckBaseSitterCount(genus: CloudGenus, particlesPerCloud: number): number {
  const frac = getCloudGenusProfile(genus).deckBaseFraction;
  if (frac <= 0 || particlesPerCloud <= 0) return 0;
  return Math.max(1, Math.floor(particlesPerCloud * frac));
}

/**
 * Local-space offset + non-uniform scale for one particle in a cluster.
 * Coordinates are meters relative to the cluster anchor.
 * Local +X = along-wind, +Z = crosswind (MeshCloudSystem rotates by windDirectionDeg).
 * sizeMul scales offsets and extents (high-layer cumulus ~3x -> ~40-110 m puffs).
 *
 * Cumulus: one mass. deckBaseFraction puffs are the wide body; the rest are lobes whose
 * bottoms overlap that body. The flat underside is the shared condensation clip
 * (deckPlaneYBiasM), not a second particle layer.
 * Stratus: sheet with billows on the same deck. Cirrus is unclipped.
 *
 * deckBaseFraction comes from getCloudGenusProfile. Soft shading defaults stay frozen.
 */
export function profileCloudParticle(
  genus: CloudGenus,
  particleIndex: number,
  particlesPerCloud: number,
  seed: number,
  sizeMul = 1,
): CloudParticleProfile {
  const r = cloudSeededRandom;
  const t = particlesPerCloud > 1 ? particleIndex / (particlesPerCloud - 1) : 0;
  const m = Math.max(0.05, sizeMul);

  switch (genus) {
    case 'cumulus': {
      // One body: wide base the clip cuts flat, lobes overlapping that body into a crown.
      const angle = r(seed) * Math.PI * 2;
      const radiusNorm = Math.sqrt(r(seed + 1));
      const edge = saturate(radiusNorm);
      const deckBaseCount = deckBaseSitterCount(genus, particlesPerCloud);
      const isDeckBase = particleIndex < deckBaseCount;

      if (isDeckBase) {
        const sy = lerp(12, 16, r(seed + 4)) * (1 - edge * 0.2);
        const along = lerp(18, 32, r(seed + 3) * (1 - edge * 0.35));
        const cross = lerp(14, 26, r(seed + 5) * (1 - edge * 0.35));
        const radius = radiusNorm * 16;
        return {
          x: Math.cos(angle) * radius * 1.15 * m,
          y: sy * 0.42 * m,
          z: Math.sin(angle) * radius * 0.95 * m,
          sx: along * m,
          sy: sy * m,
          sz: cross * m,
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
        x: Math.cos(angle) * radius * 1.05 * m,
        y: y * m,
        z: Math.sin(angle) * radius * 0.9 * m,
        sx: along * m,
        sy: sy * m,
        sz: cross * m,
      };
    }
    case 'stratus': {
      // Flat sheet deck: wide XZ, thin Y; base flatten + intentional under-hang for bank hard-clip.
      const along = lerp(24, 44, r(seed + 3));
      const cross = lerp(12, 24, r(seed + 5));
      const syFull = lerp(7, 14, r(seed + 4));
      // Profile deckBaseFraction -> low deck sitters; remainder keep sheet billows.
      const deckBaseCount = deckBaseSitterCount(genus, particlesPerCloud);
      const isDeckBase = particleIndex < deckBaseCount;
      const billowNorm = isDeckBase ? r(seed + 1) * 0.12 : r(seed + 1) ** 1.7;
      const sy = syFull * lerp(0.4, 1, saturate(billowNorm * 1.2 + 0.15));
      const billow = billowNorm * 7;
      // Center near ~0.42*sy so clip cuts a wide horizontal disc under the sheet.
      const y = isDeckBase ? sy * 0.42 : Math.max(sy * 0.42 + billow, sy * 0.35);
      return {
        x: (r(seed) - 0.5) * 52 * m,
        y: y * m,
        z: (r(seed + 2) - 0.5) * 28 * m,
        sx: along * m,
        sy: sy * m,
        sz: cross * m,
      };
    }
    case 'cirrus': {
      // High wisps: leave unflattened (no condensation plane / clip) so they stay streaky.
      // deckBaseFraction default 0; genusUsesCondensationClip is false.
      return {
        x: (t * 42 - 21 + (r(seed) - 0.5) * 8) * m,
        y: (r(seed + 1) - 0.5) * 8 * m,
        z: (r(seed + 2) - 0.5) * 6 * m,
        sx: lerp(10, 20, r(seed + 3)) * m,
        sy: lerp(2.5, 6, r(seed + 4)) * m,
        sz: lerp(2.5, 5.5, r(seed + 5)) * m,
      };
    }
    default: {
      const _exhaustive: never = genus;
      return _exhaustive;
    }
  }
}

/** True when this genus should get the material condensation-plane opacity clip. */
export function genusUsesCondensationClip(genus: CloudGenus): boolean {
  return genus === 'cumulus' || genus === 'stratus';
}

/**
 * Skip puffs whose volume would lie almost entirely below the bank condensation deck
 * (hard material clip would erase them). Centers below the plane are also rejected.
 */
export function shouldKeepCondensationPuff(
  genus: CloudGenus,
  profile: CloudParticleProfile,
): boolean {
  if (!genusUsesCondensationClip(genus)) return true;
  if (profile.y < 0) return false;
  // Keep if any meaningful mass remains above the deck after clip.
  return profile.y + profile.sy * 0.2 > 0;
}

/** Pick a genus from typeWeights using a 0-1 roll. */
export function pickCloudGenus(
  roll: number,
  weights: { cumulus: number; stratus: number; cirrus: number },
): CloudGenus {
  const total = weights.cumulus + weights.stratus + weights.cirrus;
  if (total <= 0) return 'cumulus';
  let t = roll * total;
  if (t < weights.cumulus) return 'cumulus';
  t -= weights.cumulus;
  if (t < weights.stratus) return 'stratus';
  return 'cirrus';
}

/** Residual within-layer altitude bias (layers own primary baseY). */
export function genusAltitudeOffset(genus: CloudGenus): number {
  switch (genus) {
    case 'cumulus':
      return 0;
    case 'stratus':
      return -12;
    case 'cirrus':
      return 55;
    default: {
      const _exhaustive: never = genus;
      return _exhaustive;
    }
  }
}
