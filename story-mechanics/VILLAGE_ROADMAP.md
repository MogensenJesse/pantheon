# Pantheon: Village Roadmap

Status: **M0 to M9 are done** (the last, arch II, on 2026-10-21); a housekeeping pass followed (dead code, shared
helpers, file layout, docs). The sections before *Milestones* (What exists today, Currencies, Active abilities,
Belief and conversion, Quests, Skill tree layout, UI) are the **design as drafted** on 2026-10-15 to 2026-10-18 and are
kept as a record: where they say "proposed" or "today", the milestone notes below and `docs/village/` say what was
built. What is still open is under *Open checks*.

## Why

The village grows on its own (faith pays for building sites and newcomers) but nothing it does has
consequences yet: fields ripen with no harvest, woodcutters and fishermen walk to a tree or the shore and
produce nothing, trees never change, there is no weather, and the only view is the third-person orb camera.
This roadmap gives the game its progression: the orb gathers energy, a skill tree opens with active powers,
the player converts the village, then a builder phase begins with an overview camera, a living economy
(wood and food, shortages that bite up to death by hunger), trees that fall and regrow, rain driven by the
clouds, daily routines, and a second arch of village upgrades. The game works like a classic RPG: one
continuous game that is saved and loaded, with no resets.

The villager models and textures are being painted separately, so none of this changes the villager rig
or the existing `Anim` ids beyond additions.

Day length is 1800 s (`src/config/visual/sky.ts`, `dayDurationSec`); a field ripens in 900 s; builders
deliver 300 + 600 builder-seconds per building. Every rate below is stated per game day.

---

## Game arc

The acts map onto the phases in `OVERVIEW.md` (the code only knows phase 0 and 1 so far).

| Act | Phase | View | Starts when | Ends when |
|---|---|---|---|---|
| 1. God Particle | 0 | Roam (orb) | Game start | Energy reaches the cap (100) and every landmark of the map is awake (a map without landmarks needs the energy alone). This triggers the sunrise reveal and sets `state.phase = 1` |
| 2. Whisper | 1 | Roam (orb) | The skill tree opens with its first sparks and basic powers; the story leads the orb to the village elder, and that meeting starts the conversion quest | The conversion quest is complete and the village is converted |
| 3. Builder | 2 (Spirit) | Roam plus overview, orb as cursor | `villageConverted` | Later phases (Deity and beyond) are out of scope here |

In act 3, enough faith earned unlocks the second arch of the tree (village upgrades and builder powers).

Act 2 in detail (confirmed): before conversion the village is a finished **hamlet** (temple, about 3
houses, 2 fields, the well, 11 villagers: `VILLAGE.HAMLET`, tunable) that lives its
routines but does not grow, has no faith income and builds nothing. Meeting the elder is woven into the
story and starts the quest to convert the village, which the player completes with powers and by helping
the village and the elder (see Quests). Conversion starts everything: faith income from believers, growth,
the economy. Today's behaviour (growth from phase 1 by orb presence alone) stays available as a DEV
sandbox switch so testing keeps working.

---

## What existed at the start (historical)

The state of the code when this roadmap was written; the paths have since moved (see `AGENTS.md`).

- The sim is pure and node-runnable: `src/world/village/sim/` (`villageSim.ts` orchestrates, `population.ts`
  roles, beds and newcomers, `support.ts` fields and well, `agents.ts` behaviour, `agentTargets.ts` claims,
  `routine.ts` schedule, `workSpots.ts` tree and shore spots, `construction.ts` stages). Tunables live in
  `src/config/village.ts` (`VILLAGE`). The headless gate is `npm run check:fast`
  (`scripts/checks/village/sim-smoke.ts` prints the fingerprints).
- Beds exist: `VILLAGERS.BEDS` (temple 2, house_a 3, house_b 4, house_c 5), and `population.hasRoom()`
  already blocks newcomers without a free bed. `chooseNextKind` (in `planner.ts`) already builds a
  `granary` (one per 4 houses) and a `workshop` (one per 5 houses): buildings we can use as storage.
- Fields: `Field.growth` runs 0 to 1, and a ripe field with a tender is reset in the field loop of
  `villageSim.ts` `update`. That moment is the harvest. Fishermen and woodcutters only play a work
  animation; nothing is produced.
- The villager pool can spawn (`sim/villagerPool.ts`) but cannot remove anyone: dying villagers need new code.
- Phase and energy: `src/core/state/gameState.ts` holds `energy`, `energyCap` (100), `orbsAbsorbed`, `phase`,
  `memoryFragments`. Reaching the cap runs `triggerWhisperAscension` in `src/core/reveal/WorldReveal.ts`
  (latched, sets `phase = 1`, fires the Aethon memory) and starts the day cycle (before the cap the world
  stays at night). Energy helpers: `src/core/energy.ts` (`setEnergy`, `addEnergy`). Orbs are consumed when
  absorbed (`src/entities/energyOrb/energyOrb.ts`), so energy is finite today.
- The temple's orb, beam and column are driven by `faith.earned` (`src/world/village/render/crownOrb.ts`).
- Orbs are slots from `orb` map entities (`src/entities/energyOrb/orbSystem.ts`); since M1c a picked-up
  orb comes back elsewhere once the skill tree has opened. Map entities are a union in `src/map/MapTypes.ts`
  (`prop`, `playerStart`, `orb`, `villageSeed`, `shrine`); a new marker type touches the editor palette,
  preview meshes, gizmo rules and the entity spawner, and the `shrine` change (M1c) is the latest pattern.
  (At the start of this roadmap an absorbed orb stayed gone and the union had no `shrine`.)
- Trees are static map props in `PropLodGroup`s (`src/world/mapProps/mapPropLod.ts`), handed to the village
  as `trees` (`src/main.ts`) and as `propLodGroups`. `DynamicPropBatch`
  (`src/world/village/render/dynamicPropBatch.ts`) already adds, moves and removes instances of an asset.
  `resnapMapProps` (`src/world/mapProps/mapPropInstancing.ts`) recomputes every static prop matrix from
  `placements[i]` whenever the village levels ground, so a felled tree has to be hidden by setting
  `placements[i].scale = 0`, otherwise it comes back.
- There is no weather code. Clouds live in `src/rendering/clouds/` (clusters with centre, extent and
  density; wind drift in `cloudWindInstances.ts`). The terrain already has a shoreline wetness term
  (`applyWaterTerrainWetnessTsl`); the terrain is at its 16-sampler budget, so rain wetness must be
  uniforms, not textures.
- Camera: `src/rendering/CameraRig.ts` (orbit follow, pointer lock via `src/core/CameraInput.ts`). HUD
  pattern: the DOM overlay in `src/ui/VillageHud.ts`.
- Persistence (added in M0): saved games live in IndexedDB (`src/save/`), and settings in `localStorage`.
  The village RNG streams are `alea` generators (`sim/villageRng.ts`) whose position is saved. (At the
  start of this roadmap everything was session-only.)
- Story documents describe an elder (Caros) and a shepherd (Aera); the elder is built (the conversion quest). The five
  Phase 0 landmarks are built too (`docs/phase0.md`); a fog of war is a future idea.

---

## Design decisions (confirmed 2026-10-15)

1. Faith stays. Faith decides how many newcomers come; wood gates construction; food gates survival.
2. Villagers can die of hunger, as in Black & White. A death costs faith and leaves a grave in a graveyard
   in a remote spot beside the village.
3. A granary raises the food cap and a workshop the wood cap; with no storage the cap is small.
4. Felled trees regrow in place, and tree state is part of the save.
5. The overview is another view the camera transitions into; the sim keeps running. In it the player orb
   becomes the cursor.
6. Rain comes only from very large cloud formations (measured first, see M8).
7. Skill points are persistent: one continuous game, no Cookie Clicker style resets.
8. The role keeps the name `Woodcutter`.
9. The game saves like a classic RPG. There is one game on one map (island-mountain, the others are
   testbeds), and the player has no map choice: the game starts directly in the map.
10. The arc above: the orb collects energy and story, the skill tree opens with basic powers, the player
    converts the village, the builder phase starts with the overview camera, and enough faith unlocks a
    second arch with village upgrades.
11. The village starts as a hamlet that does not grow until it is converted.
12. Energy regeneration comes from skills: first regeneration at the starting shrine (a stone circle the
    user builds in the map editor), then an automatic slow regeneration, and after conversion a regeneration
    that scales with the number of believers, with the temple acting as a regeneration point as well. Once
    the tree has opened, orbs respawn at semi-random places.
13. The elder is met in the story, and that meeting starts the conversion quest. The game gets quests and
    objectives, kept light. The story content and the quest tasks come later; the core systems come first.
14. The first shrine sits at the player's starting point.
15. The game gets a proper UI layer (see UI): a shared kit first (M0a), then every milestone ships its own
    screens.

---

## Currencies (as designed; built in M2 to M4)

| Currency | Source | Used for |
|---|---|---|
| Energy | Residue orbs (they respawn once the tree has opened), shrines, skills, later believers | Casting arch I powers, like mana. Cap 100, `Surge` adds 60 |
| Faith | Believers (and orb presence), after conversion | Building sites, newcomers, arch II powers; lost when villagers die |
| Sparks | Phase changes, conversions, faith milestones (`OVERVIEW.md` already uses sparks, written with the symbol ◈) | Unlocking tree nodes. Saved with the game |

Energy regeneration (confirmed 2026-10-15). Nothing regenerates before the tree opens; the first 26 or so
orbs are the whole of act 1. After that:
- Orbs respawn at semi-random places (a rule, not a skill).
- **Attunement** (arch I node): energy regenerates slowly inside a shrine's zone. The first shrine is the
  starting point, built by the user in the editor.
- **Renewal** (arch I node, follows Attunement): a slow automatic regeneration anywhere.
- **Devotion** (arch II node, after conversion): regeneration scales with the number of believers, and the
  temple becomes a regeneration point too.
The rates are mine and tunable (first numbers in M1c).

---

## Active abilities (as designed; built in M1, M2b and M9)

Arch I powers are cast from the roam view with the orb in the world (target = whoever the orb is near or
looking at). Arch II powers are cast with the orb as the cursor.

| Power | Arch | Cast in | Cost | Effect |
|---|---|---|---|---|
| Murmur | I, starting | Roam | Energy per second, small | Hold the orb within about 6 m of a villager: their belief rises over about 20 s. They pause and look toward the orb |
| Dream | I | Roam, night | About 8 energy, once per house per night | Hover over a house: every sleeper inside gains belief |
| Sign | I | Roam | About 12 energy, 30 s cooldown | A small visible miracle at a target (lantern or temple torch lights, a field shimmers): villagers within about 25 m who see it gain belief |
| Blessing | II | Overview, cursor | Faith, cooldown | Bless a field, house or tree: faster growth or work for a few minutes |
| Kindle | II | Overview, cursor | Faith | Finish or speed up one construction stage on a site (the player "helps build") |
| Provide | II | Overview, cursor | Faith, long cooldown | Conjure a small food stock: an emergency answer to hunger |
| Call rain / Clear skies | II | Overview, cursor | Faith, long cooldown | Summon a storm formation or part the clouds (needs M8) |
| Smite | later | Cursor | Faith | Wrathful flavour from the morality axis; only when there are threats (`OVERVIEW.md`, Deity phase) |

