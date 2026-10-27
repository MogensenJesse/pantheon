// src/life/animals/animalPlacement.ts — how many animals a village keeps and where they graze (pure: node-runnable)
//
// Read-only on the village: nothing here changes the sim. The yard goes beside a granary (or a house), the pasture
// at the edge of the village on the side with the most room, near the fields if there are any.

import { life } from '../../config/visual/life.ts';
import { type Footprint, insideFootprint } from '../../core/math/geom.ts';
import { TAU } from '../../core/math/scalar.ts';
import type { AnimalKind } from './animalSim.ts';

const A = life.ANIMALS;

/** How many animals of a kind a village of `population` keeps (0 until someone lives there). */
export function animalCount(kind: AnimalKind, population: number): number {
  if (population <= 0) return 0;
  const spec = kind === 'sheep' ? A.SHEEP : A.CHICKEN;
  return Math.min(spec.MAX, Math.max(spec.MIN, Math.round(population / spec.PER_VILLAGERS)));
}

export interface Anchor {
  x: number;
  z: number;
  radiusM: number;
}

export interface PlacementInputs {
  /** The village centre and the radius it was founded with. */
  centreX: number;
  centreZ: number;
  radiusM: number;
  buildings: readonly (Footprint & { type: string })[];
  fields: readonly Footprint[];
  walkable: (x: number, z: number) => boolean;
}

/** The share of 12 points on a ring of `r` around (x, z) that are walkable (1 = all). */
function ringWalkable(
  walkable: PlacementInputs['walkable'],
  x: number,
  z: number,
  r: number,
): number {
  let ok = 0;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    if (walkable(x + Math.cos(a) * r, z + Math.sin(a) * r)) ok++;
  }
  return ok / 12;
}

/** Metres from (x, z) to the nearest building wall (a big number when there are none). */
function clearance(buildings: readonly Footprint[], x: number, z: number): number {
  let best = 99;
  for (const b of buildings) {
    // grow the footprint until the point is inside it: the margin at that moment is the distance to the wall
    for (let m = 0; m < best; m += 1) {
      if (insideFootprint(b, x, z, m)) {
        best = Math.min(best, m);
        break;
      }
    }
  }
  return best;
}

/** Where the hens live: beside the granary, else a house, on the outward side, on ground the yard fits. */
export function pickYard(input: PlacementInputs): Anchor | null {
  const radiusM = A.CHICKEN.HOME_RADIUS_M;
  const home =
    input.buildings.find((b) => b.type === 'granary') ??
    input.buildings.find((b) => b.type.startsWith('house'));
  if (!home) return null;
  const out = Math.atan2(home.x - input.centreX, home.z - input.centreZ);
  const reach = Math.max(home.halfW, home.halfD) + 1.5 + radiusM;
  let best: Anchor | null = null;
  let bestScore = -1;
  for (let i = 0; i < 16; i++) {
    // start on the outward side and work round
    const a = out + (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * (TAU / 16);
    const x = home.x + Math.sin(a) * reach;
    const z = home.z + Math.cos(a) * reach;
    if (!input.walkable(x, z)) continue;
    const score = ringWalkable(input.walkable, x, z, radiusM) - i * 0.01;
    if (score > bestScore) {
      best = { x, z, radiusM };
      bestScore = score;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

/** Where the sheep graze: the roomiest side at the village edge, a little nearer the fields when there are some. */
export function pickPasture(input: PlacementInputs): Anchor | null {
  const radiusM = A.SHEEP.HOME_RADIUS_M;
  const reach = input.radiusM + radiusM;
  let best: Anchor | null = null;
  let bestScore = -1;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const x = input.centreX + Math.sin(a) * reach;
    const z = input.centreZ + Math.cos(a) * reach;
    if (!input.walkable(x, z)) continue;
    const open = ringWalkable(input.walkable, x, z, radiusM * 0.8);
    const room = Math.min(clearance(input.buildings, x, z), 25) / 25;
    const nearField = input.fields.some((f) => Math.hypot(f.x - x, f.z - z) < 25) ? 0.25 : 0;
    const score = open * 2 + room + nearField;
    if (score > bestScore) {
      best = { x, z, radiusM };
      bestScore = score;
    }
  }
  return bestScore >= 1.6 ? best : null;
}
