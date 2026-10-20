// src/world/village/sim/terraform.ts — blends building pads into the terrain's 2 m detail layer as they are built
import { VILLAGE } from '../../../config/village.ts';
import type { FineDelta, NodeBounds } from '../../terrain/cpu/fineDelta.ts';
import type { Pad } from './pad.ts';

export interface Terraformer {
  /** Register a building's pad at fraction 0 (nothing moves yet). */
  add: (id: number, pad: Pad) => void;
  /** Level a registered pad `fraction` (0..1) of the way from the original ground to its floor. */
  setFraction: (id: number, fraction: number) => void;
  takeDirty: () => NodeBounds | null;
}

interface Entry {
  /** Detail node indices, with the pull toward the floor (m) and the pad weight. */
  index: Int32Array;
  target: Float32Array;
  weight: Float32Array;
  pad: Uint8Array;
  fraction: number;
}

/**
 * Per node, a pad pulls the ground toward its floor by `fraction * weight * (floor - ground)`.
 * Pad nodes (weight 1) land exactly on the floor, so the triangles under the footprint are flat; skirt
 * nodes fade back to the original ground. Where claims overlap, pad nodes win over skirts and skirts
 * average, weighted by how far each building has got, so unbuilt neighbours pull nothing.
 * `baseY` is the original ground: the offsets are relative to it.
 */
export function createTerraformer(
  fd: FineDelta,
  baseY: (x: number, z: number) => number,
): Terraformer {
  const { NODE_M } = VILLAGE.PLINTH;
  if (Math.abs(fd.stepM - NODE_M) > 1e-9) {
    throw new Error(
      `detail layer step ${fd.stepM} m does not match VILLAGE.PLINTH.NODE_M ${NODE_M}`,
    );
  }
  const n = fd.nodes;
  const i0 = Math.round(fd.originX / NODE_M);
  const j0 = Math.round(fd.originZ / NODE_M);
  const padF = new Float32Array(n * n);
  const padNum = new Float32Array(n * n);
  const skirtF = new Float32Array(n * n);
  const skirtNum = new Float32Array(n * n);
  const entries = new Map<number, Entry>();
  let dirty: NodeBounds | null = null;

  const write = (idx: number) => {
    const p = Math.min(1, padF[idx]!);
    const rest = 1 - p;
    const num = padNum[idx]! + rest * skirtNum[idx]!;
    const den = Math.max(1, padF[idx]! + rest * skirtF[idx]!);
    fd.data[idx] = num / den;
  };

  return {
    add: (id, pad) => {
      if (entries.has(id)) return;
      const index: number[] = [];
      const target: number[] = [];
      const weight: number[] = [];
      const isPad: number[] = [];
      for (const node of pad.nodes) {
        const ix = node.i - i0;
        const iz = node.j - j0;
        // The border ring stays at zero so the detail layer joins the coarse mesh without a crack.
        if (ix < 1 || iz < 1 || ix > n - 2 || iz > n - 2) continue;
        index.push(iz * n + ix);
        target.push(pad.floorY - baseY(node.i * NODE_M, node.j * NODE_M));
        weight.push(node.w);
        isPad.push(node.pad ? 1 : 0);
      }
      entries.set(id, {
        index: Int32Array.from(index),
        target: Float32Array.from(target),
        weight: Float32Array.from(weight),
        pad: Uint8Array.from(isPad),
        fraction: 0,
      });
    },
    setFraction: (id, fraction) => {
      const e = entries.get(id);
      if (!e) return;
      const f = Math.min(1, Math.max(0, fraction));
      const df = f - e.fraction;
      if (df === 0) return;
      e.fraction = f;
      for (let k = 0; k < e.index.length; k++) {
        const idx = e.index[k]!;
        if (e.pad[k]) {
          padF[idx] += df;
          padNum[idx] += df * e.target[k]!;
        } else {
          skirtF[idx] += df * e.weight[k]!;
          skirtNum[idx] += df * e.weight[k]! * e.target[k]!;
        }
        write(idx);
        const ix = idx % n;
        const iz = (idx - ix) / n;
        if (!dirty) dirty = { ix0: ix, iz0: iz, ix1: ix, iz1: iz };
        else {
          dirty.ix0 = Math.min(dirty.ix0, ix);
          dirty.iz0 = Math.min(dirty.iz0, iz);
          dirty.ix1 = Math.max(dirty.ix1, ix);
          dirty.iz1 = Math.max(dirty.iz1, iz);
        }
      }
      fd.version++;
    },
    takeDirty: () => {
      const out = dirty;
      dirty = null;
      return out;
    },
  };
}
