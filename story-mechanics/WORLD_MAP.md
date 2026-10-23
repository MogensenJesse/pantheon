# The world map and the islands (design draft)

Status: draft, nothing built. **Current priority: the starting island** (building, story, quests and the other mechanics are fleshed out first). This page only records the direction the game will take afterwards, so that the island work does not close doors. The first written-down version of what comes after the first island. The old sketch in `OVERVIEW.md` was loose and nothing here is final; where this page disagrees with the code, the code wins. **Decided** marks what the design owner has settled; everything else is open and collected at the end.

## The idea

The game is a series of authored islands. Each island is its own scenario with its own challenges and storyline. The player plays the first island start to finish (the game as it is today), grows in power, and then gets the **world map**: a separate, light 3D scene that shows the islands as rough shapes in a sea, hides most of them in fog, and is where the next island is chosen.

The naming matters: "overview" already means the village overview (`B`, `docs/village/overview.md`). The new scene is called the **world map** everywhere, in code too.

## The loop

On one island:

1. **Spark**: start small, collect energy, wake the places (phase 0).
2. **Whisper**: convert the village (phase 1).
3. **Spirit**: build the village, restore the places of power (phase 2).
4. **Mastery**: win the whole island, or finish its storyline. Open: see "When an island is done".
5. **The world map opens**, and the next island is revealed.

Across islands the player's power is meant to carry on (proposed): skill points and the skill tree persist. The village, the places of power, the quests and the weather belong to one island.

In the code today the finale ("The Name Returns", `story-mechanics/QUESTS.md`) already ends the Spirit phase and moves the game to phase 3 (`gameplay/progression.ts`, "the gate opens"); nothing is built after it. The finale only opens the gate: what follows is Verath's trader and his first incursion (`VERATH_ACT.md`, draft), and the end of that act is where the world map first opens. Phases 3 to 5 of the table in `OVERVIEW.md` become the world arc; their names and goals are open.

## The world map

**Decided**
- A separate, light 3D scene, not the island scene: sea, mist, and each island as a rough low-detail shape built from its height and biome data, with no grass and no shadows. The player can see the shapes of the islands.
- It is reached by growth: after the first island is complete.
- A fog of war hides most of the map. **Only the current island and the next one are visible.**
- Each island is authored (a map in the editor) with its own challenges and storyline.

