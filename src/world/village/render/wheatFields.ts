// src/world/village/render/wheatFields.ts — the wheat in a field is grass: keeps the grass system's field mask in step with the sim
import type { GrassSystem } from '../../grass/core/GrassSystem';
import type { Field } from '../model/types';

export interface WheatFields {
  /** Mark a new field's plot as wheat. */
  add: (field: Field) => void;
  /** Re-mark fields whose growth moved enough to show (ripeness changes the height and the colour). */
  update: (fields: readonly Field[]) => void;
}

/** Growth change worth a (partial) texture upload. */
const RIPENESS_STEP = 0.04;

/** A no-op when the map has no grass. */
export function createWheatFields(grass: GrassSystem | undefined): WheatFields {
  const shown = new Map<number, number>();
  const push = (f: Field) => {
    shown.set(f.id, f.growth);
    grass?.setWheatField({
      id: f.id,
      x: f.x,
      z: f.z,
      rotY: f.rotY,
      halfW: f.halfW,
      halfD: f.halfD,
      ripeness: f.growth,
    });
  };
  return {
    add: (f) => {
      if (!shown.has(f.id)) push(f);
    },
    update: (fields) => {
      for (const f of fields) {
        const was = shown.get(f.id);
        if (was === undefined) continue;
        if (Math.abs(f.growth - was) >= RIPENESS_STEP || (f.growth >= 1 && was < 1)) push(f);
      }
    },
  };
}
