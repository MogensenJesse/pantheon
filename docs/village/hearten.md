# Hearten

Design: `story-mechanics/VILLAGE_INTERACTION.md`. Numbers: `VILLAGE.HEARTEN` (`src/config/village/hearten.ts`, placeholders). Pure rules in `world/village/sim/hearten.ts`; the sim hook is `sim.heartenVillager`.

The hand of this game, kept small on purpose: the player **touches one villager** from the overview's info panel. Nothing is picked up, carried or thrown, and there is no good/evil score.

## What a touch does
- Costs `HEARTEN.FAITH` faith.
- Lifts the villager's work rate (`BOOST`) for `DURATION_DAYS` (it multiplies the blessing boost through `workBoost`).
- Gives back a lapsed belief and answers a prayer they voiced (`restoreBeliefOf`: someone who never believed is lifted but **not** converted; belief is won through the conversion quest).
- Cannot be repeated on that villager for `COOLDOWN_DAYS` from the touch.
Refusals (`HeartenResult`): `unknown` (no such or a dying villager), `cooldown`, `faith`.

## State
`VillageSimState.hearten`: `{ villager, left, cool }` per villager touched, saved (version 16), dropped when both reach 0, following `villagerDied` moves. `heartenProblem` checks it.

## Unlock
The milestone `prayers_5` (five prayers answered) opens the button (`heartenUnlocked` in `createOverviewUi`).

## View
The villager's panel shows a "Hearten · N faith" button with its note (cost, cooldown, what it does) and a "Heartened" row with hours left; a ✧ marks a lifted villager in the overview (a prayer is a ✦). A glow on the villager in the 3D view waits for models and a tint hook.

## Check
`npm run check:village-hearten`: the timers and the list, a touch's cost and refusals, lapsed belief and prayers, no conversion, a faster village, the panel, the save.
