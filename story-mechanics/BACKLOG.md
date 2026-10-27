# Backlog and standing design decisions

What is built is described in `AGENTS.md`, `docs/phase0.md` and `docs/village/`. This page keeps only the decisions that still constrain new work and what is still open.

## Standing decisions

- Faith decides how many newcomers come; wood gates construction; food gates survival.
- Villagers can die of hunger. A death costs faith and leaves a grave in a graveyard beside the village.
- Felled trees regrow in place; tree state is part of the save.
- Rain comes only from storm fronts on the game clock, not from cloud formations.
- Skill points are persistent: one continuous game, no resets or prestige loops, so costs need a long curve.
- The game saves like a classic RPG: one game on one map (island-mountain; the others are testbeds), no map choice. More islands behind a world map are drafted in `WORLD_MAP.md` and would change this.
- The village starts as a hamlet that does not grow until it is converted.
- The orb has a hand (`HAND.md`): it uproots trees, lifts ripe wheat and sheep, and drops them in the village as wood and food. Villagers are impressed by deeds. The village changes only when an item is delivered; villagers themselves are never picked up.
- Ambient life is cosmetic: sheep, hens, birds, leaves, fireflies and the life at the places of power are never saved and never change the village sim. The one exception is a lifted sheep, which becomes a capped food gift when delivered (`HAND.md`). Plants react to the orb always; living creatures (hens, birds, fireflies) notice it only from Phase 1.
- One wind for everything: the clouds' heading decides which way grass, flowers, trees, smoke, leaves and the storm fronts go.
- Birds are modelled by the creator (stand-ins until then); dragonflies are dropped for now.

## Not in scope

Hauling visuals for the villagers (carrying logs and sacks to the store; the orb's hand is separate, see `HAND.md`), modelled stump, log and grave assets, audio, seasons, cloud saves or accounts, new building types beyond granary and workshop except the skill-unlocked ones in `HAND.md` (Farmstead, Shrine; Market and Beacon are ideas only), the Deity phase and beyond (Verath's incursion, morality-axis effects), a Smite power, picking up or throwing villagers (the hand carries things, never people), a good/evil score, and the world map with its fog of war and further islands (drafted in `WORLD_MAP.md`, nothing built).

## Open

- The story: the words of the elder meeting, the conversion quest and every other quest (text is placeholder, see `PHASE_0_TODO.md`).
- The quest numbers (`PHASE0.QUEST`) and the hamlet's size (`VILLAGE.HAMLET`) are first numbers, tunable after playing.
- UI details: the final look of the save screens, the skill tree panel, the ability bar and the radial menu are quiet first passes to refine.
- Whether the stale AO and grass patch under felled trees is visible enough to fix (needs a look on a live GPU).
- island-mountain has 6 orbs (33 energy); about 20 more are to be placed in the editor (`PHASE_0_TODO.md`).
- The village phase goal (restoring the five places of power) is built; its open items (numbers, models) are in `PHASE_2_RESTORATION.md`.
- More village interaction (milestones, upgrade levels, player plots, prayers, hearten, outposts) is designed in `VILLAGE_INTERACTION.md`.
- The hand, deeds, the removal of Murmur, Dream, Sign, Blessing, Kindle and Provide, and the Farmstead and Shrine are built (milestones H0 to H7, docs in `HAND.md` and `docs/village/hand.md`); the open numbers and the models are listed in `HAND.md` and `PHASE_0_TODO.md` ("The hand"). Not built: hens for the hand, the Market and Beacon buildings.
- The island's last act (Verath's trader and his Offer, the Deity-phase goal) is a draft in `VERATH_ACT.md`; its open questions are listed there.
- The game after the first island (world map, fog of war, authored islands, what the player does on the map, when an island counts as done) is a draft in `WORLD_MAP.md`; its open questions are listed there.
- Ambient life (`docs/ambient.md`) is built with stand-in models; what is open is a look on a real GPU and the models (`PHASE_0_TODO.md`, "Animals and ambient life"). Not built: the finale flare of the places' life, the grass gust atlas for trees, animal LODs, quality-tier counts for the specks.
