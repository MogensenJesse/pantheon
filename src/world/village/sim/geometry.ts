// src/world/village/sim/geometry.ts — small pure helpers shared by the village sim and its renderers (no three)

export const TWO_PI = Math.PI * 2;

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

/** World position `out` metres in front of a building's door (`door` is the kit's local door point). */
export function doorWorld(
  building: YawFrame,
  door: readonly [number, number],
  out = 0,
): [number, number] {
  return localToWorld(building, door[0], door[1] + out);
}

/** `value` wrapped into [0, period). */
export function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** A day-cycle phase wrapped into [0, 1). */
export function wrap01(phase: number): number {
  return wrap(phase, 1);
}

/** Stable 0..1 value per number, for variation that needs no random stream. */
export function hash01(n: number): number {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}
