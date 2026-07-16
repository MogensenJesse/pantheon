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
 */
export function profileCloudParticle(
  genus: CloudGenus,
  particleIndex: number,
  particlesPerCloud: number,
  seed: number,
): CloudParticleProfile {
  const r = cloudSeededRandom;
  const t = particlesPerCloud > 1 ? particleIndex / (particlesPerCloud - 1) : 0;

  switch (genus) {
    case 'cumulus': {
      const angle = r(seed) * Math.PI * 2;
      const radius = r(seed + 1) * 12;
      const y = Math.max(r(seed + 2) * 16 - 1, 0);
      const heightFalloff = 1 - t * 0.25;
      return {
        x: Math.cos(angle) * radius,
        y,
        z: Math.sin(angle) * radius,
        sx: lerp(14, 26, r(seed + 3)),
        sy: lerp(11, 22, r(seed + 4) * heightFalloff),
        sz: lerp(14, 26, r(seed + 5)),
      };
    }
    case 'stratus': {
      return {
        x: (r(seed) - 0.5) * 42,
        y: (r(seed + 1) - 0.5) * 12,
        z: (r(seed + 2) - 0.5) * 42,
        sx: lerp(18, 36, r(seed + 3)),
        sy: lerp(7, 14, r(seed + 4)),
        sz: lerp(18, 36, r(seed + 5)),
      };
    }
    case 'cirrus': {
      return {
        x: t * 36 - 18 + (r(seed) - 0.5) * 8,
        y: (r(seed + 1) - 0.5) * 8,
        z: (r(seed + 2) - 0.5) * 8,
        sx: lerp(7, 14, r(seed + 3)),
        sy: lerp(2.5, 6, r(seed + 4)),
        sz: lerp(3, 7, r(seed + 5)),
      };
    }
    default: {
      const _exhaustive: never = genus;
      return _exhaustive;
    }
  }
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

/** Cirrus clusters sit higher than low cumulus/stratus. */
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
