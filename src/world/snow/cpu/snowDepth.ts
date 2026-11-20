// src/world/snow/cpu/snowDepth.ts — gameplay's view of the snow: how deep it is under a point, and what that does to the orb
//
// The depth is the baked map (cpu/snowBake.ts) read bilinearly at the same texel centres the shell uses. It is a module-level
// holder like `setActiveFineDelta` in terrainChiselCpu: the snow system sets it while the shell is on, the player controller
// reads it every step without being handed the system. `getWorldY` is not touched (about 30 readers rely on bare terrain).
// Pure: no imports.

interface DepthMap {
  size: number;
  texelM: number;
  /** Snow above the chisel (m), row-major, texel (i, j) centred at `(i + 0.5) * texelM - size * texelM / 2`. */
  depth: Float32Array;
}

let active: DepthMap | null = null;

/** Where the snow is deep (null = no snow: the shell is off or not baked yet). */
export function setActiveSnowDepth(map: DepthMap | null): void {
  active = map;
}

/** Snow depth (m) under a world point: 0 where there is none. */
export function snowDepthAt(x: number, z: number): number {
  const map = active;
  if (!map) return 0;
  const { size, texelM, depth } = map;
  const half = (size * texelM) / 2;
  const max = size - 1;
  const u = Math.min(max, Math.max(0, (x + half) / texelM - 0.5));
  const v = Math.min(max, Math.max(0, (z + half) / texelM - 0.5));
  const i0 = Math.min(max - 1, Math.floor(u));
  const j0 = Math.min(max - 1, Math.floor(v));
  const tx = u - i0;
  const tz = v - j0;
  const k = j0 * size + i0;
  const top = depth[k] * (1 - tx) + depth[k + 1] * tx;
  const bottom = depth[k + size] * (1 - tx) + depth[k + size + 1] * tx;
  return top * (1 - tz) + bottom * tz;
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Speed factor in deep snow: 1 on bare ground, `slowMul` once the snow is `fullAtM` deep, smoothly between. */
export function snowSpeedMultiplier(depthM: number, slowMul: number, fullAtM: number): number {
  return 1 + (slowMul - 1) * smoothstep(0, fullAtM, depthM);
}

/** How far the orb rides below the snow surface: `share` of the depth, for depths up to `capM`. */
export function snowSinkM(depthM: number, share: number, capM: number): number {
  return share * Math.min(Math.max(depthM, 0), capM);
}
