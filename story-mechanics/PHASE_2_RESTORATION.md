# Phase 2 — Restoring the five places of power (design)

Status: design only, nothing built. The landmarks themselves are built (`docs/phase0.md`); the village is built (`docs/village/`). This page is the goal and the hurdles for the village phase. Numbers are placeholders, tuned after a playtest.

## The idea

Phase 0 woke the five landmarks. In the village phase the villagers **restore** them, and the player helps. Until a place is restored it weighs on the village (its **hurdle**); restoring it **lifts the hurdle, grants a boon and pays a lump of faith**. Restoring all five ends the phase (the Deity phase, not built).

Each place is made good in one of two ways, decided per kind:

- **Restored**: the ruin is rebuilt (the "before" model is replaced by an "after" model).
- **Built around**: the place stays as it is and a shrine or other construction is built around it (the "after" model is the place plus the construction).

| Kind | Way | Hurdle while unrestored | Boon when restored |
|---|---|---|---|
| `tree` | built around (a shrine and fence ring) | Drought: fewer storm fronts, fields grow slower | Fields and forest do better (yield, stump wait) |
| `runestones` | restored (the fallen stones stand again) | Storms: fronts come more often | Storm ward: fronts weaker and shorter, a calmer sky |
| `temple_ruin` | restored | The builders are unsteady: slower work | Builders faster, more beds per house |
| `sunken_ruin` | restored (the water pulled back from it) | Poor catch: fishermen bring less | Fishing bonus |
| `monolith` | built around (a ring of vigil fires) | The faithful waver: a death costs more faith, faith income is lower | Faith and energy bonus |

The hurdles and boons are the village's existing knobs (`modifiers`: `fishMul`, `builderRateMul`, `deathFaithMul`, `fieldYieldAdd`, `stumpWaitMul`, `rainBoostAdd`, `energyPerBeliever`, the weather chance), so a hurdle is a negative value that is lifted and a boon is a positive one. The boon is fixed per place (decided).

## How a place is restored

1. **Unlock.** Available once the village is converted (phase 2). A place shows in the overview as a goal with its requirement (for example wood, a number of villagers, `faith.earned`).
2. **Site.** It becomes a work site like a building: stages from the "before" model to the "after" model, built by the builders, using wood and labour, and speedable with Kindle and Blessing.
3. **Done.** `landmark:restored { kind }`: the hurdle is lifted, the boon applies, `RESTORE_FAITH` faith is paid, and the chapter of that place closes with a line of story.

The player's tools are the existing ones: Call rain or Clear skies against the weather hurdles, Provide for the larder, Blessing and Kindle for the work. The orb still roams: the place can only be started with the orb present (it wakes the site), then the village carries on.

## Models (the author's list is in `PHASE_0_TODO.md`)

- **Before**: the landmark model the player found in phase 0 (already on the list).
- **After**: one per kind, either the restored ruin or the place with its construction.
- In-progress look: no extra models; the site uses the "before" model with the shared scaffold prop (one prop for all five).

## Open

- **Remote work site: spike done, built for the tree and the framework** (see `docs/village/remote-sites.md`; the crew camps at the site rather than walking home at dusk, as decided later). Spike result (feasible, medium effort): Findings, from reading the sim and a headless probe on island-mountain:
  - *Blocked today:* `SiteGrid` is village-local (radius 40 to 400 m, 2 m cells), `cellIndex` is -1 outside it, and `pathfinder.find` returns 0 when start or goal is off the grid or in another region. A builder cannot be sent to a landmark with the existing target and path code.
  - *Safe outside the grid:* the movement layer (`advanceAlongPath`, the waypoint pool) is generic. Probe: a villager teleported 300 m outside the grid and given 40 waypoints walked them to 475 m from the seed with no NaN and no exception over 15 sim-minutes. `wear.walk` ignores positions outside its field. Nothing in the view reads `radiusM` except the terrain-layer wear halo. Not yet checked in a browser: the villager renderer and shadows far from the village.
  - *The catch:* once the waypoints end, the villager is stranded. The next path request fails (`find` returns 0), it rests 3 s, and repeats forever. A truncated 40-waypoint path also re-requests from where it ended, and that request fails too. So the way out and the way back need our own code.
  - *Reachability varies by map:* a coarse flood from the village (8 m cells, slope above `STEEP_SLOPE` blocks, water blocks) on island-mountain reaches 50 to 70 % of land at mid distances, with walks of 10 to 30 minutes. A landmark can sit on an island or behind a ridge.
  - *Approach (chosen): a precomputed coarse route.* When the player starts a restoration, run one Dijkstra on a coarse grid from the village to the landmark (same slope and water costs as `walkGrid`), simplify it into waypoints, and store the route on the remote site. Builders assigned to the site get the route in chunks of 40 waypoints (the pool buffer), walk it, work in place around the landmark (the 4 slots of `SLOTS_PER_SITE`) and walk it back. The remote site is a new site kind outside the grid; progress uses `applyWork` unchanged. Builders on a long trip carry on after the day ends only if they can sleep nearby; simplest is that they walk home at dusk.
  - *Alternatives rejected:* growing the grid to cover the landmark (a grid of 1000 m is 250 000 cells, memory and A* limits); a second local grid at the landmark (needs its own regions, links and a road); teleporting builders (breaks the walking village).
  - *Rule for the editor:* a landmark used for restoration must be reachable from the village seed (the coarse flood finds a route within a walking limit, say 20 minutes at `WALK_SPEED_MPS` 1.35, about 1.6 km). Add it to `validateMapPayload` next to the existing landmark rules.
  - *Effort:* a remote-site kind and its save state, the coarse route builder (pure and node-testable), a chunked-route walk and return in the agent code, a day-end recall, the editor validator, a check. About the size of the landmarks project's L3 to L4 together. Tune the walk limit after a playtest.
- **Still open:** the numbers (requirements, `RESTORE_FAITH`, hurdle strengths, work per place are placeholders), the content of the other four kinds (hurdle, boon, models), and the editor rule that a landmark is reachable from the village seed.
- Order: any order is assumed (as in phase 0), each place independent.
- The numbers: requirements, `RESTORE_FAITH`, hurdle strengths, work amount per place.
- Save: done. `landmarks.restoration` per kind, `SAVE_VERSION` 12.
- Verath: foreshadowing only (a trader or a rumour), his incursion is not in scope (`BACKLOG.md`).

## Phase table link

This is the Spirit phase goal in `OVERVIEW.md`: "claim the village", then "restore the five places" before the Deity phase.
