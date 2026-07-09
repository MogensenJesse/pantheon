// @ts-nocheck — TSL node parameter typings incomplete in r184
// src/rendering/clouds/volumetric/cloudNoiseTsl.ts — 3D value noise + FBM for volumetric clouds
import { float, floor, Fn, fract, hash, mix, vec3 } from 'three/tsl';

type TslNode = any;

/** Shipped FBM defaults — matches procedural-clouds skill cloudFBM. */
export const DEFAULT_CLOUD_FBM = {
  octaves: 5,
  lacunarity: 2,
  gain: 0.5,
} as const;

/** GPU-friendly lattice hash — skill hash3 equivalent. */
const latticeHash = (x: TslNode, y: TslNode, z: TslNode): TslNode =>
  hash(x.mul(127.1).add(y.mul(311.7)).add(z.mul(74.7))).fract();

/**
 * Inline 3D value noise — must NOT be Fn() when called from post-FX graphs
 * (nested Fn calls from mixAtUv fail silently / compile to zero).
 */
export function buildValueNoise3D(p: TslNode): TslNode {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(float(3).sub(f.mul(2)));

  const ix = i.x;
  const iy = i.y;
  const iz = i.z;

  const n000 = latticeHash(ix, iy, iz);
  const n100 = latticeHash(ix.add(1), iy, iz);
  const n010 = latticeHash(ix, iy.add(1), iz);
  const n110 = latticeHash(ix.add(1), iy.add(1), iz);
  const n001 = latticeHash(ix, iy, iz.add(1));
  const n101 = latticeHash(ix.add(1), iy, iz.add(1));
  const n011 = latticeHash(ix, iy.add(1), iz.add(1));
  const n111 = latticeHash(ix.add(1), iy.add(1), iz.add(1));

  const nx00 = mix(n000, n100, u.x);
  const nx10 = mix(n010, n110, u.x);
  const nx01 = mix(n001, n101, u.x);
  const nx11 = mix(n011, n111, u.x);
  const nxy0 = mix(nx00, nx10, u.y);
  const nxy1 = mix(nx01, nx11, u.y);
  return mix(nxy0, nxy1, u.z);
}

/** Fn wrapper — safe for mesh materials; post-FX uses buildValueNoise3D via cloudFbm3D. */
export const valueNoise3D = Fn(([p]: TslNode[]) => buildValueNoise3D(p));

/**
 * Fractal Brownian motion over 3D value noise (~0..1).
 * Octaves are unrolled at build time — TSL has no dynamic loops yet.
 */
export function cloudFbm3D(
  p: TslNode,
  options: {
    octaves?: number;
    lacunarity?: number;
    gain?: number;
  } = {},
): TslNode {
  const octaves = Math.min(8, Math.max(1, options.octaves ?? DEFAULT_CLOUD_FBM.octaves));
  const lac = float(options.lacunarity ?? DEFAULT_CLOUD_FBM.lacunarity);
  const gain = float(options.gain ?? DEFAULT_CLOUD_FBM.gain);

  let sum = buildValueNoise3D(p);
  let amp = gain;
  let freq = lac;
  let norm = float(1);

  for (let o = 1; o < octaves; o++) {
    sum = sum.add(buildValueNoise3D(p.mul(freq)).mul(amp));
    norm = norm.add(amp);
    amp = amp.mul(gain);
    freq = freq.mul(lac);
  }

  return sum.div(norm);
}

/** Animated sample position — wind scroll on XZ for debug preview. */
export function cloudNoiseSamplePosition(
  worldPos: TslNode,
  scale: TslNode,
  time: TslNode,
  windScroll: TslNode = vec3(0.02, 0, 0.01),
): TslNode {
  return worldPos.mul(scale).add(vec3(time.mul(windScroll.x), float(0), time.mul(windScroll.z)));
}
