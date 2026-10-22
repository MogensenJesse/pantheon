// src/quests/registry.ts — every quest the game knows, in the order they are looked at
// (pure: no DOM, no game modules, node-runnable)

import { CONVERSION_QUEST, type QuestDef } from './quest.ts';

export const QUESTS: readonly QuestDef[] = [CONVERSION_QUEST];
