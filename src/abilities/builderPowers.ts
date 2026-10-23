// src/abilities/builderPowers.ts — what the five arch II powers aim at and do (pure: no DOM, no three)
//
//   Blessing     a field, a finished house or a tree works or grows faster for a while
//   Kindle       the current stage of a construction site is done at once
//   Provide      food appears in the larder
//   Call rain    a storm front, centred where the cursor is
//   Clear skies  the weather is parted around the cursor for a while
//
// They are cast with the orb as the cursor in the overview: the cursor says what is under it
// (a villager, a building or a field, as the overview picks them) and which ground point it is over. The
// village and the weather are reached through `BuilderWorld`, so the same code runs in the game and in node.

import { VILLAGE } from '../config/village.ts';
import { WEATHER } from '../config/weather.ts';
import { distXZ, headingToXZ } from '../core/math/geom.ts';
import { isFinished, isHouse } from '../world/village/model/buildings.ts';
import type { Selection } from '../world/village/model/selection.ts';
import type { Building, Field } from '../world/village/model/types.ts';
import type { BlessKind } from '../world/village/sim/blessings.ts';
import { TreeState } from '../world/village/sim/forest.ts';
import type { Weather } from '../world/weather/weather.ts';
import { ABILITY_IDS, type AbilityDef, type AbilityTarget } from './abilities.ts';

const P = VILLAGE.BUILDER_POWERS;

const TREE_AIM_M: number = P.AIM_M.TREE;
const SITE_AIM_M: number = P.AIM_M.SITE;

/** What is under the cursor, as the overview picks it. */
export type CursorPick = Selection | null;

export interface CursorAim {
  pick: CursorPick;
  /** The ground point under the cursor, or null when it is over the sky or a panel. */
  ground: { x: number; z: number } | null;
}

export interface BuilderWorld {
  fields: readonly Field[];
  buildings: readonly Building[];
  forest: {
    count: number;
    info: (id: number) => { x: number; z: number };
    state: (id: number) => number;
  };
  /** The village's side of the powers; each says whether it took effect. */
  bless: (kind: BlessKind, id: number, seconds: number) => boolean;
  kindle: (siteId: number) => boolean;
  provide: (food: number) => boolean;
  weather: Weather;
  /** The game clock the weather runs on, in seconds. */
  clock: () => number;
  /** Where the cloud wind blows toward, in degrees (a called storm moves with it). */
  windDirectionDeg: number;
}

/** The standing tree or sapling nearest a ground point within `TREE_AIM_M`, or -1. */
function treeNear(world: BuilderWorld, x: number, z: number): number {
  let best = -1;
  let bestD = TREE_AIM_M;
  for (let id = 0; id < world.forest.count; id++) {
    const s = world.forest.state(id);
    if (s !== TreeState.Standing && s !== TreeState.Sapling) continue;
    const t = world.forest.info(id);
    const d = distXZ(t.x, t.z, x, z);
    if (d <= bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** The open site nearest a ground point within `SITE_AIM_M`, or null. */
function siteNear(world: BuilderWorld, x: number, z: number): Building | null {
  let best: Building | null = null;
  let bestD = SITE_AIM_M;
  for (const b of world.buildings) {
    if (isFinished(b)) continue;
    const d = distXZ(b.x, b.z, x, z);
    if (d <= bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export interface BuilderPowers {
  /** What a cast of `def` would aim at, from what the cursor is over; `id: -1` when nothing fits. */
  resolveTarget: (def: AbilityDef, aim: CursorAim) => AbilityTarget;
  /** Does the effect; false when the target does not fit (nothing is paid then). */
  perform: (def: AbilityDef, target: AbilityTarget) => boolean;
}

export function createBuilderPowers(world: BuilderWorld): BuilderPowers {
  const none = (kind: AbilityTarget['kind']): AbilityTarget => ({ kind, id: -1 });

  const blessTarget = (aim: CursorAim): AbilityTarget => {
    const { pick, ground } = aim;
    if (pick?.kind === 'field') return { kind: 'bless', of: 'field', id: pick.id };
    if (pick?.kind === 'building') {
      const b = world.buildings.find((o) => o.id === pick.id);
      if (b && isHouse(b) && isFinished(b)) return { kind: 'bless', of: 'house', id: b.id };
    }
    if (ground) {
      const tree = treeNear(world, ground.x, ground.z);
      if (tree >= 0) return { kind: 'bless', of: 'tree', id: tree };
    }
    return none('bless');
  };

  const siteTarget = (aim: CursorAim): AbilityTarget => {
    const { pick, ground } = aim;
    if (pick?.kind === 'building') {
      const b = world.buildings.find((o) => o.id === pick.id);
      if (b && !isFinished(b)) return { kind: 'site', id: b.id };
    }
    const near = ground ? siteNear(world, ground.x, ground.z) : null;
    return near ? { kind: 'site', id: near.id } : none('site');
  };

  return {
    resolveTarget: (def, aim) => {
      if (def.targeting === 'bless') return blessTarget(aim);
      if (def.targeting === 'site') return siteTarget(aim);
      // Provide, Call rain and Clear skies need only a place under the cursor.
      if (!aim.ground) return none(def.targeting);
      return { kind: def.targeting, id: 0, x: aim.ground.x, z: aim.ground.z };
    },
    perform: (def, target) => {
      const id = target.id ?? -1;
      if (def.id === ABILITY_IDS.blessing) {
        const kind = target.of as BlessKind | undefined;
        if (id < 0 || !kind) return false;
        return world.bless(kind, id, P.BLESSING.SECONDS);
      }
      if (def.id === ABILITY_IDS.kindle) return id >= 0 && world.kindle(id);
      if (def.id === ABILITY_IDS.provide) return id >= 0 && world.provide(P.PROVIDE.FOOD);
      if (target.x === undefined || target.z === undefined || id < 0) return false;
      const now = world.clock();
      if (def.id === ABILITY_IDS.callRain) {
        const heading = headingToXZ(world.windDirectionDeg);
        world.weather.addFront({
          x: target.x,
          z: target.z,
          dirX: heading.x,
          dirZ: heading.z,
          // a called storm lingers: slower than the weather's own
          speed: WEATHER.SPEED_MPS * P.CALL_RAIN.SPEED_MUL,
          radius: P.CALL_RAIN.RADIUS_M,
          peak: P.CALL_RAIN.PEAK,
          crossS: now,
        });
        return true;
      }
      if (def.id === ABILITY_IDS.clearSkies) {
        world.weather.clearSkies({
          x: target.x,
          z: target.z,
          radius: P.CLEAR_SKIES.RADIUS_M,
          edgeM: WEATHER.EDGE_M,
          fromS: now,
          untilS: now + P.CLEAR_SKIES.SECONDS,
        });
        return true;
      }
      return false;
    },
  };
}
