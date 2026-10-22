// src/life/particles/cloudMath.ts — where a speck of a place's cloud is (pure CPU twin of the shader in cloudField.ts)
//
// A cloud is a small set of specks around one point (a landmark): fireflies orbiting it, dust motes rising from it,
// leaves shed above it and falling downwind. Where a speck is comes from its seed, the clock and the wind alone, so
// the cloud needs no state and a load shows it exactly as it was.

import { type DriftSeed, smooth01, type Vec3Like } from './driftMath.ts';

export type CloudStyle = 'swirl' | 'rise' | 'shed';

export interface CloudShape {
  style: CloudStyle;
  /** Radius of the disc (or ring) the specks are spread over, metres. */
  spreadM: number;
  /** The height of the cloud: fireflies hover within it, motes rise through it, leaves fall from it. */
  heightM: number;
  /** Seconds for a mote or leaf to go through its whole life (rise or fall, then start again). */
  lifeS: number;
  /** How fast the wind carries a speck at calm (m/s of drift); the boost multiplies it. */
  speedMps: number;
  orbitRadPerS: number;
  wobbleM: number;
  wobbleHz: number;
}

const TAU = Math.PI * 2;
const fract = (v: number) => v - Math.floor(v);

/** 0..1: how far through its life a speck is (the same on every frame, a function of the clock). */
export function ageAt(seed: DriftSeed, clockS: number, lifeS: number): number {
  return fract(seed.y + clockS / lifeS);
}

/** Where a speck is. `ring` puts the specks on a ring at the spread radius instead of over the disc. */
export function cloudPosition(
  seed: DriftSeed,
  centre: Vec3Like,
  windDirX: number,
  windDirZ: number,
  windBoost: number,
  clockS: number,
  shape: CloudShape,
  ring = false,
): Vec3Like {
  const sway = TAU * shape.wobbleHz * clockS;
  const wobbleX = Math.sin(sway + seed.z * TAU) * shape.wobbleM;
  const wobbleZ = Math.sin(sway * 0.77 + seed.x * TAU) * shape.wobbleM;
  const radius = shape.spreadM * (ring ? 0.85 + 0.15 * seed.z : Math.sqrt(seed.z));

  if (shape.style === 'swirl') {
    const turn = fract(seed.w * 5.17) > 0.5 ? 1 : -1;
    const angle = seed.x * TAU + clockS * shape.orbitRadPerS * (0.4 + 0.6 * seed.w) * turn;
    return {
      x: centre.x + Math.cos(angle) * radius + wobbleX,
      y:
        centre.y +
        0.4 +
        fract(seed.y * 7.7) * shape.heightM +
        Math.sin(sway * 1.3 + seed.w * TAU) * 0.35,
      z: centre.z + Math.sin(angle) * radius + wobbleZ,
    };
  }

  const age = ageAt(seed, clockS, shape.lifeS);
  const carry = shape.speedMps * windBoost * age * shape.lifeS;
  const angle = seed.x * TAU;
  return {
    x: centre.x + Math.cos(angle) * radius + wobbleX + windDirX * carry,
    y: centre.y + (shape.style === 'rise' ? age : 1 - age) * shape.heightM,
    z: centre.z + Math.sin(angle) * radius + wobbleZ + windDirZ * carry,
  };
}

/** 0..1: motes and leaves fade in as they start and out as they end, so none pops; fireflies stay (they blink). */
export function cloudFade(seed: DriftSeed, clockS: number, shape: CloudShape): number {
  if (shape.style === 'swirl') return 1;
  const age = ageAt(seed, clockS, shape.lifeS);
  if (shape.style === 'rise') return Math.sin(Math.PI * age);
  return smooth01(0, 0.1, age) * (1 - smooth01(0.85, 1, age));
}
