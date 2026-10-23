// src/hand/overviewAim.ts — where the hand acts when the overview's cursor is the orb
// (pure: no DOM, no three, node-runnable)
//
// The cursor is a point on the ground, but a roof or a crown is clicked higher up than that: the ray goes on to
// the ground behind it. So a building the overview picked is put down at its middle and a field it picked is
// lifted from its middle; a tree or a sheep is found by the ground point under the cursor, as in the roam view.

import type { Selection } from '../world/village/model/selection.ts';
import type { Building, Field } from '../world/village/model/types.ts';
import type { Place } from './handTypes.ts';

export type OverviewHandMode = 'lift' | 'drop';

export interface OverviewHandWorld {
  readonly buildings: readonly Pick<Building, 'id' | 'x' | 'z'>[];
  readonly fields: readonly Pick<Field, 'id' | 'x' | 'z'>[];
}

/**
 * The place the hand acts at for a click: a picked building when putting down, a picked field when lifting,
 * otherwise the ground under the cursor. Null when the cursor is not over the ground.
 */
export function overviewPlace(
  mode: OverviewHandMode,
  pick: Selection | null,
  ground: Place | null,
  world: OverviewHandWorld,
): Place | null {
  if (mode === 'drop' && pick?.kind === 'building') {
    const b = world.buildings.find((x) => x.id === pick.id);
    if (b) return { x: b.x, z: b.z };
  }
  if (mode === 'lift' && pick?.kind === 'field') {
    const f = world.fields.find((x) => x.id === pick.id);
    if (f) return { x: f.x, z: f.z };
  }
  return ground ? { x: ground.x, z: ground.z } : null;
}
