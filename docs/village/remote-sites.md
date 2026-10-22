# Remote work sites (restoring the places of power)

Design: `story-mechanics/PHASE_2_RESTORATION.md`. Numbers: `VILLAGE.RESTORATION` (`src/config/village/restoration.ts`; placeholders until a playtest).

A place of power can stand hundreds of metres outside the village's `SiteGrid`, where `pathfind.find` returns 0. A restoration is therefore a **remote site**, a list of its own in the sim (`remoteSites`, type `RemoteSite` in `model/types.ts`), not a `Building`: it has no pad, no door, no planner slot and no pathfinder block. It reuses `applyWork`/`remainingWork` (they only read `stage` and `progress`): two stages of `SITE_WORK_S` builder-seconds, like a building.

## Flow
1. The village is converted, the place is awake and the orb dwells at it (`gameplay/restoration.ts`): `RestorationRuntime.start(kind)` checks the requirement (`START_WOOD` in the store, `CREW.MIN` free builders, a route within `ROUTE_WALK_LIMIT_MIN`), takes the wood and calls `sim.startRemoteSite`. Refusals are named (`lastRefusal`). `LandmarkState.restoration[kind]` becomes `inProgress` (event `landmark:restoreStarted`, bus `village:remoteStarted`).
2. `coarseRoute.ts` (pure) finds the route once: Dijkstra on an 8 m grid with the walk grid's water and slope rules, simplified to a few waypoints. The route is stored on the site (it is part of the saved state).
3. Up to `CREW.MAX` free builders are assigned (`crew.ts`, per-villager arrays `crew`, `crewPhase`, `routeCur`). The phases (`CrewPhase`): walk the local A* path to the **gate** (the route's first point on the grid), walk the route out in chunks of `MAX_WAYPOINTS` (40), **camp**, and later walk the route back (reversed) and resume normal life. A crew member lost to hunger or death is replaced from the free builders.
4. **Camp.** The crew stays at the site and does not walk home. At the camp `crew.think` follows the timetable: Work becomes `Acting` beside the site (`faceToward`), Eat is a packed meal where they stand (the food leaves the larder as usual), Sleep and Shelter are an outdoor rest. Work is delivered by `crew.act` (`workRate × dt`, only camped, working and not weak) into `applyRemoteWork`; a day-night cycle therefore costs no walking.
5. When stage 2 is done, `completeRemoteSite`: status `restored`, event `landmark:restored`, `village:remoteDone`. The crew walks home; the hurdle lifts, the boon applies (`landmarks/landmarkEffects.ts` → `SkillRuntime.setExtraEffects`) and `RESTORE_FAITH` faith is paid (`gameplay/landmarkBoons.ts`).

All hurdles start when the village converts. A hurdle or boon is a `ModifierEffect`, folded with the skill ranks (`modifiersOf(state, tree, extra)`).

## View
Placeholder props only (`landmarks/landmarkStandIns.ts`: `LANDMARK_RESTORE_PROPS` per phase, `CAMP_PROPS`), spawned and disposed by `landmarks/landmarkRestoreProps.ts` through the normal prop pipeline. The objective line and the journal rows come from `quests/restorationGoals.ts`. Final models replace the keys in the tables.

## Rules and limits
- The coarse flood reaches only part of the land: on island-mountain 23 of 48 test targets. A landmark behind water or a ridge is refused ("no way there"). **Open:** an editor/validator rule that a landmark meant for restoration is reachable from the village seed (today only `coarse-route-check` tests island-mountain).
- Villagers far from the village rely on the generic movement layer and the renderer's draw distance; check `VISUAL.village` draw distance if a distant crew pops in and out.
- Save: sim state `remoteSites` plus the pool arrays (`docs/village/save.md`); profile `landmarks.restoration`.

## Checks
`npm run check:village-route` (`village/coarse-route-check.ts`: routes on island-mountain stay on dry walkable ground, deterministic), `check:village-remote` (`village/remote-site-check.ts`: crew walks out in chunks, camps through a night, two stages, walks home, save and load mid-trip, crew refill), `check:restoration` (`landmarks/restoration-check.ts`: hurdle, boon, weather chance, goals), `check:save-village` (remote events in the event-key check). `village-golden` is pinned again for the new state shape.
