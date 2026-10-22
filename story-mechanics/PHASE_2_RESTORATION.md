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

The hurdles and boons are the village's existing knobs (`modifiers`: `fishMul`, `builderRateMul`, `deathFaithMul`, `fieldYieldAdd`, `stumpWaitMul`, `rainBoostAdd`, `energyPerBeliever`, the weather chance), so a hurdle is a negative value that is lifted and a boon is a positive one. Whether the boon is fixed or a choice of two (like the exclusive keystones in arch II) is open.

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

- **Remote work site (technical risk).** The village sim's terrain grid is local to the village (`radiusM` 40 to 400 m, default 160 m) and builders are planned around the temple. A landmark can be far outside it. A spike is needed: either a remote work site type with its own walk region and path to it (the road is part of the goal), or builders who travel and work in place.
- Fixed boon or a choice of two per place.
- Order: any order is assumed (as in phase 0), each place independent.
- The numbers: requirements, `RESTORE_FAITH`, hurdle strengths, work amount per place.
- Save: the `landmarks` slice grows from a list of awake kinds to a state per kind (awake, in progress with a progress value, restored), a `SAVE_VERSION` bump.
- Verath: foreshadowing only (a trader or a rumour), his incursion is not in scope (`BACKLOG.md`).

## Phase table link

This is the Spirit phase goal in `OVERVIEW.md`: "claim the village", then "restore the five places" before the Deity phase.