Passive nodes (arch I): Resonance (energy draw range x1.6), Presence (vision radius), Surge (+60 energy
cap), Echo (absorbed orbs leave faith trails), Attunement (energy regenerates in a shrine's zone), Renewal
(slow automatic energy regeneration), Empathy (convert range x1.5), Thrall (converted villagers slowly
convert neighbours). Devotion (energy per believer, temple as a regeneration point) is an arch II node.

## Belief and conversion (as designed; built in M2)

- Every villager has `belief` 0 to 1 (saved); at 1 they are converted. Powers raise it; nothing else does,
  except Thrall.
- Faith income is the number of converted villagers times a per-believer rate, plus the orb presence boost.
  Before the first convert it is zero.
- One villager is the **elder**, a named villager (the first priest; Caros in the story documents). He is
  met in a story beat. The village counts as converted when the conversion quest chain is complete (see
  Quests); its last step needs the elder to believe. Belief thresholds (for example 60% of villagers) are
  only tuning inside the steps. This is the `OVERVIEW.md` goal "claim the village".
- The temple's orb and beam brighten with belief, as the visible progress indicator.
- Sparks: 2 when the tree opens, plus 1 per convert after the fifth, plus the conversion bonus.

## Quests and objectives (confirmed need, design proposed)

- A quest is a list of steps; each step has a line of text, a condition and effects (sparks, unlock a node,
  start a story beat). Conditions read the event bus and the sim: villagers converted, orbs absorbed,
  energy level, `elderMet`, later stock levels.
- Light on purpose: one current-objective line in the style of the story log, plus a journal panel (a key)
  that lists finished steps and story fragments. `PHASE_0_GOD_PARTICLE.md` avoids a heavy quest log in
  phase 0; this starts in act 2.
- The conversion quest (the main act 2 quest), proposed shape: meet the elder; convert N villagers (the
  "5 converts" Whisper goal); help the village and the elder with a few tasks built from things the game
  can already detect; the elder believes; `villageConverted`. The tasks and their wording are story work to
  do together with the user (candidates: light the temple fire at dusk with Sign, keep vigil near the
  village through a night, offer energy at the temple, calm a doubting villager with Murmur).

## Skill tree layout (as designed; the shipped nodes are in `docs/village/arch-ii.md`)

- **Arch I, The Void** (opens at the energy cap, funded by sparks): the passive nodes and the three
  conversion powers above. `Remembrance` (reveal explored areas) waits until a fog of war exists.
- **Arch II, The Village** (opens in act 3 when faith earned passes a threshold; needs `villageConverted`):
  village upgrades in two branches, plus the builder powers above. One keystone per branch, two exclusive
  choices, adjacency unlock as in Cookie Clicker's ascension tree.

| Branch (arch II) | Nodes | Keystone choice |
|---|---|---|
| Hearth (village) | Wider beds (+1 per house), Sharp axes (+wood per tree), Good soil (+food per harvest), Granary (stores +40), Quick hands (faster builders) | Town (higher building cap) or Lean winters (3x starvation grace) |
| Land (nature) | Seedkeeper (faster regrowth), Rain-reader (rain speeds fields), Tide-caller (more fish), Gravekeeper (deaths cost half the faith) | Evergreen (stumps regrow at once in rain) or Downpour (rain's growth boost doubled) |
| Devotion | One node needing Wider beds and Seedkeeper: energy from believers, and the temple regenerates energy | |

Because there are no resets, costs need a long curve that suits one continuous game, not a prestige loop.

## UI (as designed; built across M0a to M9)

Today `src/ui/` is a handful of small DOM modules (`HUD.ts` energy bar, `VillageHud.ts`, `StoryLog.ts`,
`MapSelectScreen.ts`, `PlayLoadingScreen.ts`). Each injects its own `<style>`; there are no shared tokens,
no pause menu, no tooltips and no notification queue, and the DEV panel has its own chrome
(`src/ui/ui-panel.css`). The existing pieces are deliberately faint: small uppercase letter-spaced text, a
thin energy bar, a lilac glow. The roam view hides the cursor (pointer lock, `src/core/CameraInput.ts`), so
any clickable UI has to hand pointer lock back and forth.

Principles (from the `game-ui-design` skill and the game's tone):
- Quiet and mythic: keep the faint look. The world carries information where it can: the temple beam and
  orb show belief, window glow shows who lives where, the orb cursor highlights what it can act on.
- Contextual visibility: hidden while roaming; peek on relevant events (about 150 ms in, 2 s hold, 500 ms
  out); persistent only for what matters now; expanded on demand.
- Progressive disclosure for the skill tree and building info: glance, hover (about 300 ms), inspect.
- Never colour alone: every warning has an icon and a word. Body text at least 14 px at 1080p, a UI scale
  option, and margins that keep critical UI off the screen edge.
- Panels never trap the player: opening one releases pointer lock and pauses roam input, Esc closes the top
  panel, and the orb never moves from clicks that were meant for a panel. Keyboard and mouse first; give
  every panel a focus order and a visible focus ring so a gamepad can follow later.
- One token set and one icon set, shared by the HUD, the overview and the panels. No UI framework is added:
  the existing UI is plain DOM.

Screens and where they ship:

| Screen or element | Shown when | Milestone |
|---|---|---|
| UI kit (tokens, icons, panel and focus manager, tooltips, notification queue, settings) | Always | M0a |
| Start screen (Continue, Load, New game, Settings), pause menu (Resume, Save, Load, Settings, Quit to start) | Launch, Esc | M0a, M0b |
| Save slot list (thumbnail, day, population, play time), "Saved" toast, autosave indicator | Save and Load | M0b |
| Ability bar with cooldown sweeps and cost preview, radial cast menu | After the tree opens | M1b |
| Skill tree panel (constellation, tooltips, sparks counter, respec) | A key, later at the temple | M1b, M9 |
| Energy bar (existing) plus a regeneration indicator; shrine zone ring | Roam | M1c |
| Converts counter | Act 2 | M2 |
| Cast feedback (target ring on a villager or house), belief indicator on villagers | Act 2 | M2b |
| Objective line and journal | From the elder's meeting | M2c |
| Story log (existing) | Always | n/a |
| Resource bar (faith, wood, food, population against beds), orb cursor with context highlight and action prompt, building info panel, overview icons (bed pips, warnings) | Overview | M3, M4 |
| Hunger and death warnings, graveyard info | When food runs short | M5 |
| Rain-reader forecast icon | With the node | M8 |
| Arch II panel (same tree UI) | After the faith threshold | M9 |

Each milestone ships its own screens from this table, built on the M0a kit.

## Differences from OVERVIEW.md (nothing there was edited)

- The tree's second arch there is "The Flesh" (unlocks at Spirit); here the conversion powers are in arch I
  so the player can convert right after the tree opens, and arch II is the village arch (it replaces the
  "The World" village nodes). Arch III stays for later.
- The `Legacy` node (keep a building from a previous run) conflicts with one continuous game and should go.
- The tile-based resource system (shrines, sawmills, quarries, stone) is superseded by the 3D village
  economy in this roadmap (granary and workshop storage, wood, food).
- "5 converts" (Whisper) and "Elder Caros converted" (Spirit) are kept as the two conversion goals.
- Phase 0 says quests are not tracked in a log. From act 2 this roadmap adds a light objective line and a
  journal.

---

## Milestones

The order is the player's order. In code, M4 to M8 do not depend on M1 to M3, so the order can change if
a different milestone is more useful to work on first.

### M0a: UI foundation (size M, first)

Status: done (2026-10-15). A shared UI kit so every later screen
looks and behaves the same (see UI).

- [x] Design tokens in one stylesheet (CSS custom properties: colours from the existing lilac and cream
      palette, type scale, spacing, layers, motion durations) and an inline-SVG icon module reused by the
      HUD, the ability bar and the overview icons. Plain DOM with a tiny element helper; no framework.
- [x] Layer manager and input focus: stacking order (HUD, overlays, panels, modal, toast); opening a panel
      releases pointer lock (`src/core/CameraInput.ts`) and pauses roam input, Esc closes the top panel,
      closing restores roam control. Panels register their key.
- [x] Visibility helper for the four HUD states (hidden, peek, persistent, expanded) with the fade timings
      from the UI section.
- [x] Notification queue (at most 3 visible, priorities, duplicates merged) for saves, orb respawns, deaths,
      quest updates; announced to screen readers with `aria-live`.
- [x] Tooltip component (about 300 ms delay, glance, hover and inspect layers).
- [x] Settings basics: UI scale, reduced motion, high contrast. Stored per device in localStorage (not in the
      save).
- [x] Move the existing pieces (`HUD.ts`, `VillageHud.ts`, `StoryLog.ts`, the loading and map screens) onto
      the tokens without changing how they look or behave, and drop their per-module `<style>` injection.
- [x] Accessibility baseline: visible focus ring, tab order, no colour-only information.

Verify: `npx tsc --noEmit` and `npx biome check` on the changed files; the existing HUD pieces look the
same (before and after screenshots in the browser pane); opening and closing a test panel returns control to
roam with no stuck pointer lock and no orb movement from panel clicks; UI scale 0.8 to 1.5 and a narrow
window still lay out.

Built as planned, with these details: the kit lives in `src/ui/kit/` (documented in `AGENTS.md`, UI kit);
there is a sixth layer for tooltips above the toasts; a modal panel's backdrop swallows clicks so the canvas
cannot take the mouse back (no change to `CameraInput` was needed) and `setInputBlocked` in `InputManager`
clears held movement keys; `O` opens Settings until the pause menu (M0b) takes over; toasts sit bottom left;
the loading screen and map chooser kept their markup, only their CSS moved to tokens (`screens.css`).
`npm run check:ui` covers the pure rules. Checked in the browser: panel open and close, Esc, backdrop click,
Tab wrapping both ways, held-key drop and resume, settings (size, motion, contrast) applying, persisting and
resetting, notification merging, the 3-visible cap and sticky alerts, tooltip delay, Shift and Esc,
visibility states. Not checked: releasing a real pointer lock (the embedded browser never grants it), and
a pixel comparison of the HUD before and after (computed sizes and colours match the old values).

### M0: Save and load, the core (size L)

Status: done 2026-10-17 (the screens are M0b, also done). A save keeps one continuous game, and loading is
booting: the page starts over and applies the save while it builds. It comes right after the UI kit because
every later system adds its own slice, which is cheaper than retrofitting them all.

Design:
- Slots: one rotating autosave (keep the last two) plus three manual slots. Manual save at the temple (a key
  near the door, also a button in the overview and the pause menu). Autosave every 5 minutes of play, when
  the tab is hidden (`visibilitychange`) and on `pagehide`. A start screen offers Continue, Load and New
  game (New game on a used slot asks before overwriting). The game starts directly in island-mountain;
  the map picker stays for DEV only.
- Storage: IndexedDB, not localStorage (about 5 MB cap and synchronous writes). One versioned snapshot:
  `{ version, savedAt, playSeconds, mapId, summary, profile, village }`. `summary` (day count, population;
  a thumbnail was dropped) feeds the load list. A snapshot that is corrupt, from a newer version or from another
  map is refused with a message and the previous autosave stays; a `migrate(from)` chain upgrades older
  versions.
- Saved (authoritative state only): profile (`GameState`, sparks and unlocked nodes, player position and
  yaw, day-cycle clock and cloud wind clock, orb slot states with positions, quest state and story beats seen); village (faith, buildings with id, type,
  position, rotation, stage, progress and ring, fields with growth, the villager pool arrays including
  belief, the economy stock, tree states, graves, the sim's RNG streams). If a fog of war is built later,
  it joins the save.
- Rebuilt on load: ring model (a pure function of map heights and seed), site grid, pathfinder blocks,
  terrain pads and grass/AO marks, instance buffers.
- Saved even though it looks derived (spike 2, 2026-10-17): the path network and the wear grid. Replaying
  `linkBuilding` and `linkField` for the saved buildings does not reproduce the roads: in three headless
  runs (island-mountain 2 h and 6 h, dala 6 h) the replayed network had a different number of links and
  radial lanes (for example 254 links and 15 radials against 231 and 10), and the very first laid-path
  paint after founding already differed. Two causes: the plan RNG is shared with the planner (many draws
  per placement, one per building kind chosen), which a replay does not run, and extra radial lanes are
  decided by it; and routing reads the pathfinder's cost grid, which follows the wear that villagers'
  footsteps built up (not separated from the RNG effect by this spike). Founding alone does reproduce:
  the plaza, main road and first houses gave identical network stats. So the network's nodes, links and state, and the
  wear data, get their own `serialize`/`restore`.
- Each system owns a `serialize()` and `restore()` pair. `createVillageSim` gets a `restore` option that
  skips founding. Every later milestone adds its slice plus a round-trip assert in the same change.

Checklist:
- [x] `src/save/` (done 2026-10-17; documented in `AGENTS.md`, Save system):
      snapshot type, version and `migrate` chain; IndexedDB store (list, read, write, delete); rotating
      autosave over two slots; Continue that passes over unreadable slots; error handling. `npm run
      check:save` covers the rules and the service on a memory store; the IndexedDB store was run in
      headless Chromium (round trip with typed arrays, a failed write changes nothing, a damaged slot is
      passed over, retry after a failed open, persistence across a page reload).
- [x] Village sim `serialize`/`restore` (done 2026-10-17): `sim.serialize()` returns a `VillageSimState` (plain
      structured-clone data; typed arrays stay typed) and `createVillageSim({ ..., restore })` continues it
      instead of founding. Saved: counters and timers, buildings, fields, faith, the villager pool cut to its
      live count, the site grid's occupancy, the pathfinder's cost grid (it lags the wear by up to 10 s, so
      it cannot be recomputed), the wear field, the whole path network (spike 2: replay does not
      reproduce it), the well spot and field counter, the agents' path queue, and the two RNG streams
      (spike 1: `alea` exports and imports its position). Rebuilt on restore: the pathfinder's blocked
      cells (only buildings and fields block, so replaying their footprints is exact), residents per
      building (from each villager's `home`) and work-slot and spot claims (from `slot` and `target`),
      so a save cannot hold claims that disagree with the pool. `npm run check:save-village` is the sim-smoke
      round trip: a straight run and a run saved midway (through `structuredClone`) and restored must end
      in identical state with identical events, on island-mountain and on dala with trees and shore, at 1
      minute, 1 h and 3 h; I checked that it fails when any of eight parts of the restore is left out, and
      the `check:village-smoke` fingerprints are unchanged. Not saved (belongs to later items): the orb system's
      `-orbs` RNG stream, and `GameState`.
- [x] Game-side `serialize`/`restore` (done 2026-10-17; `src/save/profile.ts`): the save's `profile` holds
      `GameState`, the reveal and day-cycle state (`DayCycleContext.serialize/restore`: a reveal in
      progress carries on from where it stopped, a finished one is not replayed), the player's position,
      the camera's yaw and pitch, the picked-up orbs by position (they match within 0.5 m, so editing the
      map between saves does not break a save) and the fixed-step and wind clocks. The `-orbs` RNG stream
      needs no saving yet: it is drawn only while the orbs are made, and M1c's respawn adds it.
      `parseProfile` is strict and names the damaged part.
- [x] `VillageSystem` and `VillageView` start from a restored sim: `initVillageSystem({ restore })`, shown
      by the same `view.showFounded()` as a new village (every building at its saved stage, pads levelled by
      their saved progress, no rise-in; `wear.restore` marks every tile dirty so the halo is rebuilt).
      `villageStateProblem` lets the game refuse a village that does not fit the map before it changes
      anything.
- [x] Boot and autosave (done 2026-10-17): `main.ts` reads the save after the map loads
      (`save/bootSave.ts`), refuses one it cannot continue from (damaged, newer version, another map,
      a village that does not fit) with a message shown once loading ends, and otherwise applies it in
      build order. Continue passes over an unusable newest slot. Autosave every 5 minutes, when the tab is
      hidden and on `pagehide` (the state is captured synchronously; the IndexedDB write is best effort
      once the page is going away). Manual saves toast "Game saved".
- [x] DEV: `window.__pantheonSave` (`save`, `autosave`, `list`, `read`, `load`, `newGame`, `wipe`,
      `capture`, `restored`).

Verified (2026-10-17):
- Headless: `npm run check:save` (rules, service, profile, autosaver, boot), `npm run check:save-village` (a
  village run straight on equals one saved midway and restored, on two maps, plus the compatibility
  checks against a real village) and unchanged `check:village-smoke` fingerprints.
- In the real game, in headless Chromium, 18 checks over 12 boots (a fresh browser per boot, the same
  profile): a village with 9 buildings (3 under construction), 17 villagers, 2 picked-up orbs and a
  moved player comes back as saved and keeps living; a save made mid reveal sunrise carries the sunrise
  on, and one made after it does not replay it; a village that does not fit, an unusable newest slot and
  a save from another map are refused or passed over with a visible message; hiding the tab and leaving
  the page autosave, a plain visit does not. The run found one bug (the refusal message was raised behind
  the loading screen and expired unseen), fixed.
- How the browser run was possible: this container's Chromium 141 cannot run the game as is. It needs two
  test-only shims in the harness (drop the texture-view `swizzle` default that three sends as a string,
  and hand three an offscreen texture instead of the canvas swapchain, which headless Chromium cannot
  create) and one browser process per boot. The game's own code is unchanged for it. Frame readback
  failed, so there are no screenshots, and nothing here checks how the restored village looks. Look at it
  once in a real browser.

Still to do for every later milestone: add its slice to the save and extend `npm run check:save-village` in the
same change (the check fails when something the future depends on is missing). Open for M0: a migration
test with a real fixture snapshot once `SAVE_VERSION` first goes up, and a look at the restored village in a
real browser.

### M0b: Save and load screens (size M)

Status: done 2026-10-17. The player-facing layer on the M0a kit (`src/ui/saves/`, documented in `AGENTS.md`,
Save system). Decisions taken with the user: `E` saves at the temple, Esc opens the pause menu and it
freezes the world, no thumbnails, no gamepad, three manual slots, a quiet look (to be refined later).

- [x] Start screen: Continue (newest save, with its day, villagers and age shown), Load game, New game (asks
      first when saves exist), Settings. A production build always shows it and starts in island-mountain;
      the map chooser is DEV only. A DEV build's plain visit skips it and never saves, so reloading while
      developing stays instant and cannot touch a save (`?start` shows it, `?new`, `?save` and `?load=`
      skip it). If the browser will not let the game read its storage the screen says so.
- [x] Pause menu: Resume, Save game, Load game, Settings, Quit to start (saves first, and stays if that
      fails). It opens on Esc with the mouse free, or when the mouse lock is lost with no panel open (the
      browser swallows Esc while the mouse is locked, so the page only sees the lock go; this also covers
      alt-tabbing away). `GameLoop.setPaused` stops fixed steps and passes a frame time of 0, so the world,
      the sky and the play clock stand still while the frame keeps drawing.
- [x] Slot lists: autosaves (newest first, only those that exist), then three numbered slots; day,
      villagers, play time and age; a used slot asks in its own row before it is replaced, loaded over or
      deleted (numbered slots only).
- [x] Manual save at the temple: within the temple's footprint plus 14 m a hint "Press E to save" fades in and
      `E` opens the save list; an autosave indicator ("Saving", at least 1.2 s) bottom right; "Game saved
      (slot 2)" toast.
- [x] `navigator.storage.persist()` is asked for whenever saving is on; the storage-full error reads
      "Not enough storage space to save the game."
- [x] Loading from a menu reloads the page with the chosen slot (`loadUrl`); Quit to start reloads with
      `?start` (`startScreenUrl`). Both stop the game loop first so the leaving page stops drawing.
- [x] Thumbnails: dropped by decision (2026-10-17); the `summary.thumbnail` field was removed on 2026-10-18.

Verified (2026-10-17): headless `npm run check:save` (launch rules, slot lists and times, pause rules,
autosaver); in headless Chromium, 28 checks over 6 boots (a fresh browser per boot, one profile): the
start screen with empty and with full storage, Settings above it, New game's question and Cancel, Continue,
Load list and Delete with their questions, the pause menu opening on Esc and on losing the real mouse lock,
the world frozen while it is open (the clock moves before, stands still during, moves again after
Resume), saving into an empty slot, replacing (Cancel changes nothing), the temple hint appearing, `E`
opening the list and the hint going away from the temple, the indicator showing and hiding, Quit to start
saving a newer autosave and navigating to the start address, loading from the pause menu saying what is lost
and coming back on that save, and a DEV plain visit staying quick; the production build
(`npm run build`) and its bundle in the browser: start screen by default, no map chooser, island-mountain,
DEV hooks absent, Esc opens the pause menu. The run found two bugs, fixed along the way: a page that was
leaving kept drawing and slowed the next one, and (earlier) a refusal message that expired behind the
loading screen.

Limits of that check: this container's software GPU makes a page change take a minute or more, so the
test watches the navigation request instead of waiting for the next page in the same browser; the real
Esc key with the mouse locked is the browser's, so only the lock-loss path was exercised (a real lock was
granted and released); nothing checks how the screens look. Look at them once in a real browser.

### M1: Skill tree rules, sparks and the ability framework (size M)

Status: **done 2026-10-17** (the core; the tree panel, ability bar and casting input are M1b). Decisions: the
milestone was split like M0; the framework ships with no castable power (the three conversion powers need
belief, so they arrive in M2); arch I powers are cast from a radial menu (held key, mouse choice); `T` reopens
the tree and the world is paused while it is open.

- [x] `src/abilities/`: `AbilityDef` (id, arch, cost in energy or faith, cooldown, targeting: self, villager,
      house, cursor or sky), the pure cast pipeline (`caster.ts`: granted, cooldown, energy, faith, target;
      pay, perform, cooldown; a rejected target costs nothing), `abilityRuntime.ts` (wired to
      `core/energy.ts`, `ability:cast` event, cooldowns run from the fixed step so a paused world holds them).
      `ABILITIES` is empty.
- [x] `src/skills/skillTree.ts` (pure data and rules): nodes (arch, branch, position, cost in sparks,
      requires, ranks, effects), unlock, spend, respec (free, by decision), parsing for saves.
      Effects go through the shared modifier record `src/skills/modifiers.ts`, read by the orb pickup radius,
      the player light and the energy cap; everything is 1 or 0 until a node changes it.
- [x] Opening: the tree opens once when the Aethon memory fires at the energy cap, with 2 sparks
      (`skills:opened`, `skills:changed` events). The panel that shows it is M1b.
- [x] Energy as mana via `src/core/energy.ts`; the cap reveal stays latched, so spending energy or changing
      the cap never undoes the sunrise.
- [x] Arch I passives: Resonance (pickup radius x1.6), Presence (light reach x1.5), Surge (cap +60), Echo
      (faith per absorbed orb, +1; recorded now, read once faith exists in M2). Costs 1, 1, 2 and 1 sparks;
      Presence and Surge need Resonance, Echo needs Presence.
- [x] Save slice: `profile.skills { opened, sparks, ranks }`. Save version 2 with the first real migration
      (an older save past the cap gets the tree open with its first sparks).
- [x] DEV hook `window.__pantheonSkills`; `npm run check:skills` (24 pure checks).

Results: 24 headless checks (rules, modifiers, parsing, the 1 to 2 migration, the cast pipeline) plus
12 browser checks in headless Chromium: a new game starts with a closed tree and neutral modifiers; the tree
opens once at the cap with 2 sparks and does not pay again when the energy drops and refills; prerequisites
and spark costs hold; Resonance widens the pickup (an orb 2 m away stays until it is unlocked, then goes);
Surge raises the cap to 160 and keeps the energy; a cast spends energy, a second one waits for the cooldown,
a lack of energy refuses it, and the sunrise stays; respec returns the sparks and the cap; saving keeps the
slice and loading restores sparks, ranks, modifiers and cap without paying sparks again; a hand-made
version 1 save loads with the tree open and 2 sparks.

Limits: Presence changes the player light's reach, but nobody has looked at it (the container cannot show
the canvas). Echo and `orbFaithTrail` have no effect until faith exists. Lowering the cap with a respec
clamps the energy down. Cooldowns are not saved.

### M1b: Skill tree panel, ability bar and casting input (size M)

Status: **done 2026-10-17**. The screens for M1, built on the M0a kit.

- [x] Skill tree panel (`src/ui/skills/`): constellation from the nodes' `x`/`y`, pan (drag) and zoom (wheel,
      buttons, Centre), tooltips (cost, requirements and effect with Shift), a look per node state (taken,
      in progress, available, short of sparks, locked), lit lines, sparks counter, Respec with a question.
      `T` opens it and the world is paused while it is open, like the pause menu. A quiet line "N sparks to
      spend · T" shows while sparks are unspent. The first opening is automatic, after the Aethon memory
      has finished showing (new event `story:fragmentEnded`), and falls back to 20 s after the tree opened.
- [x] Ability bar (`src/ui/abilities/`): bottom right, cost, cooldown sweep and a word when a power cannot be
      cast; hidden until a power exists.
- [x] Casting input: radial menu on `Q` (hold, choose by mouse movement, release to cast; Esc or losing the
      mouse lock cancels; the camera does not turn while it is open). Casts aim at the orb's own position
      until target picking comes with the first power (M2).
- [x] Pure parts (node status, tooltip text, edges, pan/zoom, radial sectors, bar rows) are in
      `npm run check:skills` (they are not UI-kit rules).

Results: 16 browser checks in headless Chromium on a new game: no tree before the cap; at the cap the tree
opens by itself about 10 s later (after the memory) and not while the memory is showing, without also
opening the pause menu; the clock stands still while it is open and runs again after Esc; the hint appears
and `T` reopens; node states, tooltip text, a refused click ("Needs an earlier skill first") and taking
Resonance (lit lines, next nodes available, modifier changed) all follow the rules; buttons, wheel and drag
pan and zoom (a drag takes nothing); Respec asks, Cancel changes nothing, Respec returns the sparks; with a
throwaway power the bar shows it, a real mouse lock was granted, `Q` opens the menu, a pointer movement
chooses and the camera yaw does not change, releasing casts (energy 100 to 90, cooldown on the bar), the
camera turns again afterwards, a cast on cooldown says "Not ready yet", letting go with nothing chosen casts
nothing, and losing the lock cancels without casting. Fixed on the way: the camera look block was passed
unbound and would never have worked in the game.

Limits: the radial menu was driven with synthetic pointer deltas (this container has no real mouse), so how
it feels is untested; the screens were only seen with the 3D canvas missing (they sit on a flat colour
here). The look of the tree, the bar and the menu is a first quiet pass for the user to refine. There is no
power yet to cast, so the bar and menu show only the throwaway test power in DEV.

### M1c: Energy regeneration and orb respawn (size M)

Status: **done 2026-10-18**. Decisions: the user adds about 20 more orbs to island-mountain in the editor
(today it has 6, worth about 33 energy in total, so the cap cannot be reached by play alone: the tree only
opens after those orbs exist); one shrine is placed at the player's start; Attunement is a cheap first pick
(1 spark, no prerequisite); the first numbers stand; the zone is shown by a ring on the ground plus a HUD mark.

- [x] `shrine` map entity (several allowed; `x`, `z`, optional `radiusM` and `regenPerSec`): type in
      `MapTypes.ts`, palette entry, thumbnail swatch, marker (stone plus a ring at the zone radius, pinned so
      picking and the gizmo use the stone), move-only gizmo rules, equality in `EditorHistory.ts`, validation
      in `isValidMapEntity`, `collectShrines` and `world.shrines`. One shrine is in `island-mountain.json` at
      the start point.
- [x] Node Attunement (arch I, 1 spark, no prerequisite): energy returns inside a shrine zone, 0.5 per second
      (`PHASE0.SHRINE`, about 3.3 minutes from empty to the cap).
- [x] Node Renewal (arch I, 1 spark, needs Attunement): 0.05 per second anywhere.
- [x] Orb respawn (a rule, not a skill): `src/entities/energyOrb/respawn.ts` (pure) and `orbSystem.ts`; once the
      tree has opened a slot returns every 240 s while fewer than 12 orbs are alive; the spot is open land
      above the water (slope under about 25 degrees), at least 40 m from the player and 25 m from live
      orbs, out of the village disc plus 15 m, and half of the time 30 to 120 m around a shrine. Seeded
      stream (`alea`), position saved. `EnergyOrb.respawn(...)` moves the slot's orb; value 3 to 7.
- [x] `state.orbsAbsorbed` (night lightness): a respawned orb does not add to it; authored orbs still do.
- [x] One regeneration tick (`energyRegen.ts`) that sums shrine zones (best zone, never stacked) and the flat
      trickle; later believers (M2) and the temple (M9) add terms in `regen.ts`.
- [x] HUD "+0.5/s" mark beside the energy bar while energy returns; a faint ground ring at each zone's edge
      that brightens while the orb stands in a zone it can use.
- [x] Save version 3: `profile.orbs { absorbed (home places), relocated, respawn { remainingSec, rng } }`,
      migration 2 to 3. Slots are named by their home place, so a map edited between saves (new orbs added)
      still matches.
- [x] `npm run check:energy` (26 pure checks), DEV hook `window.__pantheonOrbs`.

Results: 26 headless checks (zone maths, gating by Attunement, no stacking, the cap, empty to full in about
200 s, spot rules over hundreds of draws, determinism, the shrine bias, the clock, the 2 to 3 and the 1 to 3
migrations, parsing) plus 19 browser checks in headless Chromium: the map's shrine is one zone at the start
point with one ring; nothing regenerates and no orb returns before the tree opens; after it opens the
picked-up orb returns at least 40 m from the player and 25 m from other orbs; without Attunement the
shrine gives nothing; with it energy rises about 0.5 per second inside the zone and the HUD shows "+0.5/s",
nothing outside; Renewal adds 0.05 per second anywhere ("+0.05/s", "+0.6/s" inside the zone); the mark goes
away at the cap; the sunrise is untouched; a respawned orb gives its energy without changing
`orbsAbsorbed`; the live-orb cap stops respawns; respawns land on walkable land; a save keeps relocated
orbs, the clock and the stream, and a load restores them exactly; a hand-made version 2 save loads with its
picked-up orbs kept and a full clock. The editor agent also checked, in the editor page: the palette entry,
dropping shrines (several, with undo and redo), validation of good and bad shrines, equality and the gizmo
flags, and that all 2803 entities of island-mountain validate.

Limits: nothing has seen the ring (in play or in the editor) on screen: this container cannot read the 3D
canvas back. Draping on steep ground and the ring's look are untested; selecting and dragging a shrine in
the editor was not exercised, only its flags and bounds. The orb count on island-mountain (6) means the cap
is unreachable until orbs are added. Respawn spots are drawn over the whole map, so a respawned orb can be
a long walk away (half of them are near a shrine). The first shrine sits at the start point, so the player
meets regeneration right away once Attunement is taken.

### M2: Hamlet, belief and conversion, the core (size M)

Status: **done 2026-10-18**. The "Whisper" act, first half, without the player-facing powers (M2b) and the
elder and quest (M2c). Decisions (2026-10-18): M2 is split into this core and M2b; the hamlet is the temple
plus 3 houses, 2 fields and the well, 11 souls, frozen until converted; a DEV flag (`?sandbox`) keeps today's
self-growing village; conversion is provisionally the elder plus 60% believers (7 of 11); sparks come 1 per
convert after the fifth and 3 when the village converts; no message per convert, only a counter.

- [x] Hamlet start (`mode: 'hamlet'`): founded finished (temple, 3 houses, 2 fields, the well, 11 people with no
      builders) and frozen: no new sites, fields, newcomers or faith income until `villageConverted`. The
      sim's default mode stays `'sandbox'` (today's behaviour), so the headless fingerprints did not change.
