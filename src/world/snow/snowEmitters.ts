// src/world/snow/snowEmitters.ts — footprints for the village's walkers: one print per stride, the feet alternating
//
// The sources are read, never written: the villagers' arrays and the sheep the orb's hand can name (life/animals). Walkers
// far from the orb leave nothing (the tracks window could not hold it) and neither do walkers indoors or on ground with
// less than `MIN_PRINT_DEPTH_M` of snow. Stride maths: cpu/snowStride.ts.
import { VISUAL } from '../../config/visualTuning';
import type { Villagers } from '../village/model/types';
import { type StridePoint, walkStride } from './cpu/snowStride';
import type { SnowBrush } from './snowField';

/** Thinner snow than this takes no print (the shell is not drawn there either). */
const MIN_PRINT_DEPTH_M = 0.05;
/** A walker that moves more than this many strides between two looks was moved, not walked: one print. */
const MAX_STAMPS = 12;
/** The sheep are looked up this often (s); they cover little ground in that time. */
const SHEEP_POLL_S = 0.1;

interface WalkerBrush {
  halfA: number;
  halfB: number;
  depthM: number;
  bermM: number;
  strideM: number;
  trackM: number;
}

interface Walker extends StridePoint {
  /** Which foot is next: -1 or 1 (the side of the heading). */
  foot: number;
  /** The poll this sheep was last seen in. */
  seen: number;
}

export interface SnowEmitterSources {
  /** The village's people (null on a map without a village). */
  villagers: () => Pick<Villagers, 'count' | 'x' | 'z' | 'indoors' | 'dying'> | null | undefined;
  /** The free, full-grown sheep within a radius of a point, written to `out` (null with no flocks). */
  sheepWithin:
    | ((
        x: number,
        z: number,
        radiusM: number,
        out: { id: number; x: number; z: number }[],
      ) => { id: number; x: number; z: number }[])
    | null;
}

export interface SnowEmitters {
  /** Once a frame: queues the prints the walkers within `rangeM` of the orb left since the last look. */
  update: (frameDelta: number, orb: { x: number; z: number }, rangeM: number) => void;
  /** Forget where everyone was (the shell went off, or the player jumped): nobody prints a line across the gap. */
  reset: () => void;
}

const newWalker = (): Walker => ({ x: Number.NaN, z: 0, foot: 1, seen: 0 });

export function createSnowEmitters(
  queue: (brush: SnowBrush) => void,
  depthAt: (x: number, z: number) => number,
  sources: SnowEmitterSources,
): SnowEmitters {
  const people: Walker[] = [];
  const sheep = new Map<number, Walker>();
  const spots: { id: number; x: number; z: number }[] = [];
  const to: StridePoint = { x: 0, z: 0 };
  let pollT = 0;
  let poll = 0;

  // the walker being stepped, so `walkStride` gets one callback for good and a frame allocates nothing
  let cur: Walker = newWalker();
  let curBrush: WalkerBrush = VISUAL.snow.brushes.villager;
  const print = (x: number, z: number, dirX: number, dirZ: number): void => {
    if (depthAt(x, z) < MIN_PRINT_DEPTH_M) return;
    cur.foot = -cur.foot;
    const side = (curBrush.trackM / 2) * cur.foot;
    queue({
      x: x - dirZ * side,
      z: z + dirX * side,
      halfA: curBrush.halfA,
      halfB: curBrush.halfB,
      dirX,
      dirZ,
      depthM: curBrush.depthM,
      bermM: curBrush.bermM,
    });
  };
  const step = (brush: WalkerBrush, w: Walker, x: number, z: number): void => {
    cur = w;
    curBrush = brush;
    to.x = x;
    to.z = z;
    walkStride(w, to, brush.strideM, MAX_STAMPS, print);
  };

  return {
    update: (frameDelta, orb, rangeM) => {
      const brushes = VISUAL.snow.brushes;
      const range2 = rangeM * rangeM;
      const v = sources.villagers();
      if (v) {
        for (let i = 0; i < v.count; i++) {
          while (people.length <= i) people.push(newWalker());
          const w = people[i]!;
          const dx = v.x[i]! - orb.x;
          const dz = v.z[i]! - orb.z;
          if (v.indoors[i] !== 0 || v.dying[i]! > 0 || dx * dx + dz * dz > range2) {
            w.x = Number.NaN;
            continue;
          }
          step(brushes.villager, w, v.x[i]!, v.z[i]!);
        }
      }
      pollT += frameDelta;
      if (sources.sheepWithin && pollT >= SHEEP_POLL_S) {
        pollT = 0;
        poll++;
        for (const s of sources.sheepWithin(orb.x, orb.z, rangeM, spots)) {
          const w = sheep.get(s.id) ?? newWalker();
          sheep.set(s.id, w);
          w.seen = poll;
          step(brushes.sheep, w, s.x, s.z);
        }
        // sheep that left the flock or the range start fresh when they are back
        for (const [id, w] of sheep) if (w.seen !== poll) sheep.delete(id);
      }
    },
    reset: () => {
      people.length = 0;
      sheep.clear();
    },
  };
}
