// src/quests/content/questBuilders.ts — the shape the one-step quests share
// (pure: no DOM, no game modules, node-runnable)
//
// A teaching quest or a favour is a single step: the elder asks (`<id>-ask`, said when it begins), the player
// does the thing once, the elder answers (`<id>-done`) and a spark is paid.

import type { MilestoneId } from '../../skills/milestones.ts';
import type { QuestContext, QuestDef, QuestKind, QuestStep } from '../quest.ts';

/** Sparks a one-step quest pays. */
export const ONE_STEP_SPARKS = 1;

/** The milestone has been reached. */
export const reached = (ctx: QuestContext, id: MilestoneId): boolean => ctx.milestones.includes(id);

export interface OneStepQuest {
  id: string;
  kind: Extract<QuestKind, 'teaching' | 'favour'>;
  /** The rest of the rule for beginning (a converted village is always needed). */
  available?: (ctx: QuestContext) => boolean;
  step: Pick<QuestStep, 'id' | 'text' | 'goal' | 'advance'>;
  /** A memory fragment the closing tells. */
  fragment?: number;
}

export const oneStepQuest = (q: OneStepQuest): QuestDef => ({
  id: q.id,
  kind: q.kind,
  intro: `${q.id}-ask`,
  available: q.available,
  steps: [
    {
      ...q.step,
      reward: { sparks: ONE_STEP_SPARKS, beat: `${q.id}-done`, fragment: q.fragment },
    },
  ],
});
