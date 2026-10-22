// src/quests/registry.ts — every quest the game knows, in the order they are looked at
// (pure: no DOM, no game modules, node-runnable)

import { CONVERSION_QUEST } from './content/conversion.ts';
import { FAVOUR_QUESTS } from './content/favours.ts';
import { FINALE_QUEST } from './content/finale.ts';
import { TEACHING_QUESTS } from './content/teaching.ts';
import type { QuestDef } from './quest.ts';

export const QUESTS: readonly QuestDef[] = [
  CONVERSION_QUEST,
  ...TEACHING_QUESTS,
  ...FAVOUR_QUESTS,
  FINALE_QUEST,
];

export const QUEST_BY_ID: ReadonlyMap<string, QuestDef> = new Map(QUESTS.map((d) => [d.id, d]));
