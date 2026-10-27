// src/world/village/sim/fieldsDesk.ts — how the fields grow, and what a reaping gives (pure, node-runnable)
//
// The village's fields grow each step, faster when tended, in rain and next to farmsteads, and a tended, ripe
// one is harvested into the stock and replanted. The orb's hand can also reap a ripe field (`takeHarvest`).
// The desk holds no state of its own: the fields, the buildings and the stock are the sim's.

import { VILLAGE } from '../../../config/village.ts';
import type { Modifiers } from '../../../skills/modifiers.ts';
import type { Building, Field } from '../model/types.ts';
import { type FieldBonus, fieldBonus } from './buildingEffects.ts';

/** Whether a field has grown enough to be reaped by hand. */
export const isRipe = (growth: number): boolean => growth >= VILLAGE.HAND.WHEAT.MIN_RIPE;

export interface FieldsDeskDeps {
  fields: readonly Field[];
  buildings: readonly Building[];
  /** The skills' numbers, read live. */
  mods: Pick<Modifiers, 'fieldYieldAdd'>;
  /** How much rain speeds growth, from the base rate of the thing that grows. */
  rainBoostOf: (base: number) => number;
  /** Puts food into the stock. */
  addFood: (food: number) => void;
}

export interface FieldsDesk {
  /** Food a reaping of the field gives as it stands: the yield (and what farmsteads and skills add) times its growth. */
  harvestOf: (field: Field) => number;
  /** Grows every field by `dt` seconds under `rain` (0..1), and harvests and replants the tended ones that are full. */
  grow: (dt: number, rain: number) => void;
  /** The hand reaps a ripe field: the food it gave (0 when there is no such field or it is not ripe), and it starts again. */
  takeHarvest: (fieldId: number) => number;
}

export function createFieldsDesk(deps: FieldsDeskDeps): FieldsDesk {
  const { fields, buildings, mods, rainBoostOf, addFood } = deps;
  /** What the farmsteads do for the field being looked at (reused, so a step allocates nothing). */
  const bonus: FieldBonus = { growthMul: 1, yieldAdd: 0 };

  const harvestOf = (field: Field): number => {
    fieldBonus(field, buildings, bonus);
    return (VILLAGE.ECONOMY.FIELD_YIELD + mods.fieldYieldAdd + bonus.yieldAdd) * field.growth;
  };

  return {
    harvestOf,
    grow: (dt, rain) => {
      const rainBoost = rainBoostOf(VILLAGE.FIELDS.RAIN_BOOST);
      for (const field of fields) {
        fieldBonus(field, buildings, bonus);
        const boost =
          (1 + VILLAGE.FIELDS.TEND_BOOST * Math.min(3, field.tenders)) *
          (1 + rainBoost * rain) *
          bonus.growthMul;
        field.growth = Math.min(1, field.growth + (dt / VILLAGE.FIELDS.GROW_S) * boost);
        // A tended, ripe field is harvested and replanted.
        if (field.growth >= 1 && field.tenders > 0) {
          addFood(harvestOf(field));
          field.growth = 0;
        }
      }
    },
    takeHarvest: (fieldId) => {
      const field = fields.find((f) => f.id === fieldId);
      if (!field || !isRipe(field.growth)) return 0;
      const food = harvestOf(field);
      field.growth = 0;
      return food;
    },
  };
}
