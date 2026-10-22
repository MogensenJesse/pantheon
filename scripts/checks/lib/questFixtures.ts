// scripts/checks/lib/questFixtures.ts — what the quest checks share: a world to feed the rules
import type { QuestContext } from '../../../src/quests/quest.ts';

/** A world where nothing has happened yet (no converts, nothing awake); `over` changes what a check needs. */
export const world = (over: Partial<QuestContext> = {}): QuestContext => ({
  converts: 0,
  elderBelieves: false,
  converted: false,
  population: 10,
  milestones: [],
  awake: [],
  prayersOpen: 0,
  hunger: 'fed',
  upgradable: false,
  allRestored: false,
  dusk: false,
  orbAtTemple: false,
  energy: 0,
  templeShare: 0,
  ...over,
});

/** A village that has converted and grown a little: where the teaching quests, favours and the finale live. */
export const convertedWorld = (over: Partial<QuestContext> = {}): QuestContext =>
  world({ converts: 11, elderBelieves: true, converted: true, population: 11, ...over });
