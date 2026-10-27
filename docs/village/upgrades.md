# Building upgrade levels

Design: `story-mechanics/VILLAGE_INTERACTION.md`. Numbers: `VILLAGE.UPGRADES` (`src/config/village/upgrades.ts`, placeholders). Pure rules in `world/village/sim/upgrades.ts`; level effects in `model/buildings.ts` (`levelBeds`, `levelCapFactor`).

A finished house, granary, workshop, farmstead or shrine can rise from level 1 to `MAX_LEVEL` (3). **The tree decides how high** (tier ceilings), **the village does it** (wood, faith, builder work), and the building **stays finished and in use** meanwhile.

## State
`Building.level` (1 as built) and `Building.upgrade` (builder-seconds still needed, 0 = none). Both are saved with the buildings (save version 14). `isOpenSite` is true for a site under construction **or** a building with `upgrade > 0`, so claims (`agentTargets.claimSlot`), the work tick (`agents`), the hand's `haul` and `haulRemote` and the open-site count treat an upgrade like any site; `workOn` (`villageSim`) moves a stage on, or an upgrade towards its level.

## Building effects
What a finished building and its level do. The ones that touch the economy are **derived** each step from the buildings as they stand (`sim/buildingEffects.ts`, a pure pass, nothing saved): with no such building every factor is exactly 1 and every bonus exactly 0, so a village without them plays, hashes and saves as before (`check:village-effects` and `check:village-golden`). The per-building shares (`farmsteadGrowth`, `farmsteadYield`, `shrineShare`, `workshopShare`) are read by the sim and by the overview's panel alike, so the panel cannot say something else than the sim does. Numbers: `VILLAGE.EFFECTS` (`src/config/village/effects.ts`, placeholders) and `VILLAGE.UPGRADES`.
- **House**: `+BEDS_PER_LEVEL` beds per level above 1 (`bedsOf`).
- **Granary / workshop**: capacity `×(1 + STORE_CAP_SHARE × (level − 1))` (`capsOf`).
- **Workshop**: each level above 1 adds `WORKSHOP.CHOP_PER_LEVEL` to the woodcutters' speed (`chopMul`, fed to `ForestRules.treeBoost`, which also speeds the regrowth of saplings; see [forest](forest.md)), up to `MAX_CHOP_ADD`.
- **Farmstead** (plot only): the fields within `FARMSTEAD.RADIUS_M` of a finished farmstead grow `GROWTH_PER_LEVEL` faster and give `YIELD_PER_LEVEL` more food per harvest, per level; farmsteads stack up to `MAX_GROWTH_ADD` and `MAX_YIELD_ADD`. Read in the field loop, the tended harvest and `takeHarvest` through `fieldBonus` (called by `sim/fieldsDesk.ts`; see [economy](economy.md)).
- **Shrine** (plot only): `SHRINE.FAITH_PER_LEVEL` faith per second per level, up to `MAX_FAITH_ADD` (`shrineFaith`), added to the base rate before the presence and the multiplier.
- **Fervour** (skill node): `Modifiers.faithMul` multiplies all faith income. `stepFaith` takes `bonusRate` and `mul`: `rate = (base + bonus) × mul × presence`, on the hamlet and the sandbox paths alike.
- **Plot types are opened by the tree**: Farmsteads and Shrines switch on `plotFarmstead` and `plotShrine` (`PLOT_UNLOCKS`, `plotTypeOpen` in `model/buildings.ts`); a closed type answers `'locked'` from `plotCheck`; see [plots](plots.md). Farmstead and shrine belong to the upgrade group `works` (ceiling `workTier`, raised by Fine works), which is why `workTier` and `'works'` name them.

## Tiers from the tree
Modifiers `houseTier`, `storeTier` and `workTier` (neutral 1). Nodes in arch II: Stone hearths (house tier 2), Great halls (house tier 3, gate `folk_20`), Deep stores (store tier 2), Vaults (store tier 3, gate `first_place`), Fine works (works tier, two ranks, gate `level_2`; the groups are `house`, `store` and `works`, the last for the farmstead and the shrine). `tierCeiling(b, mods)` gives the highest level a building may reach.

## Starting one
- `sim.upgrade(id, events)` (via `VillageSystemContext.upgrade`): checks `checkUpgrade` (unsupported, unfinished, busy, maxed, tier) then the active cap (`MAX_ACTIVE`), faith and wood; pays and starts. The overview panel's "Raise to level N" button calls it.
- The planner tries it when it did not start a new site (`nextUpgrade`: lowest level first, houses before stores, then the oldest; no random draw).

## View
While an upgrade runs the building shows the planks stockpile of an open site (`VillageView.upgradeStarted/Completed`); a visible change per level waits for models.

## Check
`npm run check:village-levels` (`scripts/checks/village/levels-check.ts`): rules and refusals, cost per step, beds and capacity, payment, the active cap, builders raising it, wood hauled to an upgrade, the planner, the overview panel, a save mid-upgrade.
