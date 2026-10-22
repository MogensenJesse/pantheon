// src/gameplay/progression.ts — what the player is given for what happens in the village
//
// Sparks for converts and for the conversion, the hand-over to phase 2 when the village converts and to
// phase 3 when the name returns, and Echo (each orb picked up leaves a trace of faith). The quests' own
// rewards are given by the quest runtime; this is everything else that follows from village events.

import { PHASE0 } from '../config/phase0';
import { bus } from '../core/EventBus';
import { state } from '../core/state/gameState';
import { sparksForConvert } from '../quests/content/conversion';
import { FINALE_QUEST } from '../quests/content/finale';
import { modifiers } from '../skills/modifiers';
import type { SkillRuntime } from '../skills/skillRuntime';
import { isFinished } from '../world/village/model/buildings';
import type { VillageSystemContext } from '../world/village/VillageSystem';

export interface ProgressionDeps {
  skills: Pick<SkillRuntime, 'grantSparks'>;
  /** Null when the map has no village. */
  village: Pick<VillageSystemContext, 'addFaith'> | null;
}

/**
 * Arch II opens, and gives sparks, as the converted village earns faith, and the village's milestones are
 * recorded. Returns a per-frame step that looks once a second.
 */
export function createVillageSkillSync(
  skills: Pick<SkillRuntime, 'syncVillage' | 'syncMilestones'>,
  village: Pick<VillageSystemContext, 'sim'> | null,
  restoredPlaces: () => number,
  nameReturned: () => boolean,
): (dt: number) => void {
  let since = 0;
  return (dt) => {
    since += dt;
    if (!village || since < 1) return;
    since = 0;
    skills.syncVillage({
      converted: village.sim.converted,
      faithEarned: village.sim.faith.earned,
    });
    if (village.sim.converted) {
      skills.syncMilestones({
        restoredPlaces: restoredPlaces(),
        population: village.sim.villagers.count,
        finishedBuildings: village.sim.buildings.filter(isFinished).length,
        maxBuildingLevel: village.sim.buildings.reduce((m, b) => Math.max(m, b.level), 1),
        prayersAnswered: village.sim.prayers.answered,
        nameReturned: nameReturned() ? 1 : 0,
      });
    }
  };
}

/** Wires the rewards; returns the teardown. */
export function initProgression(deps: ProgressionDeps): () => void {
  // A spark for each convert past the goal; the hamlet converting gives a few more and moves the game
  // on to phase 2. (A closed skill tree holds no sparks, so converts before it opens give none.)
  const offConvert = bus.on('village:villagerConverted', ({ converts }) => {
    deps.skills.grantSparks(sparksForConvert(converts));
  });
  const offConverted = bus.on('village:converted', () => {
    state.phase = Math.max(state.phase, 2);
    deps.skills.grantSparks(PHASE0.QUEST.SPARKS_AT_CONVERSION);
  });
  // The name returns: the game moves on to the Deity phase (not built yet; the gate opens).
  const offQuestDone = bus.on('quest:done', ({ id }) => {
    if (id === FINALE_QUEST.id) state.phase = Math.max(state.phase, 3);
  });
  const offEcho = deps.village
    ? bus.on('orb:absorbed', () => {
        if (modifiers.orbFaithTrail > 0) deps.village?.addFaith(modifiers.orbFaithTrail);
      })
    : () => {};
  return () => {
    offConvert();
    offConverted();
    offQuestDone();
    offEcho();
  };
}
