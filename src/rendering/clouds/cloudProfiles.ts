// src/rendering/clouds/cloudProfiles.ts — per-genus particle distributions (mesh cluster)
import type { CloudGenus } from './cloudConfig';

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

/** Deterministic 0–1 hash — matches procedural-clouds skill seededRandom. */
export function cloudSeededRandom(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Local-space offset + non-uniform scale for one particle in a cluster.
 * Coordinates are meters relative to the cluster anchor.
 * Local +X = along-wind, +Z = crosswind (MeshCloudSystem rotates by windDirectionDeg).
 * `sizeMul` scales offsets and extents (high-layer cumulus ~3× → ~40–110 m puffs).
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
      // Cauliflower dome: larger puffs low/center, smaller toward top and edges.
      const angle = r(seed) * Math.PI * 2;
      const radiusNorm = Math.sqrt(r(seed + 1)); // bias toward center
      const radius = radiusNorm * 14;
      const heightNorm = r(seed + 2);
      // Mass sits on a flat condensation base (y = 0); build upward.
      const yRaw = heightNorm * 18;
      const edge = saturate(radiusNorm);
      const heightFalloff = 1 - heightNorm * 0.55;
      const centerBoost = 1 - edge * 0.45;
      const along = lerp(14, 28, r(seed + 3) * centerBoost * heightFalloff);
      const cross = lerp(10, 22, r(seed + 5) * centerBoost * heightFalloff);
      const sy = lerp(10, 24, r(seed + 4) * heightFalloff * centerBoost);
      // Clamp sphere bottoms to the mass base (center.y - sy >= 0).
      const y = Math.max(yRaw, sy);
      return {
        x: Math.cos(angle) * radius * 1.1 * m,
        y: y * m,
        z: Math.sin(angle) * radius * 0.9 * m,
        sx: along * m,
        sy: sy * m,
        sz: cross * m,
      };
    }
    case 'stratus': {
      return {
        x: (r(seed) - 0.5) * 52 * m,
        y: (r(seed + 1) - 0.5) * 12 * m,
        z: (r(seed + 2) - 0.5) * 28 * m,
        sx: lerp(24, 44, r(seed + 3)) * m,
        sy: lerp(7, 14, r(seed + 4)) * m,
        sz: lerp(12, 24, r(seed + 5)) * m,
      };
    }
    case 'cirrus': {
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

function saturate(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Pick a genus from preset weights using a 0–1 roll. */
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
