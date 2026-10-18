// src/world/village/model/buildings.ts — small questions about buildings that several systems ask
// (pure: no DOM, node-runnable)

import type { Building } from './types.ts';

/** The village's temple, or undefined before one exists. */
export const templeOf = (buildings: readonly Building[]): Building | undefined =>
  buildings.find((b) => b.type === 'temple');

/** Houses of any size (`house_*`). */
export const isHouse = (b: Building): boolean => b.type.startsWith('house_');

/** Built (stage 2); the opposite of `isOpenSite` in sim/construction. */
export const isFinished = (b: Building): boolean => b.stage >= 2;
