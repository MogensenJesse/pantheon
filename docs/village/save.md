# Saving the village

How the village takes part in the game's save (the save system itself is in `AGENTS.md` → *Save system*).

## What is saved
`VillageSimState` (`world/village/sim/villageSimTypes.ts` types, `villageSave.ts` for `villageStateProblem`; `serialize`/`restore` are in `villageSim.ts`) is what the save's `village` holds. `sim.serialize()` copies it and `createVillageSim({ ..., restore })` continues from it instead of founding (it refuses a state from another village seed or map).

Each module owns its part: `wearField`, `pathGraph`, `pathNetwork`, `pathTracks`, `villagerPool`, `agents`, `support`, `population`, `villageRng`, plus `economy`, `hunger`, `graveyard`, `forest`, `faith`, belief/elder/aera/converted. `villageStateProblem` checks that the elder and Aera are villagers (or -1) and not the same one. The path network and wear are saved because laying roads again from the buildings gives different roads.

Derived state is rebuilt, not saved: pathfinder blocks, residents, work-slot claims (`rebuildClaims`, `rebuildResidents`). The restore order in `villageSave.ts` is load-bearing (buildings/fields → grid occupants → pathfinder blocks → faith/hunger → pool → residents → agents → network → rng last).

**A new piece of sim state that later steps depend on must be added to `VillageSimState`** (and to `villageStateProblem`); `npm run check:save-village` fails when something is missing.

## What the view does on load
`view.showFounded()` is used for a restored village exactly as for founding: every building at its saved stage and progress, pads levelled, no rise-in. A village that fails to restore stops the boot with an error rather than mixing the two. `bootSave.ts` refuses a save the map cannot continue from (a village from another seed, a different grid or ring count, a village on a map that has none).

## Version history (`SAVE_VERSION` in `save/snapshot.ts`)
There are no migrations: a changed shape bumps the version and older saves are refused as too old. The village-related bumps:

| Version | Added |
|---|---|
| 4 | `converted`, `elder`, `villagers.belief` |
| 5 | the conversion quest slice |
| 6 | wood and food stock |
| 7 | hunger, the graveyard, `Villagers.dying` |
| 8 | the forest |
| 9 | the meals (`economy.round` and `missed`, `Villagers.done`) |
| 10 | arch II and the builder powers (`SkillsState.villageOpened`/`faithSparks`, `ProfileState.powers`, `VillageSimState.blessings`, removed in 19) |
| 11 | the Phase 0 landmarks (`ProfileState.landmarks`) |
| 12 | the restoration status per place (`LandmarkState.restoration`) |
| 13 | the milestones reached (`SkillsState.milestones`) |
| 14 | building upgrade levels (`Building.level`, `Building.upgrade`) |
| 15 | prayers (`VillageSimState.prayers`: open prayers, the lapsed, the answered count) |
| 16 | the heartened villagers (`VillageSimState.hearten`) |
| 17 | several quests (`ProfileState.quest` becomes `quests`, a record by quest id) and Aera (`VillageSimState.aera`) |
| 18 | the skill nodes `dream` and `sign` are gone (`parseSkills` rejects unknown ids), replaced by `long_reach` and `deep_grip` for the orb's hand |
| 19 | `VillageSimState.blessings` is gone with the Blessing, Kindle and Provide powers (the hand replaced them); the golden hashes were re-pinned after a scratch run proved that, with `blessings` deleted from the old state, they are exactly the new ones |

No version bump for the building effects, the Farmstead and the Shrine, the faith multiplier or the locked plot types: their effects are derived each step from the buildings, the new building types are ordinary buildings (types are not validated) and the new skill nodes and modifiers are not saved (`parseSkills` knows the node ids). The held thing of the orb's hand is never saved.

`golden.json` has no scenario for the building effects or the hand, on purpose: with none of those buildings present the sim is exactly as before (so the old scenarios still pin it), and the effects themselves are pinned where they are read, by `check:village-effects`, `check:village-economy` and `check:hand`.

## Checks
`npm run check:save-village` (`scripts/checks/save/village-save-check.ts`, slow-ish: a village saved midway and restored must end identical to one that ran straight on; scenarios for famine, forest, rain with burial and mourning, the hand; one split per scenario by default, `--full` runs the whole set). Remote sites (`remoteSites`: route, stage, progress) and the per-villager crew arrays (`crew`, `crewPhase`, `routeCur`) are part of the sim state; see [remote-sites](remote-sites.md). `check:village-golden` (on demand, not in `check:fast`/`check:all`) pins `sim.serialize()` hashes for several scenarios (`scripts/checks/village/golden.json`, `-- --update` after a deliberate change).