- [x] `belief` per villager in the pool; the elder is the first priest; converts counter; events
      `villagerConverted` and `villageConverted` (bus: `village:villagerConverted`, `village:converted`).
      Belief is raised through `sim.addBelief` (the DEV hook `__pantheonVillage.believe`/`addBelief` and,
      in M2b, the powers).
- [x] Faith income from believers (`PER_BELIEVER_PER_SEC` 0.015, with the orb's presence on top); the temple's
      crown orb and beam follow the share of believers (full strength when everyone believes).
- [x] Provisional conversion rule (replaced in M2c by the quest chain): the elder believes and at least 60% of the village does (7 of 11).
      `state.phase = 2` at `villageConverted`; growth then starts and newcomers arrive believing, with a
      building crew (builders are handed out again).
- [x] Sparks through the skill runtime: 1 per convert after the fifth, 3 at the conversion (a closed tree holds
      no sparks, so converts before the tree opens give none).
- [x] HUD: "N / 7 believe" in the village line once the first villager believes (and "10 believe, the elder not
      yet" when only the elder is missing); gone after the conversion.
- [x] Save version 4: `converted`, `elder` and `villagers.belief` in the village state, migration 3 to 4 (an
      old village counts as converted and believing, so its faith income is not zero).

Results: 11 hamlet checks (`npm run check:village-hamlet`: the rule at its edges, belief clamping and events, the
hamlet founded finished with an elder who is a priest and no builders, frozen for 6 hours with no income even
with the orb close, income exactly believers times the rate, each convert and the village reported once, the
seventh believer of eleven converting with the elder first, growth and believing newcomers after the
conversion, determinism, sandbox mode unchanged, a save restoring belief, elder and conversion); the three
sandbox fingerprints unchanged (island-mountain `16169f02e4ef`, dala (280,540) `211e3ae95d49`, stress
`1a993e9f676b`); `npm run check:save-village` now also runs hamlet round trips with scripted belief, saved before,
between and after the conversion; save checks for the 3 to 4 migration; and 12 browser checks in headless
Chromium: the game starts with the finished hamlet, it stays frozen with sped-up time and the orb forced
close, belief brings faith, the counter shows and counts, partial belief is not belief, everyone but the
elder does not convert it, the elder does (phase 2, 7 then 11 sparks), the hamlet then grows and its
newcomers believe, a save keeps it all and loads back, a hand-made version 3 save migrates, and `?sandbox`
keeps the old village.

Limits: nothing yet raises belief in the game itself (the powers are M2b), so conversion can only be tried
through the DEV hook; the crown orb following belief was not seen on screen (the container cannot read the
3D canvas); the hamlet's look and size (11 souls, 3 houses) have not been judged in a real browser; faith has
no use before the conversion yet. The browser run ends with the software GPU losing its device about 80 s into a
sped-up run: the old sandbox village does the same (measured on this code), so it is the container, not
the hamlet; the checks had passed by then.

### M2b: The conversion powers and how believers look (size M)

Status: **done 2026-10-18**. The player-facing half of the Whisper act, on the M2 core.

- [x] Powers Murmur, Dream and Sign as abilities (M1). Murmur is free when the tree opens (`grantedAtOpen`); Dream
      and Sign are one tree node each (1 spark, no prerequisite). The effects are pure (`src/abilities/powers.ts`,
      over the village pool); `main.ts` hooks them in with `onCast`.
- [x] Murmur is a channel: casting it starts up to 20 s on the nearest villager within 6 m, draining 1 energy per
      second and raising belief 1 in 20 s; it ends when the orb is more than 6 m away, energy runs out, the
      villager believes, or it is cast again. Dream: about 8 energy, the nearest house within 14 m, each
      sleeper +0.35 belief, once per house per night. Sign: 12 energy, 30 s cooldown, everyone outdoors
      and awake within 25 m +0.3 belief; with a burst of sparkles at the orb.
- [x] Villagers react with existing poses only: `sim.notice` holds a villager still (Idle pose), facing the orb,
      then they take up what they were doing. Not saved.
- [x] UI: a faint lilac pip above villagers with belief within 15 m of the orb (brighter with belief), a ring
      on the villager Murmur (and the house Dream) would reach, steady while Murmur runs; the bar slot says
      "Channelling". DOM markers placed from the camera (`src/ui/overlay/`), which M3's overlay can reuse.
- [x] Target picking for the radial menu's casts: the nearest villager or house in range, or the orb's place; no
      target means "Nothing to aim at" and nothing is paid.
- [x] DEV: `window.__pantheonPowers`, and `__pantheonVillage.setDayPhase(p)` to run the village at night.

Results: 14 headless checks on a real hamlet (`npm run check:powers`: reach by distance and indoors, the night
clock, Murmur's rate and drain and ending in each of its ways and standing still while facing the orb,
villagers moving on afterwards, Dream's sleepers and once-a-night rule, Sign's witnesses and how it stands
still, signs alone converting the whole hamlet, the powers through the cast pipeline with costs and
cooldowns); 12 browser checks in headless Chromium with a real mouse lock and the radial menu: no bar before
the tree opens, Murmur there after it with no node and the others absent, the ring on the nearest villager,
a Murmur channel measured against game time (belief +1/20 per game second, energy 1 per game second, the
villager still and facing the orb, ring steady, pip, "Channelling"), ending by casting again and by
walking away, "Nothing to aim at" with nobody near, Sign appearing on the bar after its node, Sign costing 12 and
giving belief to those near and then waiting, Dream refused by day, and by night (village phase 0.95) ringing
the house, +0.35 to each sleeper, 8 energy and refused the second time.

Limits: how the powers feel and read on screen was seen only as DOM (rings, pips, bar, no 3D world behind
them); the sparkles of a Sign were not seen; the radial menu was driven with synthetic mouse movement; the
numbers (20 s, 6 m, 0.35, 0.3, 25 m) are first guesses, and with them the hamlet converts in a few minutes
of play (the headless run needs 20 signs spread over the village). A villager at work or at prayer is
reached like anyone else outdoors; their schedule resumes afterwards. Dream's "once per night" is not saved.

### M2c: The elder, story beats and quests (size L)

Status: done (2026-10-18). The story weave: the orb meets the elder, and that meeting starts the quest to convert the
village. The story content is deferred: this builds the framework and a placeholder chain with placeholder
lines (marked, in one data file) to be replaced once the story is written.

Decisions (2026-10-18): the meeting happens when the orb comes within about 6 m of the elder while he prays
(no camera takeover; he stops, turns to the orb, and a story line plays); four steps: meet the elder, convert
5 villagers, two help tasks, the elder believes; the elder's belief does not move until his step; the quest
chain replaces the provisional "elder plus 60%" rule (the village converts when it finishes); the help tasks
are "light the temple fire" (cast Sign within about 15 m of the temple at dusk) and "make an offering"
(stand at the temple with at least 50 energy and give 40 of it, about 10 s); rewards are 1 spark for the
meeting and 1 for each help task, on top of the convert and conversion sparks; one quiet objective line at
the top left and a journal on `J` (finished steps and memory fragments); after the meeting the elder gets
a larger pip, visible within 40 m.

- [x] `src/quests/` (pure data and rules): a quest has steps; each step has text, a goal, a rule that turns
      events and the world snapshot into progress, and effects (sparks, story beats). The state is
      serialisable (current step, progress, done flags, beats seen).
- [x] Story beats: data (id, lines) shown through the existing queue in `src/ui/StoryLog.ts`; placeholder text.
- [x] The elder: `elderMet` fires when the orb is within range of him while he prays and the game is in phase 1
      or later; he stops and faces the orb.
- [x] Remove the provisional conversion rule: the quest's last step converts the village; the sim gets an
      explicit `convertVillage`; belief of the elder is gated until his step.
- [x] The conversion quest chain with the two help tasks above; the offering takes energy at the temple.
- [x] Objective line and journal panel (`J`), and the elder's own pip.
- [x] Save slice: quest state and beats seen (save version 5, migration 4 to 5).

Verify (done, see Results): pure tests of step progression (conditions, order, no double reward, the gating); a smoke run of the
scripted chain to `villageConverted`; a save made mid-quest resumes at the same step; in the browser the
meeting triggers once and the objective line updates through every step to the conversion.

Results: `npm run check:quests` (about 18 checks: chain order, the meeting, convert progress never going back, the fire needing
dusk and the temple, the offering filling in pieces, the last step, rewards and beats given once, objective and
journal text, the elder's gating, the meeting and offering rules, `parseQuest`, migration 4 to 5, `parseProfile`);
the old 60% rule is gone from the sim (`convertVillage` is explicit); `storyLog` shows beats through the same queue
as memory fragments. Placeholder lines live only in `src/quests/story.ts`. Browser run (headless Chromium, 16 checks, the whole
chain on the real game): the elder cannot be raised before his step; walking up to him while he prays triggers the meeting once
(1 spark, the objective appears, a story line shows, the elder pip appears); the counter follows the believers and the fifth
finishes the step; a Sign at dusk far from the temple does not light the fire and one near it does (1 spark, beat); the offering
does not begin under 50 energy, flows at 4 per second and stops when the orb walks away; a save made mid-offering reloads at the
same step with the same progress and beats; the elder's belief converts the village (phase 2, the sixth believer's spark and the
3 conversion sparks, no objective left); `J` shows the five steps struck through and the memories, and Esc closes it.
The run found one real bug that is fixed: `VillageSystem.applyEvents` replayed the event being delivered when a listener raised
another (the quest converting the village as the elder believed), paying the sixth believer's spark twice; it now drains the
queue before delivering. The sandbox fingerprints are unchanged (`16169f02e4ef`, `211e3ae95d49`, `1a993e9f676b`).
Limits: the story lines are placeholders; the elder stands for 10 s at the meeting but there is no camera moment; the
offering and the fire have no special visuals yet (the Sign's sparkles are the only effect); Dream and Sign can still raise the
other villagers before the meeting (only the elder is gated).

### Housekeeping after M2c (done 2026-10-18)

An audit of M0 to M2c (dead code, duplication, structure, quality) ran before M3 and was done in five commits:
A correctness (a save is validated before it is written; the elder gate in one place, Murmur no longer aims at
him; Echo gets a reader; the check scripts are type-checked), B dead code and quick wins (old save migrations
dropped, so older saves are refused as too old; shared helpers; no polling), C test hygiene (shared runner and
fixtures, `npm run check:all`), D structure (`main.ts` split into `gameplay/initGameplay`, `save/setupSaving`,
`gameplay/progression` and one probe installer; `core/GameState.ts` became `core/settings.ts`; pure orb and
day-cycle saved state) and E UI kit (a `button`, `pausesWorld` panels, hold and panel-aware hotkeys, a hint
slot, the skill panel split in three, cheaper world markers, no more id-selected HUD fades). Findings that
changed behaviour: Murmur's ring sat on the gated elder; the skill tree could open a second time when the
first-opening fallback had already fired; saving could write a file that could not be loaded. The reserved
(not yet used) surface is listed in AGENTS.md and stays for M3 to M9.

### M3: Builder phase: overview camera, orb cursor, info icons (size L, in two parts)

Status: done. M3 core 2026-10-18 (toggle, camera, orb cursor, clean exit); M3b 2026-10-19 (clicks, info panel, bed
dots and the beds chip). Opens when the village is converted.

Decisions (confirmed 2026-10-18):

- [x] `B` toggles the overview within 14 m of the temple's footprint, after the village is converted; `B` again
      or Esc (with no panel open) leaves. The sim keeps running; the overview is not saved (a load starts in roam).
- [x] Camera: WASD or arrows pan, wheel zooms, right-drag turns, **left-drag grabs the terrain** (the user's
      addition); fixed 55 degree pitch, no edge scrolling; clamped to the village radius plus 40 m;
      0.8 s move in and out.
- [x] The mouse is freed and the system cursor hidden; the orb hovers at the mouse's ground point with a
      smoothed float and bob. On leaving the orb stays where the player was (it flies back) and the camera
      swings behind it; it does not land at the cursor.
- [x] Spike answered: the orb's visuals are one group positioned from the logic position in
      `applyRenderPosition`, so `PlayerController.setVisualOverride` draws it elsewhere without touching the
      logic position (pickups, regeneration, quests, the sim). No second orb mesh.
- [x] Casting powers from the overview waits for M9; wood and food chips come with M4/M5.

M3 core:

- [x] `src/overview/overviewMath.ts` (pure) and `overviewController.ts`; `CameraRig.computePose/getLook/setPose`,
      `CameraInput.setCaptureEnabled`, `PlayerController.setVisualOverride` and an input switch on `update`,
      `gameTick` (the overview poses the camera and the orb first; grass, prop LOD, shadow cascades, water
      quality and the depth-of-field focus follow the view; no blur in the overview), `setupSaving`
      (`canPause`: freeing the mouse does not open the pause menu), `PHASE0.OVERVIEW`, DEV
      `window.__pantheonOverview`, `npm run check:overview`.

M3b (done 2026-10-19), confirmed with the defaults:

- [x] What can be selected: houses, building sites, fields, the temple and villagers. A villager wins when one
      is within 24 px of the mouse (outdoors only); otherwise a building, by the mouse ray against its box (so a
      roof counts, not only the ground under it); otherwise a field.
- [x] Hover: a ring on the thing under the mouse and a small name tag; the orb cursor stays as it is.
- [x] A click (a left press under 4 px of movement) opens a non-modal info panel docked right (world keeps running,
      updates live); Esc closes the panel first and then leaves the overview; a click on empty ground closes it;
      leaving closes it. Houses list residents and beds, villagers their doing, belief and home, sites their
      stage and progress, fields their growth, the temple the believers. Resident rows select that villager and
      "Go to" moves the view there. Villagers are "Villager N" (the sim has no names) and "The elder".
- [x] Bed dots above each finished home when the camera is closer than 120 m, amber when the village has no free
      bed; a chip at the top with souls and beds ("no free beds" and amber when full).
- [x] Selection is not saved. No power casting yet (M9); wood and food chips come with M4/M5.

Results (M3 core): `npm run check:overview` (pose, clamps, key pan in the camera's frame, the ray against flat
and sloped ground, the plane hit, the grab, the entry rule); 15 browser checks in headless Chromium with a real
mouse and keys: B does nothing before the conversion or far from the temple, the hint shows at the temple, B
enters (pointer free, cursor hidden, no pause menu, hint changes), the orb cursor sits on the ground point
under the mouse and follows it, WASD pans while the player stays put, a left-drag keeps the grabbed point
under the mouse, the wheel zooms and clamps at 25 and 220 m, right-drag turns, the view stays within the village
disc plus margin, Esc leaves with no pause menu, six quick B toggles in and out leave nothing stuck (the player
moves again afterwards), B and Esc belong to an open panel, a save during the overview works, a narrow window
works.

Results (M3b): `npm run check:overview` now also covers the picking (the ray against a building's box in the
village's rotation, nearest villager, villager over building over field, indoors villagers skipped) and the
panel text for every building, field and villager of a real hamlet and a grown village (residents listed match
the sim, beds add up to `stats().beds`, sites show a progress bar). 13 browser checks in headless Chromium with a
real mouse: the chip, a bed-dot row for every finished home, hover rings and names a house, a click opens the
panel (docked right, world clock still running), a resident row selects that villager and Go to moves the view,
Esc closes the panel and keeps the overview and the next Esc leaves (no pause menu), a drag from a house pans
without selecting, a field and a building site can be selected, a click on empty ground closes the panel, `B`
leaves with the panel open and the overlay goes, and with every bed taken the chip says "no free beds" and the dots
turn amber. A village of 60 buildings showed 27 bed-dot rows at 80 m, none at 219 m and no console errors.

Limits: the 3D frame could not be captured. In this environment the software GPU device is lost about half a
minute after the game starts (also with no overview at all: a control run of roam only lost it at the same
point), and reading the canvas back loses it at once; after the loss the game logic, camera, input and DOM
keep running, so every check above is of those, but how the view and the overlay look (cursor size, ring and dot
sizes against real buildings, shadows and grass far from the orb, the swing back) was reasoned, not seen, and
the frame time was not measured on a live GPU. The camera distances (25/80/220), pan speed, cursor size, the 24 px
villager reach, the building box heights (guesses by type) and the 120 m dot distance are first guesses for the
user to tune.

### M4: Stockpiles, production, wood-gated building, housing pressure (size M)

Status: done 2026-10-19. Wood and food exist, the right roles make them, and wood plus bed pressure decide when
houses start.

Decisions (confirmed 2026-10-19, all defaults): faith, wood and housing pressure (free beds under 15%, counting
beds in sites under construction) gate a site; 3 sites at once, 5 when free beds are under 5%; each person eats 1
food per game day; fields, fishermen and woodcutters produce (wood from felled trees since M6); costs house_a 10, house_b 14,
house_c 18, workshop 20, granary 20; 40 of each with no storage, a granary adds 60 food, a workshop 60 wood; start
30 wood and 24 food; an empty larder only stops newcomers (a day of food in store is needed) and shows a warning;
the stock is on the faint village line, the overview chip and the temple, granary and workshop panels; DEV
`addWood` and `addFood`. **Save: no migration and no fallback** (the user: nobody plays yet): the stock is part of
the village state, the save version went to 6, and an older save is refused as too old.

- [x] `sim/economy.ts` (pure): `Stock`, caps from granaries and workshops, `addWood` / `addFood` up to the cap,
      `spendWood`, `canFeed`, housing pressure rules, shortages, a check for a saved stock.
- [x] `ECONOMY` block in `src/config/village.ts` (the day length is a mirror of `sky.ts` with a comment).
- [x] `villageSim.ts`: the economy; food at the field harvest; `startSite` needs wood, housing pressure and the
      raised site cap; eating from `dt`; newcomers need a day of food; `stats()`; DEV `addWood` / `addFood`.
- [x] `agents.ts`: woodcutters and fishermen call `onProduce(role, amount)` from `act()`. **Deviation:** the
      production is continuous (a rate per second at the spot), not a per-villager accumulator, so nothing new
      is saved per villager and `model/types.ts` and `villagerPool.ts` did not change.
- [x] Village modifiers (`bedBonus`, `woodPerTree`): none exist in `skills/modifiers.ts` yet, so nothing reads
      them; they come with the arch II nodes (M9).
- [x] HUD: wood and food in the faint village line (amber when short), the overview chip ("low food", "low wood")
      and the info panels; DEV panel readout and buttons, probe `economy()`.
- [x] Save: `VillageSimState.economy`, `villageStateProblem` checks it, `SAVE_VERSION` 6.

Results: `npm run check:village-economy` (about 6 s, in `check:fast`): storage caps, wood costs, the larder (adds stop at
the cap, a refused spend takes nothing, a day of eating costs a day, food never below zero), housing pressure,
shortages, a saved stock being checked, an unconverted hamlet filling its stores, and over two game hours of a
converted hamlet the food never below zero and the stores never over their caps and every started site having
paid its wood (the stock plus the wood spent only ever grows by what woodcutters bring), 13 sites started, a
sandbox village starting every site while fewer than 15% of its beds were free and never more than the cap open,
newcomers arriving only while a day of food is in store, a village with an empty larder taking in nobody, a
village with no trees (so no woodcutters) and no wood starting nothing in 1.5 game hours and restarting after
`addWood`, and the same start giving the same stocks and a save keeping them. `check:save-village` still round-trips
(its "built a village" threshold went from 20 to 10 buildings in two hours because growth is now paced). In headless
Chromium: the starting stock, the village line ("Village · 11 souls · 3 homes · wood 30 · food 23"), production
filling both stores at 32x time scale by day, the overview chip and the temple panel ("Food 29 of 40, Wood 40 of
40"), the chip going amber with "low food" and "no free beds", and a save and a fresh browser load giving the same
stock.

Balance as measured: the hamlet's two fields and one fisherman bring in about 26 food a day for 11 people, more than
twice what they eat (it starts over-provided, two fields for 11 people), and as the village grows (a field per three
houses, a quarter of the people farming) it settles near 20% more than it eats; growth in the first days is held by wood (two woodcutters bring in
about 18 wood a day each) and, with no granary, by the 40 food cap, which keeps the population under about 39
until a granary stands. The smoke layout runs (`check:village-smoke`) are **fed** (`simulate(..., { fed: true })` keeps
both stores full) because on terrain with no trees or fields (dala) a village cannot feed or build itself; the new
sandbox fingerprints are island-mountain `cb63d75a6e0f`, dala (280,540) `635d6289eafc`, stress `10f990d26e68`.

Limits: the numbers (yields, rates, costs, caps) are first guesses; hunger, death and weak villagers are M5; the
HUD wood and food are text, not the icons; the economy was not seen on a live GPU.

### M5: Hunger, death, graves and the graveyard (size M, riskiest sim piece)

Status: done 2026-10-20. An empty larder weakens the village and then kills, each death costs faith and leaves a
grave in a graveyard.

Decisions (confirmed 2026-10-20: all defaults except the elder): food at zero for 2 game days makes everyone weak;
after 1 more day one villager dies, then one every half day while it stays empty; food back clears weakness in
about half a day; a death costs 5 faith (floored at zero); a collapse pose then the body sinks away; toasts, a hunger
warning on the village line and the overview chip; the graveyard is picked at founding beyond the outer ring, away
from houses, fields and the main road; a mound and headstone per grave; **the elder can die once the village is
converted** (the user's change; before it he is spared, and he is the last of the priests to go); no migration (the
save version went to 7).

- [x] Weakness: `AgentInputs.weak`. Weak villagers walk at half speed; builders and woodcutters stand about without
      working. **Deviation:** farmers and fishermen keep working at full rate. With every kind of work stopped a
      village could never feed itself back to health, so hunger would have been a death sentence for everyone.
- [x] Deaths (`sim/hunger.ts`): idlers first, then woodcutters, builders, fishermen, farmers, priests, the newest
      first; never someone already dying, never the last villager (a village keeps at least one person).
- [x] Death presentation: `Anim.Collapse` (id 8, appended; a vertex-shader pose), the body shrinking into the ground
      after 2 s over 3 s, the event `villagerDied`, the bed freeing (`rebuildResidents`), toasts and the warnings.
- [x] Faith: `DEATH_FAITH_COST` 5 when a death begins, never below zero. (Gravekeeper, M9, can reduce it later.)
- [x] Graveyard: `planGraveyard` (modelled on `planWell` and `planField`), a 12 x 8 m plot reserved on the site grid,
      graves in rows of 2 m plots and on beyond the plot where the ground is free, a grave placeholder in
      `dressingKit.ts`. No plot (no room) means the dead just fade.
- [x] Pool removal, the spike: a swap-remove works. `Agents.remove` remaps the path queue and notices and rebuilds the
      claims from the pool (they are exactly what the pool says), the elder is re-keyed, and the bus event
      `village:villagerDied { villager, moved }` lets Murmur and the overview's selection follow the moved villager.
      No `alive` flag was needed.
- [x] `population.ts`: the residents map is rebuilt after each removal.
- [x] Save: `VillageSimState.hunger` and `graveyard`, `Villagers.dying`, version 7.

Results: `npm run check:village-hunger` (about 45 s, in `check:fast`): the pure rules (weak on day 2, deaths from day 3 with the
first at once and then one per half day, deaths stopping and weakness ending within half a day of food returning,
a fresh famine starting at once), victim order including the elder rules and the last-villager rule, the pool's
swap-remove (every array, the waypoints), the plot (clear of buildings, fields and roads, reserved on the grid, in
a hamlet and a sandbox village), plot rows, a famine's timeline (empty at once, weak on day 2.0, the first death on
day 3.0, 11 villagers down to 1 with 10 graves, faith never negative), nobody dying while there is food, an
unconverted village sparing its elder as the last one standing, a village that makes a little food settling at 6
of 11 and holding, no stale index after the removals (path queue, elder, a save taken after them continuing
identically), a dying villager unreachable by belief and notice, and determinism. `check:save-village` saves a famine at 1.0
h (before any death) and 1.6 h (after the first burial) and both continue exactly like the run that was never
saved. `check:powers` covers Murmur following a moved villager and skipping the dying. In headless Chromium: a fed
start, `starve()` (toast, "weak" on the village line), `killOne()` (toast, the collapse, the removal and a grave in
the graveyard, the village one smaller), and the overview's selection following a villager from slot 9 to slot 7
with the temple panel showing hunger and graves. New sandbox fingerprints: island-mountain `a5879a207a4e`,
dala (280,540) `5d4d5dbfa2b4`, stress `0a31c0e355ad`.

Balance as measured: hunger builds 1 s per second while the larder is empty and drains twice as fast once it is not,
so **a village that makes at least a third of what it eats never starves**; it only dwindles when production nearly
stops. With the economy numbers of M4 that is hard to reach by accident, so hunger is a threat for the player's
mistakes (a lost fisherman, farmers who died) rather than a constant. Reserving the plot costs the sandbox village
about one field of flat land on island-mountain (5 to 4 in the hamlet run).

Limits: the collapse pose and the sinking fade were not seen on a live GPU (the software GPU is lost in this
environment); the grave placeholder and its place in the graveyard are unseen; the numbers (grace, interval, the
5 faith) are first guesses; graves block no paths and the grass is not cleared under the plot.

### M6: Trees fall, give limited wood, regrow (size L)

Status: done 2026-10-20. Woodcutters fell real trees for a limited yield; a tree falls, leaves a stump and grows
back from a sapling.

Decisions (confirmed 2026-10-20: all defaults except the first): **every tree on the map can be felled**, near or far
from the temple, which nudges the player to regrow the forest over time (the earlier plan kept a ring of trees
around the temple); yield by prop key (fir 6, birch 5, pine sapling 1 to pine big 9, times the tree's scale); 25
seconds of chopping per wood; a 2.5 s fall; a stump waits 3 game days, then a sapling grows over 2 (faster in rain
once M8 exists); at most 40 saplings at once; saplings only where the site grid is free; woodcutters stop when the
wood store is full; **only the village's woodcutters fell trees** (the orb and the powers do not); no migration (the
save version went to 8).

Later item (the user's, 2026-10-20): **more world interaction, in the way Black & White does it**: the player's
orb and powers acting on the world (picking up, throwing, felling or planting trees, moving things about), not
only the village's people. It is not in M6 and not scheduled; the forest states and events here (`fell`, the
regrowth rules, the DEV `fell(n)`) are the hooks it would use.

- [x] `sim/forest.ts` (pure): states `Standing`, `Falling`, `Stump`, `Sapling` in typed arrays over the map's tree
      list, `yieldOf`, `chopSecondsOf`, `chop` (pays the wood when the last hit lands), `fell`, `update`, `nearest`,
      `counts`, `growth`, `serialize` / `restore`, `forestProblem`. Only the trees that are not standing are
      stored, plus the chopping already done on the rest.
- [x] Woodcutters: `workSpots` tree spots carry the tree id; `agentTargets.claimSpot` skips trees that are down or
      claimed (one woodcutter per tree); `agents.act()` calls `onChop`; the wood goes to the store, replacing the flat M4
      rate (`ECONOMY.WOOD_PER_SEC` is gone, and so is the old minimum distance to the temple, `TREE_MIN_FROM_TEMPLE_M`).
- [x] `render/forestView.ts`: the tree is hidden in its static prop group by `placement.scale = 0` and a recomputed
      matrix (no edits to `updatePropLod` or `resnapMapProps`; it survives a resnap), falls as a temporary
      `DynamicPropBatch` instance of its prop key about its root (ease in, small bounce), leaves a stump
      (`STUMP_KEY`, a placeholder in `dressingKit.ts`), the stump gives way to a growing sapling instance (4 Hz), and
      finally the static tree returns. Shadows are marked dirty on every change.
- [x] Regrowth: after `REGROW_DAYS` where the grid is free and fewer than `MAX_SAPLINGS` grow; `rain01` input (0 until M8).
- [x] Save: `VillageSimState.forest`, checked on restore (`forestProblem`); on load the view is set up before the first
      draw so felled trees never flash back; a tree that was mid-fall saves as such and its stump appears when the
      fall ends.
- [x] DEV: `__pantheonVillage.forest()`, `fell(n, x?, z?)`, a dev panel button and readout.

**Deviations.** The plan wrote "Felled" as a state; the sim has `Falling` (the 2.5 s) and `Stump`. The update runs in
tree id order, not insertion order, so that a restored forest continues exactly like the saved one; the stump
check runs every step (the first design checked once a second, and its phase was not saved).

Results: `npm run check:village-forest` (about 20 s, in `check:fast`): yields and chop times, the life cycle (felled, falling,
stump, sapling, tree), rain and occupied ground and the sapling cap, save and restore (mid-fall, stump,
sapling, half-chopped), `nearest`, real woodcutters on a real map felling trees while the village spends the wood (23 trees
in 1.5 h, 133 wood), no stale claims after a DEV fell, a full store stopping the felling, regrowth over 3.2 days (27 saplings
for 25 felled), determinism. `check:save-village` adds forest scenarios on dala (DEV fell plus woodcutters, saved
at 0.0005 h, 0.4 h and 1.3 h), all continuing exactly like the run that was never saved. `check:village-economy`'s wood
bound is now "stock + spent <= start + the yields of the trees felled". In headless Chromium (island-mountain): `fell(10)`
gave ten falling and then ten stumps, 256x time brought them all back to standing, a save with felled trees
reloaded with the same stumps and standing count, and no console errors with the new dynamic tree batches.
New sandbox fingerprints: island-mountain `c345500a5538`, dala (280,540) `5d4d5dbfa2b4` (unchanged: that run keeps the
stores full), stress `03a693bcbfeb`.

Balance as measured: felling is the village's wood supply now. A hamlet's woodcutters bring down about 15 trees an
hour of village time while the village spends the wood (the store caps at 40, or 100 with a workshop, and felling
stops while it is full, so a village that does not build does not clear the forest). M4's wood numbers changed (no
flat rate): the early game now depends on how close trees stand to the village.

Limits: the fall, the stump, the sapling growth, the shadows and the LOD swap of a falling tree were not seen on a live
GPU (the software GPU is lost in this environment); frame time with the extra dynamic draws is unmeasured; the
prop contact AO and the grass exclusion map are baked from the original props, so a felled tree leaves a dark patch
and no grass under the stump (decide after seeing it whether a re-bake is worth it); the stump is a placeholder;
the numbers (yields, 25 s per wood, 3 and 2 days) are first guesses.

### M7: Daily routines per role (size M, can run next to M6)

Status: done 2026-10-20. The village has a day: work with a meal at midday, an evening meal, bed; rain sends people
home; priests mourn at the graves; idlers keep to the plaza.

Decisions (confirmed 2026-10-20: 1b, 2b, 3a, 4a, 5b, 6a, 7a, 8a, 9a, 10a): **the food is deducted at the meals**
(no continuous eating any more); a villager without a home eats on the plaza; `Shelter` is built now, driven by a
`rain01` input (0 until M8, a DEV value until then, threshold 0.3); priests mourn at the graves at dusk in place of
the dusk prayer and then go home; **fishermen keep fishing all day** (not dawn and dusk only); farmers and builders
work from dawn to the work end with the meal break; idlers stroll on the plaza by day and are home at dusk; vigil
mode is unchanged; meal windows 0.45-0.50 and 0.70-0.74 in `VILLAGE.VILLAGERS.SCHEDULE`; no migration (the save
version went to 9).

- [x] `sim/routine.ts`: the whole timetable (`scheduledActivity` with a `world` of shelter and mourning), the
      meal windows, and the `Done` bits (midday meal, evening meal, mourned) kept per villager in `Villagers.done`
      and forgotten again once their window is over.
- [x] New activities `Eat`, `Shelter`, `Mourn` in `model/types.ts`; `agents.ts` (`begin`, `arrive`, `finishPath`)
      handles them. A meal or the mourning, once begun, is seen through. The poses are the existing ones (idle,
      pray); at home people are simply indoors.
- [x] The larder: `economy.eat(round)` takes one portion (`MEAL_FOOD`, half a day's food) at the table; the sim's
      `onEat` calls it. A short meal marks its round hungry (`economy.hungry`, saved as `EconomyState.round` and
      `missed`); the first meal of the next round starts clean; an emptied larder (DEV `starve`) is hunger at once.
- [x] Rain: `VillageSimInputs.rain01`; at 0.3 everyone but the priests goes home, and stays until it falls below
      0.15 (the memory is the villager's own activity, so nothing extra is saved). It also feeds the forest's
      regrowth boost. DEV: `__pantheonVillage.setRain(r)`, a dev panel button.
- [x] Mourning: with a grave and a plot, priests walk to the plot at dusk (`mournSpot`), stand 60 s in the pray
      pose and go home; with no grave they pray as before. Idlers: `plazaSpot` (24 m around the temple).
- [x] Overview: "Eating", "At home", "Mourning". Dev panel: meals served and missed, eating, at home, mourning.
- [x] Save: `Villagers.done` and the economy's record of the meals, version 9.

**Deviations.** (1) **A packed meal for the far-off:** a villager more than 60 m from their door eats where they
stand. The plan had everyone going home for the meal. Measured on the converted island-mountain hamlet: with
every meal at home the farmers' fields (135 m out) cost them half their working day, the village stalled at 24 people
and two fields and starved from hour 2.5 (baseline: 47 people, four fields, fed); with the 60 m rule the growth is
the same as before M7 (46 people, four fields at 3.5 h). Those who live near their work still go home
at midday. (2) A meal takes 10 to 16 s at the table (the question list said "1 to 2 game minutes", but a game
minute is 1.25 s, too short to see). (3) A homeless villager is rare: homes are handed out with the temple taking
the overflow, so "without a home" only happens when the home building is gone.

Results: `npm run check:village-routine` (about 10 s, in `check:fast`): the pure timetable (meals, rain, dusk, vigil),
a day of two meals each with the food leaving at the table, an empty or short larder, a villager without a home on
the plaza, a packed meal, rain with its hysteresis, mourning (about 60 s at the plot, then home), idlers on the
plaza and home at dusk, determinism, and a save in the middle of a meal. `check:save-village` adds a scenario with rain,
a burial and mourning across three save points. `check:village-economy` and `check:village-hunger` were rebased on
meals. The smoke prints the day by hour: at night 100% asleep, in the morning about 75 to 90% at work,
14 to 17% at the midday meal, 16 to 23% at the evening meal, and a few percent at home from 16 h (the idlers); it fails when nobody
goes to a meal, nobody works in the morning or the village is awake at night. In headless Chromium: at midday the
village sat down to eat (11 eating, one portion each off the larder), rain at 0.6 sent all ten non-priests home and
dry weather brought them out, and a save taken with nine people at the table loaded with nine at the table, no
console errors. New sandbox fingerprints: island-mountain `52d68c8fcf8c`, dala (280,540) `a6a77ad454f2`, stress
`c2529b245f08`.

Balance as measured: hunger changed character. With meals all or nothing, a round of meals is fed only when the
larder covers everyone at the table, so **a village now holds at about what it makes** (8 of 11 at a fifth of
the normal field yield and half the fish, after a dip to 5), not at a third of it as with continuous eating; the
normal village is unaffected (it makes far more than it eats). The hunger clock still starts at the first
hungry round after the larder runs dry and stays on until a whole round is served. M4's growth is unchanged
after the packed-meal rule.

Limits: nothing seen on a live GPU (people walking to the table, the plaza strolls, the priests at the graves, the
walk home in the rain); the real rain arrives with M8; a priest whose mourning runs past the evening meal window
can miss that meal; farmers far from home never see the inside of their house at midday; the numbers (windows,
10 to 16 s, 60 s, 24 m, 60 m) are first guesses.

### M8: Rain from clouds (size L, in two parts: M8 the weather, M8b how it looks)

Status: done 2026-10-20 (M8 the weather and what it does to the sim; M8b how it looks).

The spike (a throwaway script, deleted after M8) came first and overturned the plan to derive rain
from the visible clusters. On island-mountain (3200 m field, wind 5.2 m/s, 327 clusters, none wider than 320 m,
median 121 m) the village sits under some cluster 14.7% of the time, but each pass lasts about 45 s (longest 59 s),
about six a day; none is 400 m wide. The field wraps every 3200 / 5.2 = 615 s, so the same clouds pass over the same spots
every ten minutes and natural cluster passes can never vary from day to day. Dala, island-test and volcanic have no
`clouds` block and use the default 480 m deck, whose clusters are at most 61 m wide.

Decisions (confirmed 2026-10-20: **storm fronts**, local rain per position, defaults for the rest; the answer on
"a front lasts 6 to 12 minutes" corrects the question list, which said 10 to 20 for 20 to 40% of a day): about one
game day in three a **front** crosses the map, a disc of rain with a soft rim; **rain is local** (the village feels the
rain where it stands, the camera feels its own); no weather in Phase 0; fields grow 1.5x at full rain; wet ground
dries over half a game day; the hooks for the M9 powers are built now; the weather is two commits (M8 then M8b).

- [x] Spike: the numbers above, before any visuals.
- [x] `src/world/weather/weather.ts` (pure, in `world/` rather than `rendering/` so it runs in node): `createWeather`,
      `rainAt(x, z, clockS)`, `frontsAt`, `frontOfDay`, `addFront` and `clearSkies` (the M9 hooks), `stepWetness`.
      The rim of the front is the ramp (225 m at 2.5 m/s is 90 s), so no separate `stepWeather` with hysteresis is needed.
- [x] Save: **nothing new**. The weather is a pure function of `clocks.elapsed` (already in the save) and the map's
      seed, so a loaded game continues the same sky and `rain01` is recomputed. Called fronts and cleared skies are saved
      with the M9 powers (`ProfileState.powers`).
- [x] Sim effects: the village's `rain01` comes from the weather at the village (M7's shelter and M6's regrowth already
      read it); fields grow `FIELDS.RAIN_BOOST` 0.5 faster at full rain.
- [x] DEV: `__pantheonWeather` (read the rain anywhere, list the coming fronts, call a storm, part the clouds), the
      village's `setRain(r | null)`, a dev panel button and rain readout.
- [x] M8b: `src/rendering/weather/`: `weatherView` reads the weather at the camera each frame (rain, overcast, wet ground);
      `rainStreaks` (3500 shader-animated sprite streaks in a box that follows the camera, `castShadow` off); the sun,
      ambient and day factor dim under overcast (`lightingCurves`), the clouds go grey and thick (`cloudColorTsl`); wet ground is one
      uniform, `applyWetLookTsl`, at the end of the terrain, map-prop and grass shading.

**Deviations (M8b).** (1) The dark storm deck of extra cloud clusters inside the front was not built: it needs a second cloud
field that drifts at the storm's speed, in the one part of the renderer I cannot see here; instead the existing clouds
go grey and thicker as the sky closes in (`overcastAt`, 200 s ahead of the rain), so the sky is dark where it rains
but the clouds are the usual ones. (2) The rain streaks stay on the main layer with `castShadow` off, which keeps them out
of the shadow passes (the cameras of those passes only draw casters); the water reflector draws layer 2 only, so no
rain in reflections. (3) Wet ground darkens and enriches; there is no wet specular.

Results so far: `npm run check:weather` (about 2 s, in `check:fast`): the hash, purity (the same clock gives the same sky,
in any order, and another map's seed another one), a calm first day, 33% of days with a front (within 5%), every front
reaching the village with at least 0.75 whatever its path, rain over 0.3 at the village lasting a median of 10 minutes
(5 to 17) with a ramp of about 60 s from 10% to 90% and no jump above 0.02 a second, locality (dry 3 km to the side
while it pours on the village; the front reaches a place ahead of it later), the hooks, wet ground soaking in 90 s and drying in
900 s. `check:village-routine` checks the field boost. In headless Chromium (island-mountain): the schedule lists 8 fronts in
30 days, a new game is dry, a storm called over the village does nothing in Phase 0 and in the revealed world takes the
village indoors (10 sheltering), dry 4 km away, clear skies end it and everyone comes out, a forced village rain overrides
the weather and `null` gives it back, no console errors.

M8b in headless Chromium (island-mountain): a forced rain of 0.9 gave rain 0.9, overcast 0.9 and a ground that starts to soak,
clearing it gave 0 and 0 and a damp ground, no console errors or shader messages while the streaks and the wet look were
on screen. Frame rate on the software GPU (not a measure of a real one): 31 fps clear, 23 fps in rain with the streaks (the
first rainy frames also compile the streak pipeline).

Limits: **nothing was seen on a live GPU** (the software GPU here is lost about 30 s after boot and canvas readback loses it at once, so the
streaks, the grey sky, the clouds and the wet look are unseen, and so is the cost of the streaks and the extra shader
instructions on a real GPU); the numbers (3500 streaks, the dimming shares, 0.22 darken) are first guesses; the village's villagers and
dressing are not wet-looking; the storm cloud deck is missing.

### M9: Arch II: village upgrades and builder powers (size M, last)

Status: done 2026-10-20. Arch II of the skill tree, The Village, with its fourteen nodes and the five builder powers
cast from the orb cursor in the overview.

Decisions (confirmed 2026-10-20: all defaults except **Downpour as the second Land keystone** (rain doubles what it adds to the
growth of fields and trees, instead of Stormcaller), **no forecast chip for Rain-reader** and **one commit**): arch II
opens in a converted village at 150 faith earned with 3 sparks; the nodes of the layout table; sparks per node 2 to 3,
keystones 4, Devotion 3; the powers go on the same bar, armed and then clicked, paid in faith on cast; the node numbers of the
question list; the sim reads the shared modifier record through an option; arch II unlocks, cooldowns, blessings and called
storms are saved (save version 10, no migration).

- [x] Opening: `syncVillageTree` (pure) and `skills:villageOpened`, polled by `initGameplay`; sparks for each milestone of faith earned
      beyond the threshold, counted in `SkillsState.faithSparks` so none is paid twice.
- [x] The nodes (`SKILL_NODES`, arch `village`) and the exclusive keystones (`SkillNode.excludes`, the refusal `excluded`); the skill
      panel shows The Village next to The Void (two tab buttons; the second is disabled until it opens).
- [x] Modifier changes in the sim: beds, wood per tree, wheat per harvest, store caps, builder rate, building cap, hunger grace, regrowth
      wait, fish, death faith cost, Evergreen, Rain-reader and Downpour, and Devotion's energy (per believer, and the temple
      as a regeneration point).
- [x] Builder powers with the orb cursor: Blessing, Kindle, Provide, Call rain, Clear skies (`builderPowers.ts`, `overviewPowers.ts`).
- [x] Save slice: arch II unlocks (`SkillsState`), cooldowns and the called storms and cleared skies (`ProfileState.powers`), blessings
      (`VillageSimState.blessings`).

**Deviations.** (1) **Rain-reader** has no forecast chip (the answer to question 10): it adds 0.15 to what rain does to growth,
a small stat so that the node is worth taking. (2) The powers **come with arch II** and need no node of their own (the layout table
lists them apart from the nodes); their cost is the faith. (3) The sim reads the live record (`createVillageSim({ modifiers })`,
default the game's shared one) rather than receiving each number: `bedsOf`, `housingOf`, `capsOf`, the forest, the economy, the agents
and the hunger rules take the few numbers they need. (4) **Spark milestone 300 faith, not 100** (balance pass, below).

Results: `npm run check:skills` (arch II's data and costs: 32 sparks with one keystone of each pair; closed until opened; opening at the
threshold, once, with milestone sparks; exclusion and respec; every node's modifier; parsing), `npm run check:village-upgrades` (about 20 s: each
node's effect in a running village: +1 bed per house, stores +40, +1 wood per tree with the same chop time, stumps waiting 2 days instead of 3,
Evergreen sapling at once in rain and not in a drizzle, rain adding 0.5 / 0.65 / 1 / 1.3 to field growth, +1 per harvest, fish x1.5, builders
x1.25 (measured 1.1 to 1.4 of the work), the building cap x1.4, grace x3 (weak on day 6 instead of 2), a death costing half;
blessings, Kindle, Provide, blessings in a save), `npm run check:powers-builder` (what the cursor aims at, the faith and cooldown rules, a miss
costing nothing, Call rain and Clear skies in the weather, cooldowns and storms in a save), `check:energy` (Devotion). `check:save-village` saves
blessings and a kindled site across two save points. In headless Chromium (island-mountain): with the village converted and 300 faith
earned arch II opened by itself with a toast; the panel showed both tabs and the fourteen nodes; Wider beds raised the village's beds from
13 to 16; Town shut out Lean winters; the overview showed the five powers with their costs; a key armed Blessing with its hint and Esc
put it away without leaving the overview; Call rain from a click on the village cost 41.8 faith (40, plus income), made a front at the cursor
and started a 15-minute cooldown; a save and a reload kept the front, the cooldown (897 s), arch II and the keystone; no console errors.

Balance as measured (hamlet, island-mountain, converted): faith earned is **1,000 per game hour with the orb away and 3,900 with it
near, growing with the village**; the stock is never short of the power costs (15 to 40), which are 50 to 130 seconds of income. So **the cooldowns, not
the faith, limit the powers**, and the faith that piles up is what the sparks are funded from: arch II opens 11 minutes after the conversion
with the orb away (3 with it near), and at one spark per 300 faith earned the whole tree (32 sparks) takes about 3 to 4 hours without
the orb and about an hour and a half with it. One spark per 100 (the first number) gave it all in 1 hour and 20 minutes.

Limits: the cursor powers were exercised with the real mouse in headless Chromium but nothing was seen on a live GPU (the target ring is the
overview's hover ring, which was not seen drawn; a storm called over the village is seen only as the rain of M8b); Blessing has no visible effect on the thing
blessed (no glow); Kindle finishes a stage with no animation of its own; the power costs are small against the faith that piles up, and
faith has no other large sink yet; a respec is still free; Rain-reader has no forecast.

---

## Not in scope

Hauling visuals (carrying logs and sacks to the store), modelled stump, log and grave assets, audio,
seasons, cloud saves or accounts, new building types beyond granary and workshop, a selectable-villager
panel, the Deity phase and beyond (Verath's incursion, Smite, morality axis effects).

## Open checks (answered during the work, not blockers)

Ticked items are answered; the others are still open.

- [ ] The story (deferred by the user until the core concepts are solid): what happens when the elder is met,
  and which help tasks make up the conversion quest.
- [x] Orb respawn and regeneration numbers (interval, cap of live orbs, rates, shrine radius): the first
  numbers stand (2026-10-18, user agreed); they live in `PHASE0.RESPAWN` and `PHASE0.SHRINE` and are tunable
  after playing.
- [ ] The quest numbers (5 converts, the fire and offering steps) are first numbers, tunable in `PHASE0.QUEST`; the hamlet's size (`VILLAGE.HAMLET`) too; the 60% rule is gone.
- [x] The shrine entity's name and fields: `shrine { x, z, radiusM?, regenPerSec? }`, several allowed; the
  first sits at the player's starting point (M1c).
- [ ] UI details still open: the final look of the save screens, the skill tree panel, the ability bar and
  the radial menu (all quiet first passes for the user to refine). Settled: `E` saves at the temple, Esc is
  the pause menu, `T` opens the tree (the world pauses), no gamepad.
- [x] Spark sources and the faith threshold that opens arch II: 2 sparks at the tree's opening, sparks for converts and the quest, and arch II opens at `ARCH_II.OPEN_FAITH_EARNED` with milestone sparks (M9).
- [x] Casting input in roam and how the ability bar sits with the HUD: a radial menu on `Q` (hold, point with
  the mouse, release), the bar at the bottom right (M1b).
- [x] Whether the orb's visuals can be detached from the player controller: yes, `setVisualOverride` (M3 spike).
- [x] Save: both M0 spikes are answered. `alea` can export and import its state; replaying path laying does
  not reproduce the roads, so the network and the wear grid are saved.
- [x] How much faith a death costs, and whether Gravekeeper should reduce it: `HUNGER.DEATH_FAITH_COST`, and yes, Gravekeeper halves it (M5, M9).
- [x] Tree species, sizes and a sensible yield table (M6: `FOREST.YIELD`, by prop key, times scale).
- [x] Whether big clouds sit over the village often enough for rain: no (about 45 s showers); storm fronts as a function of the game clock instead (M8).
- [ ] Whether the stale AO and grass patch under felled trees is visible enough to fix (M6 built it; needs a look on a live GPU).
- [x] Whether pool swap-remove is safe or an `alive` flag is needed: swap-remove, with the `moved` index in `villagerDied` (M5).
- [ ] island-mountain has 6 orbs (about 33 energy) so the cap cannot be reached by play until about 20 more
  are placed in the editor (found 2026-10-18; the user will add them).

## Working rules

See `AGENTS.md` and `CLAUDE.md` (GitNexus impact analysis before edits, no commits unless asked, the dev
server is run by the user).
