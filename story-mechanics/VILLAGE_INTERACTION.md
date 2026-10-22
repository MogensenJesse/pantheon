# Village interaction (design)

Status: milestones (`docs/village/arch-ii.md`), upgrades (`docs/village/upgrades.md`) plots (`docs/village/plots.md`) and prayers (`docs/village/prayers.md`) are built; hearten and outposts are not yet. Numbers are placeholders, tuned after a playtest. Built so far: the village (`docs/village/`), the skill tree and powers (`docs/village/arch-ii.md`), and the restoration of the places of power (`PHASE_2_RESTORATION.md`, `docs/village/remote-sites.md`).

## The idea

The village runs itself. The player chooses **where** (plots, outposts), **whom** (hearten) and **what to answer** (prayers); the village does the labour. Few verbs, no menus, no building queue. Inspired by Travian's upgrade and expansion loop and Black & White's relationship with its villagers, but neither is copied: nothing is picked up or thrown, and there is no good/evil score.

## Decisions

- **No building queue.** The open-site cap and the builders' slots are the only limits.
- **Upgrades** are in. The skill tree decides which upgrade tiers exist; the village upgrades buildings in the world with wood and faith. A building under upgrade stays finished and usable.
- **Player plots.** In overview the player marks a spot for a building; builders start on it. The planner keeps working on its own.
- **Prayers.** Villagers voice a need (rain, food, shelter, healing). Answering pays faith and counts toward a milestone. An unanswered prayer costs that villager their belief, so they stop being a believer and earn no faith until restored.
- **Hearten** is the hand: a touch on one villager that lifts them for a while (work rate, belief restored, a visible glow). It is a button in the info panel, not a power-bar slot.
- **Outposts** are passive. A spot beyond the village grid is marked, a crew builds it (the remote-site framework), then it delivers wood or food at a capped rate.
- **One verb for places.** "Mark a place" is a building plot inside the grid and an outpost beyond it.
- **Gating by milestones**, not scores. No renown, no temperament.

## Milestones

A latched set of ids (never relocked), unlocked from game state, polled once a second. They gate skill nodes (`SkillNode.gate`), upgrade tiers and the new verbs.

| Source | Examples (numbers open) |
|---|---|
| Restored places | the first, the third, all five |
| Village growth | population, finished buildings, a building at level 2 or 3 |
| Prayers answered | a count of answered prayers |

## Open

- All numbers: upgrade costs and effects, prayer time-outs and drain, hearten duration and cost, outpost yield and cap.
- Which skill nodes carry which gate.
- The look of a building under upgrade and each level (placeholder props until models).
- Which outpost kinds beyond a lumber camp and a fishing hut.
- Raids, trade and a creature companion stay out of scope (`BACKLOG.md`).

## Build order

M1 milestones and gates, M2 upgrade levels, M3 player plots, M4 prayers, M5 hearten, M6 outposts. Each step is one commit with its checks, a `SAVE_VERSION` bump and re-pinned golden hashes where the saved shape changes.
