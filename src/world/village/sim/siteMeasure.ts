// src/world/village/sim/siteMeasure.ts — terrain relief under an oriented building footprint
import { VILLAGE } from '../../../config/village.ts';

export interface FootprintMeasure {
  hMin: number;
  hMax: number;
  hMean: number;
}

export interface PlinthPlan {
  topY: number;
  baseY: number;
}

/**
 * Sample ground heights on a grid inside the rotated footprint (plus a margin). Yaw follows three:
 * local +Z turns toward world +X as rotY grows.
 */
export function measureFootprint(
  getY: (x: number, z: number) => number,
  x: number,
  z: number,
  rotY: number,
  halfW: number,
  halfD: number,
  marginM = 0.5,
  stepM = 1,
): FootprintMeasure {
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  const ex = halfW + marginM;
  const ez = halfD + marginM;
  const nx = Math.max(1, Math.ceil((2 * ex) / stepM));
  const nz = Math.max(1, Math.ceil((2 * ez) / stepM));
  let hMin = Number.POSITIVE_INFINITY;
  let hMax = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let n = 0;
  for (let i = 0; i <= nx; i++) {
    const lx = -ex + (2 * ex * i) / nx;
    for (let j = 0; j <= nz; j++) {
      const lz = -ez + (2 * ez * j) / nz;
      const h = getY(x + lx * cos + lz * sin, z - lx * sin + lz * cos);
      if (h < hMin) hMin = h;
      if (h > hMax) hMax = h;
      sum += h;
      n++;
    }
  }
  return { hMin, hMax, hMean: sum / n };
}

export function planPlinth(measure: FootprintMeasure): PlinthPlan {
  const { TOP_LIFT_M, SINK_M, MIN_HEIGHT_M } = VILLAGE.PLINTH;
  const topY = measure.hMax + TOP_LIFT_M;
  const baseY = Math.min(measure.hMin - SINK_M, topY - MIN_HEIGHT_M);
  return { topY, baseY };
}
