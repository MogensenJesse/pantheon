// src/hand/overviewAim.ts — where the hand acts when the overview's cursor is the orb
// (pure: no DOM, no three, node-runnable)
//
// The cursor is a point on the ground, but a roof or a crown is clicked higher up than that: the ray goes on to
// the ground behind it. So a building the overview picked is put down at its middle and a ripe field it picked
// is lifted from its middle; a tree or a sheep is found by the ground point under the cursor, as in the roam view.

import type { Selection } from '../world/village/model/selection.ts';
import type { Building, Field } from '../world/village/model/types.ts';
import { isRipe } from './handRules.ts';
import type { Place } from './handTypes.ts';

export type OverviewHandMode = 'lift' | 'drop';

export interface OverviewHandWorld {
  readonly buildings: readonly Pick<Building, 'id' | 'x' | 'z'>[];
  readonly fields: readonly Pick<Field, 'id' | 'x' | 'z' | 'growth'>[];
}

/**
 * The place the hand acts at for a click: a picked building when putting down, a picked ripe field when lifting,
 * otherwise the ground under the cursor (an unripe field has nothing to lift, so it is just ground: a tree
 * beside it can still be reached from the cursor). Null when the cursor is not over the ground.
 * The place is written to `out` (a new object when none is given).
 */
export function overviewPlace(
  mode: OverviewHandMode,
  pick: Selection | null,
  ground: Place | null,
  world: OverviewHandWorld,
  out: { x: number; z: number } = { x: 0, z: 0 },
): Place | null {
  const at = (x: number, z: number) => {
    out.x = x;
    out.z = z;
    return out;
  };
  if (mode === 'drop' && pick?.kind === 'building') {
    const b = world.buildings.find((x) => x.id === pick.id);
    if (b) return at(b.x, b.z);
  }
  if (mode === 'lift' && pick?.kind === 'field') {
    const f = world.fields.find((x) => x.id === pick.id);
    if (f && isRipe(f.growth)) return at(f.x, f.z);
  }
  return ground ? at(ground.x, ground.z) : null;
}

/** Who takes a click on the village in the overview. */
export type ClickOwner = 'tool' | 'power' | 'none';

/**
 * The tool (the hand) takes the click when it is armed, and whenever it holds something, whatever else is
 * armed: a held thing must be put down or put back before anything else is cast. Otherwise an armed power
 * takes it, and with nothing armed the click goes on to the info panel's selecting.
 */
export function clickOwner(
  armed: string | null,
  toolId: string | undefined,
  toolBusy: boolean,
): ClickOwner {
  if (toolId !== undefined && (toolBusy || armed === toolId)) return 'tool';
  return armed === null ? 'none' : 'power';
}

/** Whether power `id` may be armed now: not another one while the tool holds something. */
export function canArm(id: string, toolId: string | undefined, toolBusy: boolean): boolean {
  return !toolBusy || id === toolId;
}
