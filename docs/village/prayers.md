# Prayers

Design: `story-mechanics/VILLAGE_INTERACTION.md`. Numbers: `VILLAGE.PRAYERS` (`src/config/village/prayers.ts`, placeholders). Pure rules in `world/village/sim/prayers.ts`; the sim steps them in `villageSim.update` right after hunger.

A believer voices a need the village has; the player (or the village itself) can answer it. An answer pays faith and counts towards a milestone. A prayer left unanswered costs that villager their belief: they stop believing and earn no faith until they recover.

## Needs
Read from the village as it is; each must have held for `NEED_DAYS` before anyone prays.
- **food**: the larder ran out at the last meal (`economy.hungry`). Answered at the next meal that is served in full.
- **rain**: there are fields and no rain (`rain01 <= DRY_BELOW`) for days. A farmer prays when there is one. Answered by rain (`>= RAIN_ANSWERS`): the weather or a power.
- **shelter**: a villager has no bed (`home === 0`). That villager prays. Answered when they get a bed.
(Healing, from the plan, waits for a sickness mechanic.)

At most `MAX_OPEN` prayers at once, one per villager, one per need. Who prays is chosen without a random draw (the lowest-index believer the need touches). Nobody prays before the village is converted.

## Answered and lapsed
- **Answered** (the need is met by any means): belief back to 1, `ANSWER_FAITH` faith, `answered` + 1, event `prayerAnswered` (bus `village:prayer`).
- **Lapsed** (`PATIENCE_DAYS` pass): belief drops to `LAPSED_BELIEF` (< 1, so the villager is no believer: `countBelievers`, the hamlet's faith income), they are noted as lapsed, event `prayerLapsed`.
- **Recovery**: the lapsed believe again by themselves after `RECOVER_DAYS` with no open prayer, or at once when restored (`sim.restoreBelief`, used by Hearten).
- A prayer follows its villager when `villagerDied` moves the last villager into a freed slot (`removeVillager`); a dying villager's prayer is dropped.

## State and save
`VillageSimState.prayers` = `{ open, held, lapsed, calmS, answered }` (save version 15); `prayersProblem` checks it. `held` is how long each need has held.

## Milestones
`prayers_5` and `prayers_25` (`prayersAnswered` in the snapshot) gate skills and verbs like any other milestone.

## View
Overview: a star over each praying villager, a "Prays" row in the villager's panel with the hours left. Toasts for a prayer voiced, answered and lapsed (`ui/village/villageAlerts.ts`).

## Check
`npm run check:village-prayers`: pure rules (needs, the cap, answers, lapses, recovery, index moves, save validation) and, in the village, starvation prayers, payment, lost belief and a save mid-prayer. The `famine` golden changed because belief now falls in a famine.