**Look reference** (MouseHunt's world map, only the information design, not its art):
- Regions with a distinct biome each, readable at a glance.
- A named pin per location in three states: available (coloured), locked (padlock), and the current one ("You are here", with a small count badge).
- The unexplored edge dissolves into mist with floating islands: a precedent for the fog.
- A button to go back to camp, and a list button for a menu.

Ours is in 3D, so islands are shapes in the sea rather than a flat illustration.

**Proposed**
- One pin per island: name, state (current, next, done), and on the current island a badge with the number of believers.
- The fog is cloud and mist over the sea (the game already has a cloud system), not a flat black mask.
- Entering the map: the camera rises through the clouds and cross-fades into the world scene (the village overview camera already lifts). Leaving: choose an island and dive in, with a loading screen at first.
- The next island is revealed when the current one is done.

## The feel of the world-map phase (direction, noted for later)

Noted from the design owner; a direction, not a design.

- **A change of scale.** On the first island the player micromanages one village. On the world map the game becomes closer to an endless idle game (Cookie Clicker is the reference): resources, mainly faith, accumulate in far larger amounts and keep spiralling up into enormous numbers.
- **Higher-level quests.** They are about managing whole islands, not individual villages and villagers. The village-level verbs (plots, prayers, Hearten, outposts) belong to the island phase.
- **Rivals try to conquer parts of the world map.** The design owner likes it; how it works is not known yet (candidate D below).

What this suggests for the island work (proposals, not requirements):

- Faith and the other resources should stay plain numbers that can grow by many orders of magnitude. Nothing on the island should assume a ceiling on them, and the displays will need number formatting for large values. Doubles hold 1e308, so storage is not the problem.
- An island that is managed from the map is probably an abstract state (a few rates and levers), not a running village sim. The village sim stays the tool for the island the player is standing on.
- So an island's finished state should be summarisable in a few numbers (believers, faith rate, places restored, threats). That is worth keeping in mind while the island systems are written.

## What the player does on the map (open)

Not decided. Candidates, which can be combined:

- **A. Level select.** The map only chooses the next island. Cheapest: nothing runs for an island once it is left.
- **B. A strategic layer** (the Travian part). Finished islands keep going in the background (production, belief) and can be threatened, so leaving has a cost and the map shows each island's state. Needs a catch-up on return.
- **C. Exchange** between islands: pilgrims, faith or goods. Trade is out of scope today (`BACKLOG.md`).
- **D. A rival on the map.** Rivals try to conquer parts of the world map (the design owner likes this; how is open). Verath's influence could spread from island to island and be visible on the map, the counterpart of the fog. Questions: is a conquered island lost, contested or only weakened; what the player does against it (defend from the map, return and play the island, or both); whether conquest runs in real time, on the game clock or in turns.

A is the first step. B and D are what would give the map something to do.

## When an island is done (open)

The two options the design owner named: **control** of the island (for example every place restored and a share of the village believing) or **completing its storyline**. They can be combined. For the first island this is decided for now: it is complete when the trader of the Verath act leaves (`VERATH_ACT.md`), that is, when his first incursion is repelled. For later islands the condition is authored per island; each completion should pay sparks and reveal the next island, and may give a new power. Whether a later island starts from the beginning of the loop (a spark again) or from further along (the player arrives as a known god) is open.

## An island card (a template for authoring)

| Field | Notes |
|---|---|
| Name and theme | and the one twist that makes it different (drought, a volcano, tides) |
| Start state | arrive as a spark, or as a known god |
| Places of power | which and how many; today there are five kinds, each at most once per map (`story-mechanics/MAPS.md`), so other islands need their own set |
| The village | seed, size, who lives there |
| Gods present | none, one or two (an island holds a few settlements and about two gods) |
| Storyline | the beats and who tells them |
| Completion | the condition above |
| Rewards | sparks, a power |
| Reveals | which island the fog lifts from |

The existing maps `dala`, `island-test` and `volcanic` are testbeds and could be first prototypes.

## How it fits the older ideas (`OVERVIEW.md`)

- **The third arch, The World** (unlocks at Deity: influence borders visible to rivals, cheaper buildings, a larger village radius, Wrath and Mercy, Legacy) is the natural skill tree for the world map. It would open with the map.
- **Arch I, Remembrance** ("reveal explored areas") needs a fog of war on an island. That is a different fog from the world map's: this one hides parts of one island, the other hides islands. They can share a look but not data.
- **Black & White** supplies the island-by-island challenge, **Travian** the layer that goes on while the player is away (candidate B), **Spore** the zooming out to a larger world (the world map instead of a seamless zoom), **the Witcher** the skill tree.
- **The morality axis** (Benevolent to Wrathful) has no home yet; islands with different challenges could be where it shows (open).

## Technical notes (for planning, not decisions)

- Loading is a page boot today (`save/bootSave.ts`), so islands can first be joined by a reload.
- A save mixes player state (skills, quests, game state) with island state (village, places, orbs, weather). It would split into a world save (skills, quests, world state, fog) and one save per island. That needs a `SAVE_VERSION` bump, and there are no migrations.
- The world scene is new but contained: it is built from the maps' height and biome data and leaves the island renderer alone.
- Catching up an island that was left (B): the village sim is pure and runs headless, so running it on return is possible; the cost is not measured.
- The world is a fixed 2048 m flat map in about 37 modules. A continuous globe would be a rewrite, so the world map stays a separate scene.

## Decided and open

**Decided**: the loop above; a separate light 3D world scene; islands authored one by one with their own challenges and storylines; the world map opens after the first island; a fog of war with only the current and the next island visible.

**Open**
- What the player does on the world map (A to D), and how rivals conquer parts of it.
- How the idle-scale economy of the map phase is balanced (faith in the huge numbers, what it buys) and whether it runs while the game is closed.
- The completion condition of an island, and whether later islands start from a spark.
- How many islands, and how the fog lifts beyond the next one (scouting?).
- Whether the skill tree has a part per island or is one shared tree.
- Where the rival (Verath) and the other gods fit, and the later phases (regional god, ancient god).
- The look of the world scene: how rough the island shapes are, how the fog is drawn.
