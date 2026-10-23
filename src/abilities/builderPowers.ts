// src/abilities/builderPowers.ts — what the two arch II powers aim at and do (pure: no DOM, no three)
//
//   Call rain    a storm front, centred where the cursor is
//   Clear skies  the weather is parted around the cursor for a while
//
// They are cast with the orb as the cursor in the overview: the cursor says which ground point it is over.
// The weather is reached through `BuilderWorld`, so the same code runs in the game and in node. Helping the
// village itself (wood, food, builders) is the orb's hand, not a power (src/hand).

import { VILLAGE } from '../config/village.ts';
import { WEATHER } from '../config/weather.ts';
import { headingToXZ } from '../core/math/geom.ts';
import type { Weather } from '../world/weather/weather.ts';
import { ABILITY_IDS, type AbilityDef, type AbilityTarget } from './abilities.ts';

const P = VILLAGE.BUILDER_POWERS;

export interface CursorAim {
  /** The ground point under the cursor, or null when it is over the sky or a panel. */
  ground: { x: number; z: number } | null;
}

export interface BuilderWorld {
  weather: Weather;
  /** The game clock the weather runs on, in seconds. */
  clock: () => number;
  /** Where the cloud wind blows toward, in degrees (a called storm moves with it). */
  windDirectionDeg: number;
}

export interface BuilderPowers {
  /** What a cast of `def` would aim at, from what the cursor is over; `id: -1` when nothing fits. */
  resolveTarget: (def: AbilityDef, aim: CursorAim) => AbilityTarget;
  /** Does the effect; false when the target does not fit (nothing is paid then). */
  perform: (def: AbilityDef, target: AbilityTarget) => boolean;
}

export function createBuilderPowers(world: BuilderWorld): BuilderPowers {
  return {
    resolveTarget: (def, aim) => {
      // Both powers need only a place under the cursor.
      if (!aim.ground) return { kind: def.targeting, id: -1 };
      return { kind: def.targeting, id: 0, x: aim.ground.x, z: aim.ground.z };
    },
    perform: (def, target) => {
      const id = target.id ?? -1;
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
