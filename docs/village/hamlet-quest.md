# Hamlet, belief and the conversion quest

The other quests, the memory book and the last night's cutscene are in [quests.md](quests.md).

## The hamlet
`createVillageSim({ mode })`: `'hamlet'` is the game's village; a DEV `?sandbox` visit or the headless default is `'sandbox'`, the older village that grows on its own around an authored `villageSeed` (its fingerprints are the ones `check:village-smoke` prints).

A hamlet is founded finished (`foundHamlet`: temple, `VILLAGE.HAMLET.HOUSES` houses, `FIELDS` fields and the well at no cost, `VILLAGERS` people with **no builders**) and **does not grow, bring newcomers, start fields or earn faith until it is converted** (`converted` is false; the update loop returns before the planner and newcomer timers). Growth in a sandbox village is **faith**-driven: a slow base rate (`FAITH.BASE_PER_SEC`), sped up by the orb's presence from Phase 1.

## Belief
- `villagers.belief` (0..1 per person; at 1 they believe) and `elder` (the first priest, a villager index) are part of the sim and the save.
- Faith income in a hamlet is `believerIncome` (believers x `FAITH.PER_BELIEVER_PER_SEC`) with the orb's presence boost on top; a sandbox village keeps the flat base rate.
- `sim/belief.ts` (pure): `believes`, `countBelievers`, `beliefShare`, `raiseBelief`. The sparks for converts (`sparksForConvert`, one per convert after the fifth) and `SPARKS_AT_CONVERSION` are the quest's.
- `sim.addBelief(i, amount, events)` is how the powers and the DEV hook raise belief: it emits `villagerConverted` when a villager reaches 1.
- Belief never converts the village by itself: the conversion quest calls `sim.convertVillage(events)` (through `village.convert()`) when it ends, which emits `villageConverted` once. `VillageSystem` turns them into bus events `village:villagerConverted` and `village:converted`; `src/gameplay/progression.ts` grants the sparks and sets `state.phase = 2` on the latter. Newcomers to a converted hamlet arrive believing.
- The temple's crown orb and beam follow the share of believers in a hamlet (`VillageView.frame`); `VillageHud` shows "N believe" once the first villager believes.

## Conversion powers
`abilities/powers.ts` (pure, reaches the village through `PowerWorld`: pool, buildings, `addBelief`, `notice`). Numbers: `PHASE0.POWERS`.
- **Murmur** (free with the tree, targeting `villager`): a channel on the nearest villager outdoors within reach, 1 energy/s, belief +1/20 per second; it ends when the orb is too far, the energy runs out, the villager reaches 1, or Murmur is cast again; the villager stands still facing the orb.
- **Dream** (node, `house`): the nearest finished house within reach, every sleeper indoors gains belief, once per house per night (`NightClock` counts nights by day-phase crossings of sunset).
- **Sign** (node, `cursor`): everyone outdoors and awake near the orb gains belief and stops to look; it refuses when nobody can see it; `orbSystem.burstAt` shows sparkles.
- `createPowers(world, energy)` gives `perform`, `resolveTarget` (what the radial menu's cast aims at; id -1 means nothing, which the caster reports as "Nothing to aim at"), `murmurTarget`/`dreamTarget` (for the rings) and `update(dt, orb, dayPhase)` from the fixed step.
- Villagers "notice" through `sim.notice(i, x, z, seconds)` (`agents.ts`: they stop, show the Idle pose and face the point, and take up their path or work afterwards; nothing is saved).

## Conversion quest
- The quest engine is in [quests.md](quests.md). The conversion quest is `CONVERSION_QUEST` in `src/quests/content/conversion.ts`: hidden `meet` → `convert` 5 villagers → `fire` (a Sign near the temple at dusk) → `offering` (stand near the temple with enough energy while it flows) → `believe` (the elder; the village then converts). Numbers in `PHASE0.QUEST`. The rules for the meeting (`elderMeets`), the offering (`offeringRate`), the elder's belief (`elderOpenToBelief`) and the spark for each convert (`sparksForConvert`) are pure too, in the same file. Its lines are in `src/story/story.ts` (`BEATS`), all marked PLACEHOLDER.
- `questRuntime.ts` (`initQuest`) feeds the quests from the game, holds the elder still at the meeting (`village.notice`) and ends the conversion quest by converting the village. It exposes `canBelieve(i)`, false for the elder until his step; it is passed to the powers as `PowerWorld.canBelieve`, and `createPowers` gates on it in one place (`gateBelief`: no power raises a gated villager, Murmur never targets or rings one).
- Only a hamlet has quests; a DEV `?sandbox` village has none (and saves a finished conversion quest).
- The objective line (the conversion quest's, then the restoration goals) and the memory book are in `src/ui/quests/` (see [quests.md](quests.md)); the elder has a larger pip (`.po-pip.is-elder`) after the meeting.
- World markers (`src/ui/overlay/`): `worldMarkers.ts` (`createMarkerLayer`: a pool of DOM elements placed from the camera each frame, hidden behind the camera, never taking a click, in the HUD layer) and `powerOverlay.ts` (a faint lilac pip above each villager with belief near the orb, a thin ring on the villager Murmur would reach and the house Dream would reach; hidden while a modal panel is open).

## DEV
`window.__pantheonQuest` (`dev/runtime/questProbe.ts`, see [quests.md](quests.md)): `state()`, `objective()`, `elderMet()`, `elder()`, `aera()`, `canBelieve(i)`, `playCutscene()`; `__pantheonVillage.convertNow()` converts the hamlet at once. `window.__pantheonPowers` (`dev/runtime/powersProbe.ts`): `reach()`, `murmurActive()`, `murmurTarget()`, `isNight()`, `nightId()`, `villagers()`, `houses()`; `__pantheonVillage.setDayPhase(p | null)` runs the village on a given phase (0.95 night, 0.4 morning).

## Checks
`npm run check:village-hamlet` (`scripts/checks/village/hamlet-check.ts`: the hamlet's founding, that it stays frozen, belief, faith from believers, the conversion rule and what follows), `check:powers`, `check:quests`, `check:quest-content`, `check:finale` and `check:cinematic` (see [quests.md](quests.md)).
