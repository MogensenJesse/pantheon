// src/config/village.ts — village tunables: gameplay and pure-sim values (render look and budgets live in config/visual/village.ts)
//
// The values are kept by topic in village/*.ts and put together here, so `VILLAGE.<KEY>` is one record.

import { ECONOMY_PARTS } from './village/economy.ts';
import { LAYOUT } from './village/layout.ts';
import { LIFE } from './village/life.ts';
import { POWERS } from './village/powers.ts';
import { RESTORATION_PARTS } from './village/restoration.ts';
import { UPGRADES_PARTS } from './village/upgrades.ts';

export const VILLAGE = {
  ...LAYOUT,
  ...LIFE,
  ...ECONOMY_PARTS,
  ...POWERS,
  ...RESTORATION_PARTS,
  ...UPGRADES_PARTS,
} as const;
