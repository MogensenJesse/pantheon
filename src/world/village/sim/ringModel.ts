// src/world/village/sim/ringModel.ts — the concentric rings around the temple: wobbly, stretched along the slope
import { VILLAGE } from '../../../config/village.ts';

const { RINGS } = VILLAGE;
const TWO_PI = Math.PI * 2;

/** Ground slope around the temple: which way the contour runs and how steep it is. */
export interface ContourHint {
  /** Angle (same convention as `thetaOf`) of the direction along the contour lines. */
  angle: number;
  /** Slope (rise/run) magnitude. */
  slope: number;
}

export interface RingModel {
  readonly count: number;
  readonly centerX: number;
  readonly centerZ: number;
  /** Temple door direction: the main road runs this way. */
  readonly doorYaw: number;
  /** Largest radius any ring reaches (m). */
  readonly outerRadius: number;
  /** Main road length from the temple centre (m). */
  readonly roadLength: number;
  /** Angle of a world offset, 0 along +Z and growing toward +X (like a door yaw). */
  thetaOf: (dx: number, dz: number) => number;
  /** Radius of ring k at angle theta (m). */
  radiusAt: (k: number, theta: number) => number;
  /** Radius of the ring road that runs just inside ring k's row of houses (m). */
  roadRadiusAt: (k: number, theta: number) => number;
  /** How many buildings ring k can hold. */
  capacity: (k: number) => number;
  /** Smooth 0.3..1 weight: where ring k is busier, giving hamlet-like clusters and gaps. */
  density: (k: number, theta: number) => number;
  /** Ring a point lies nearest to and how far (m, positive outside). */
  nearestRing: (x: number, z: number) => { ring: number; offset: number };
  /** Distance to the main road centreline for points along it, else Infinity. */
  roadDistance: (x: number, z: number) => number;
}

interface Harmonic {
  amp: number;
  phase: number;
}

function harmonics(rng: () => number, count: number, falloff: number): Harmonic[] {
  const list: Harmonic[] = [];
  let total = 0;
  for (let h = 1; h <= count; h++) {
    const amp = (0.4 + 0.6 * rng()) / h ** falloff;
    total += amp;
    list.push({ amp, phase: rng() * TWO_PI });
  }
  return list.map((m) => ({ amp: m.amp / total, phase: m.phase }));
}

/** Sum of sines normalised to -1..1. */
function wave(list: readonly Harmonic[], theta: number): number {
  let v = 0;
  for (let h = 0; h < list.length; h++) {
    v += list[h]!.amp * Math.sin((h + 1) * theta + list[h]!.phase);
  }
  return v;
}

export function createRingModel(
  rng: () => number,
  centerX: number,
  centerZ: number,
  doorYaw: number,
  contour: ContourHint,
): RingModel {
  const thetaOf = (dx: number, dz: number) => Math.atan2(dx, dz);
  const stretch = RINGS.ELONGATION_MAX * Math.min(1, contour.slope / RINGS.ELONGATION_SLOPE);
  /** 1 .. 1 + stretch: widest along the contour, never squeezed. */
  const elongation = (theta: number) =>
    1 + stretch * (0.5 + 0.5 * Math.cos(2 * (theta - contour.angle)));

  const base: number[] = [];
  const wobble: Harmonic[][] = [];
  const wobbleScale: number[] = [];
  const crowd: Harmonic[][] = [];
  for (let k = 0; k < RINGS.COUNT; k++) {
    base.push(
      RINGS.FIRST_RADIUS_M + k * RINGS.SPACING_M + (rng() * 2 - 1) * RINGS.SPACING_JITTER_M,
    );
    wobble.push(harmonics(rng, 3, 0.7));
    wobbleScale.push(0.6 + 0.4 * rng());
    crowd.push(harmonics(rng, 4, 0.5));
  }

  const radiusAt = (k: number, theta: number) =>
    (base[k]! + RINGS.WOBBLE_M * wobbleScale[k]! * wave(wobble[k]!, theta)) * elongation(theta);
  const outerRadius = Math.max(...base.map((b) => (b + RINGS.WOBBLE_M) * (1 + stretch)));
  const roadLength = outerRadius + RINGS.ROAD_OVERSHOOT_M;
  const roadX = Math.sin(doorYaw);
  const roadZ = Math.cos(doorYaw);

  return {
    count: RINGS.COUNT,
    centerX,
    centerZ,
    doorYaw,
    outerRadius,
    roadLength,
    thetaOf,
    radiusAt,
    roadRadiusAt: (k, theta) => radiusAt(k, theta) - RINGS.ROAD_INSET_M,
    capacity: (k) =>
      Math.max(1, Math.floor((TWO_PI * base[k]! * (1 + stretch * 0.5)) / RINGS.PITCH_M)),
    density: (k, theta) => 0.65 + 0.35 * wave(crowd[k]!, theta),
    nearestRing: (x, z) => {
      const dx = x - centerX;
      const dz = z - centerZ;
      const theta = thetaOf(dx, dz);
      const r = Math.hypot(dx, dz);
      let best = 0;
      let bestOffset = Number.POSITIVE_INFINITY;
      for (let k = 0; k < RINGS.COUNT; k++) {
        const offset = r - radiusAt(k, theta);
        if (Math.abs(offset) < Math.abs(bestOffset)) {
          bestOffset = offset;
          best = k;
        }
      }
      return { ring: best, offset: bestOffset };
    },
    roadDistance: (x, z) => {
      const dx = x - centerX;
      const dz = z - centerZ;
      const along = dx * roadX + dz * roadZ;
      if (along < 0 || along > roadLength) return Number.POSITIVE_INFINITY;
      return Math.abs(dx * roadZ - dz * roadX);
    },
  };
}

/** Slope direction around a point: sample the ground 20 m out on each side. */
export function measureContour(
  getY: (x: number, z: number) => number,
  x: number,
  z: number,
): ContourHint {
  const reach = 20;
  const gx = (getY(x + reach, z) - getY(x - reach, z)) / (2 * reach);
  const gz = (getY(x, z + reach) - getY(x, z - reach)) / (2 * reach);
  // The contour runs perpendicular to the gradient.
  return { angle: Math.atan2(-gz, gx), slope: Math.hypot(gx, gz) };
}
