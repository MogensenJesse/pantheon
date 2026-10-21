// src/world/village/render/treeFall.ts — how a felled tree falls (pure: node-runnable)

import { VILLAGE } from '../../../config/village.ts';

/** The share of the fall spent falling (the rest is a small bounce), and how far it springs back (rad). */
const FALL_SHARE = 0.8;
const BOUNCE_RAD = 0.07;

/** The angle of the fall at time `t` (s): speeding up to a horizontal tree, a small spring back, then still. */
export function fallAngle(t: number): number {
  const total = VILLAGE.FOREST.FALL_S;
  const u = Math.min(1, t / total);
  const half = Math.PI / 2;
  if (u < FALL_SHARE) {
    const k = u / FALL_SHARE;
    return half * k * k;
  }
  const k = (u - FALL_SHARE) / (1 - FALL_SHARE);
  return half - BOUNCE_RAD * Math.sin(k * Math.PI);
}
