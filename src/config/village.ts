// src/config/village.ts — village tunables: gameplay and pure-sim values (render look and budgets live in config/visual/village.ts)
//
// The values are kept by topic in village/*.ts and put together here, so `VILLAGE.<KEY>` is one record.

import { ECONOMY_PARTS } from './village/economy.ts';
import { EFFECTS_PARTS } from './village/effects.ts';
import { HAND_PARTS } from './village/hand.ts';
import { HEARTEN_PARTS } from './village/hearten.ts';
import { LAYOUT } from './village/layout.ts';
import { LIFE } from './village/life.ts';
import { OUTPOSTS_PARTS } from './village/outposts.ts';
import { POWERS } from './village/powers.ts';
import { PRAYERS_PARTS } from './village/prayers.ts';
import { RESTORATION_PARTS } from './village/restoration.ts';
import { UPGRADES_PARTS } from './village/upgrades.ts';

export const VILLAGE = {
  ...LAYOUT,
  ...LIFE,
  ...ECONOMY_PARTS,
  ...EFFECTS_PARTS,
  ...POWERS,
  ...PRAYERS_PARTS,
  ...HEARTEN_PARTS,
  ...HAND_PARTS,
  ...OUTPOSTS_PARTS,
  ...RESTORATION_PARTS,
  ...UPGRADES_PARTS,
} as const;
