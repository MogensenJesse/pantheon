// src/ui/village/villageText.ts — the words the village HUD, the overview chip and the info panel share
// (pure: no DOM, node-runnable)

import type { HungerStage } from '../../world/village/sim/hunger.ts';

const HUNGER_WORDS: Readonly<Record<HungerStage, string>> = {
  fed: '',
  empty: 'no food',
  weak: 'weak',
  dying: 'starving',
};

/** How the village is faring, in lowercase words: "" when fed, otherwise "no food", "weak" or "starving". */
export const hungerLabel = (stage: HungerStage): string => HUNGER_WORDS[stage];

/** The same with a capital, for a line of its own. */
export const hungerTitle = (stage: HungerStage): string => {
  const word = HUNGER_WORDS[stage];
  return word.charAt(0).toUpperCase() + word.slice(1);
};

/** "1 soul", "3 souls". */
export const count = (n: number, one: string, many: string = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;
