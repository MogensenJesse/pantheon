# Backlog and standing design decisions

What is built is described in `AGENTS.md`, `docs/phase0.md` and `docs/village/`. This page keeps only the decisions that still constrain new work and what is still open.

## Standing decisions

- Faith decides how many newcomers come; wood gates construction; food gates survival.
- Villagers can die of hunger. A death costs faith and leaves a grave in a graveyard beside the village.
- Felled trees regrow in place; tree state is part of the save.
- Rain comes only from storm fronts on the game clock, not from cloud formations.
- Skill points are persistent: one continuous game, no resets or prestige loops, so costs need a long curve.
- The game saves like a classic RPG: one game on one map (island-mountain; the others are testbeds), no map choice.
- The village starts as a hamlet that does not grow until it is converted.

## Not in scope

Hauling visuals (carrying logs and sacks to the store), modelled stump, log and grave assets, audio, seasons, cloud saves or accounts, new building types beyond granary and workshop, the Deity phase and beyond (Verath's incursion, morality-axis effects), a Smite power, more world interaction in the Black & White spirit, and a fog of war.

## Open

- The story: what happens when the elder is met, and which help tasks make up the conversion quest (text is placeholder, see `PHASE_0_TODO.md`).
- The quest numbers (`PHASE0.QUEST`) and the hamlet's size (`VILLAGE.HAMLET`) are first numbers, tunable after playing.
- UI details: the final look of the save screens, the skill tree panel, the ability bar and the radial menu are quiet first passes to refine.
- Whether the stale AO and grass patch under felled trees is visible enough to fix (needs a look on a live GPU).
- island-mountain has 6 orbs (33 energy); about 20 more are to be placed in the editor (`PHASE_0_TODO.md`).
- The village phase goal (restoring the five places of power) is designed in `PHASE_2_RESTORATION.md`: open questions there, notably how a work site far from the village is hosted.
