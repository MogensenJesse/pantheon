// src/quests/busEvents.ts — game events as the quests see them
// (pure: no DOM, no game modules, node-runnable)

import { type OutpostKind, outpostOf } from '../world/village/sim/outposts.ts';
import type { QuestEvent } from './quest.ts';

/**
 * A remote site's crew finished its camp. The bus names the site by its kind (`outpost:fishing`); a quest
 * hears the outpost's own kind, and nothing for a place of power being restored.
 */
export function outpostDoneEvent(
  siteKind: string,
): Extract<QuestEvent, { type: 'outpostDone' }> | null {
  const kind: OutpostKind | null = outpostOf(siteKind);
  return kind ? { type: 'outpostDone', kind } : null;
}
