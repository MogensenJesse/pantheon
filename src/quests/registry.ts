// src/quests/registry.ts — every quest the game knows, in the order they are looked at
// (pure: no DOM, no game modules, node-runnable)

import { FAVOUR_QUESTS } from './favourQuests.ts';
import { FINALE_QUEST } from './finale.ts';
import { CONVERSION_QUEST, type QuestDef } from './quest.ts';
import { TEACHING_QUESTS } from './teachingQuests.ts';

export const QUESTS: readonly QuestDef[] = [
  CONVERSION_QUEST,
  ...TEACHING_QUESTS,
  ...FAVOUR_QUESTS,
  FINALE_QUEST,
];
