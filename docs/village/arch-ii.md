# Arch II, The Village

Skill data in `src/skills/skillTree.ts`, powers in `src/abilities/{abilities,builderPowers,builderRuntime}.ts`, village effects through the shared `modifiers` record. Numbers: `VILLAGE.ARCH_II` and `VILLAGE.WEATHER_POWERS` (`src/config/village/powers.ts`).

## Milestones and gates
`skills/milestones.ts` (pure): `MILESTONES` (id, label, one village number, threshold), `newlyReached(snapshot, reached)`. `SkillsState.milestones` latches the ids reached; `syncMilestones` records them, `skillRuntime.syncMilestones` applies it and emits `milestone:reached` (a toast in `skillUi.ts`); `gameplay/progression.ts` builds the snapshot (restored places, population, finished buildings) once a second in a converted village. A `SkillNode` may carry `gate: MilestoneId`: `canUnlock` refuses `'gated'` until it is reached, and the tooltip says what is needed. The same latch gates the upgrade tiers and the new verbs (story-mechanics/VILLAGE_INTERACTION.md). Gated nodes today: Great halls (`folk_20`), Vaults (`first_place`), Fine works (`level_2`) and Shrines (`prayers_5`); see [upgrades](upgrades.md) and [plots](plots.md).

## Opening
`SkillsState` has `villageOpened` and `faithSparks`. `syncVillageTree(state, { converted, faithEarned })` (pure) opens arch II once the village is converted and `faith.earned` reaches `ARCH_II.OPEN_FAITH_EARNED`, with `OPEN_SPARKS`, then gives one spark per `MILESTONE_FAITH` earned past it (`faithSparks` counts those, so none is paid twice). `skillRuntime.syncVillage` applies it and emits `skills:villageOpened` (a toast); `gameplay/progression.ts` polls it once a second. A village node is `closed` until it opens; a respec keeps it open.

**Exclusive keystones**: `SkillNode.excludes` (symmetric, checked by `treeProblems` and `parseSkills`) and the refusal `excluded`. Each pair allows one.

## Nodes (`SKILL_NODES`, arch `village`)
Hearth: Wider beds (+1 bed per house), Quick hands (builders x1.25), Good soil (+1 food per harvest), Sharp axes (+1 wood per tree), Granary (stores +40), keystones Town (building cap x1.4) or Lean winters (hunger grace x3). Land: Seedkeeper (stump wait x2/3), Tide-caller (fish x1.5), Rain-reader (rain adds to growth), Gravekeeper (a death costs half the faith), keystones Evergreen (stumps regrow at once while it rains) or Downpour (what rain adds to growth x2). Devotion (needs Wider beds and Seedkeeper): energy per second per believer, and the temple restores energy within `PHASE0.SHRINE.RADIUS_M` like a shrine, with no Attunement; `regen.regenRate` takes `templeRate` and `believerRate`, the temple and a shrine zone do not stack. The hand and the buildings: Farmsteads (after Good soil) and Shrines (after Seedkeeper, gated) open those plot types, Fine works (after Farmsteads, two ranks, gated) raises the farmstead and shrine ceiling, Fervour (after Devotion) multiplies all faith x1.25 ([hand](hand.md)). In the Void arch, Long reach and Deep grip scale the hand's reach and cost. Costs, ranks and values are the data in `SKILL_NODES`.

## In the sim
New `Modifiers` fields (`bedsPerHouseAdd`, `woodPerTreeAdd`, `fieldYieldAdd`, `storageCapAdd`, `builderRateMul`, `buildingCapMul`, `hungerGraceMul`, `stumpWaitMul`, `fishMul`, `deathFaithMul`, `evergreen`, `rainBoostAdd`, `rainBoostMul`, `energyPerBeliever`, `templeRegen`, and from the hand and the buildings `handReachMul`, `handCostMul`, `workTier`, `plotFarmstead`, `plotShrine`, `faithMul`). `createVillageSim({ modifiers })` reads them live (default: the game's shared record) and hands them to `createForest(trees, rules)` (`ForestRules`), `createEconomy(initial, capBonus)`, `population` (`houseExtra`), `agents` (`builderRateMul`, `workBoost`), `bedsOf(b, houseExtra)`, `housingOf(..., houseExtra)`, `capsOf(..., capAdd)` and the grace parameter of `hunger.ts`. The overview reads `modifiers.bedsPerHouseAdd` for its bed counts.

## Panel
`openSkillPanel(deps, arch)` shows one arch with two tab buttons ("The Void", "The Village", the second disabled until it opens); switching swaps the content in place (the panel stays open, so the world does not unfreeze for a frame).

## Builder powers
`abilities.ts` `grantedWithVillage`: they come with arch II, no node. Faith costs and cooldowns in `WEATHER_POWERS`. There are two, both weather; helping the village itself (wood, food, builders) is the orb's hand (`story-mechanics/HAND.md`), which replaced Blessing, Kindle and Provide.
- **Call rain** (`sky`): a front centred on the cursor (`weather.addFront`).
- **Clear skies** (`sky`): a hole in the weather around the cursor (`weather.clearSkies`).
- Hearten is not a power on the bar: it is a button on a villager's info panel (`docs/village/hearten.md`).
- `builderPowers.ts` (pure) resolves the ground point under the cursor (`CursorAim { ground }`) and performs through `BuilderWorld { weather, clock, windDirectionDeg }`. `initGameplay` builds it, passes faith to the caster (`abilities.setFaith`, spend = `village.addFaith(-n)`). The village powers are cast from the overview's bar (`ui/abilities/builderBar.ts`); the roam view has no power bar.
- **Overview bar** (`ui/overview/overviewPowers.ts`, bar in `ui/abilities/builderBar.ts`): the hand first, then the two powers at the bottom of the overview; click one or press its number to arm it (a hint says what to click), the next click casts at what is under the cursor and selects nothing, a refused cast says why and stays armed, Esc puts it away first (`overview.addEscapeGuard`), leaving the overview disarms.

## Save
`ProfileState.powers { cooldowns, weather }` (`PowersState`): the running cooldowns (`caster.cooldowns/restore`) and the called fronts and clear zones.

## DEV
`__pantheonSkills.openVillage(faithEarned?)`, `__pantheonPowers.builder()` and `.castBuilder(id, { ground })`.

## Checks
`check:village-levels` (upgrade levels), `check:skills` (arch II data, opening, exclusion, modifiers, parsing), `check:village-upgrades` (`scripts/checks/village/upgrades-check.ts`: each node's effect in the sim, and the forest's `treeBoost` rule), `check:powers-builder` (`scripts/checks/abilities/builder-powers-check.ts`: aiming, performing, faith and cooldown rules, saves of the two weather powers), `check:energy` (Devotion); `check:save-village` has a scenario for the hand (uprooted trees, a reaped field, hauled wood).
