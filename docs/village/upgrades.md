# Building upgrade levels

Design: `story-mechanics/VILLAGE_INTERACTION.md`. Numbers: `VILLAGE.UPGRADES` (`src/config/village/upgrades.ts`, placeholders). Pure rules in `world/village/sim/upgrades.ts`; level effects in `model/buildings.ts` (`levelBeds`, `levelCapFactor`).

A finished house, granary, workshop, farmstead or shrine can rise from level 1 to `MAX_LEVEL` (3). **The tree decides how high** (tier ceilings), **the village does it** (wood, faith, builder work), and the building **stays finished and in use** meanwhile.

## State
`Building.level` (1 as built) and `Building.upgrade` (builder-seconds still needed, 0 = none). Both are saved with the buildings (save version 14). `isOpenSite` is true for a site under construction **or** a building with `upgrade > 0`, so claims (`agentTargets.claimSlot`), the work tick (`agents`), the hand's `haul` and the open-site count treat an upgrade like any site; `workOn` (`villageSim`) moves a stage on, or an upgrade towards its level.

## Effects
- House: `+BEDS_PER_LEVEL` beds per level above 1 (`bedsOf`).
- Granary / workshop: capacity `×(1 + STORE_CAP_SHARE × (level − 1))` (`capsOf`). A workshop above level 1 also speeds the woodcutters (`chopMul`).
- Farmstead: the growth and harvest bonus of the fields in reach rises with the level; shrine: more faith per second per level (`sim/buildingEffects.ts`, [hand](hand.md)).

## Tiers from the tree
Modifiers `houseTier`, `storeTier` and `workTier` (neutral 1). Nodes in arch II: Stone hearths (house tier 2), Great halls (house tier 3, gate `folk_20`), Deep stores (store tier 2), Vaults (store tier 3, gate `first_place`), Fine works (works tier, two ranks, gate `level_2`; the groups are `house`, `store` and `works`, the last for the farmstead and the shrine). `tierCeiling(b, mods)` gives the highest level a building may reach.

## Starting one
- `sim.upgrade(id, events)` (via `VillageSystemContext.upgrade`): checks `checkUpgrade` (unsupported, unfinished, busy, maxed, tier) then the active cap (`MAX_ACTIVE`), faith and wood; pays and starts. The overview panel's "Raise to level N" button calls it.
- The planner tries it when it did not start a new site (`nextUpgrade`: lowest level first, houses before stores, then the oldest; no random draw).

## View
While an upgrade runs the building shows the planks stockpile of an open site (`VillageView.upgradeStarted/Completed`); a visible change per level waits for models.

## Check
`npm run check:village-levels` (`scripts/checks/village/levels-check.ts`): rules and refusals, cost per step, beds and capacity, payment, the active cap, builders raising it, wood hauled to an upgrade, the planner, the overview panel, a save mid-upgrade.
