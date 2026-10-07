// src/world/village/sim/geometry.ts — small pure helpers shared by the village sim and its renderers (no three)

const TWO_PI = Math.PI * 2;

/** A position with a yaw: a building, a field or any other frame the village places things in. */
export interface YawFrame {
  x: number;
  z: number;
  rotY: number;
}

/**
 * World position of the local point (lx, lz) of a yawed frame. Yaw follows three: local +Z turns
 * toward world +X as `rotY` grows.
 */
export function localToWorld(frame: YawFrame, lx: number, lz: number): [number, number] {
  const cos = Math.cos(frame.rotY);
  const sin = Math.sin(frame.rotY);
  return [frame.x + lx * cos + lz * sin, frame.z - lx * sin + lz * cos];
}

/** `value` wrapped into [0, period). */
export function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** A day-cycle phase wrapped into [0, 1). */
export function wrap01(phase: number): number {
  return wrap(phase, 1);
}

/** An angle wrapped into [-PI, PI]. */
export function wrapAngle(angle: number): number {
  let delta = angle % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta < -Math.PI) delta += TWO_PI;
  return delta;
}

/** Turn `current` toward `target` by the share `amount` (0..1) of the shortest way round. */
export function turnToward(current: number, target: number, amount: number): number {
  return current + wrapAngle(target - current) * Math.min(1, amount);
}

/** Stable 0..1 value per number, for variation that needs no random stream. */
export function hash01(n: number): number {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}
