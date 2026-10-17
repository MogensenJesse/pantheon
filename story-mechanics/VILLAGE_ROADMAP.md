# Pantheon: Village Roadmap

Status: drafted 2026-10-15, revised the same day after the user's decisions, game-arc description and
answers on energy, the hamlet and the elder.
Nothing below is implemented yet; tick the boxes as milestones land. Items marked "proposed" are my
suggestions and are not confirmed.

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
| 1. God Particle | 0 | Roam (orb) | Game start | Energy reaches the cap (100). Today this also triggers the sunrise reveal and sets `state.phase = 1` |
| 2. Whisper | 1 | Roam (orb) | The skill tree opens with its first sparks and basic powers; the story leads the orb to the village elder, and that meeting starts the conversion quest | The conversion quest is complete and the village is converted |
| 3. Builder | 2 (Spirit) | Roam plus overview, orb as cursor | `villageConverted` | Later phases (Deity and beyond) are out of scope here |

In act 3, enough faith earned unlocks the second arch of the tree (village upgrades and builder powers).

Act 2 in detail (confirmed): before conversion the village is a finished **hamlet** (temple, about 3
houses, a field, the well, about 8 villagers; the size is my first guess and tunable) that lives its
routines but does not grow, has no faith income and builds nothing. Meeting the elder is woven into the
story and starts the quest to convert the village, which the player completes with powers and by helping
the village and the elder (see Quests). Conversion starts everything: faith income from believers, growth,
the economy. Today's behaviour (growth from phase 1 by orb presence alone) stays available as a DEV
sandbox switch so testing keeps working.

---

## What exists today

- The sim is pure and node-runnable: `src/world/village/sim/` (`villageSim.ts` orchestrates, `population.ts`
  roles, beds and newcomers, `support.ts` fields and well, `agents.ts` behaviour, `agentTargets.ts` claims,
  `routine.ts` schedule, `workSpots.ts` tree and shore spots, `construction.ts` stages). Tunables live in
  `src/config/village.ts` (`VILLAGE`). The headless gate is `npm run village:check`
  (`scripts/village/sim-smoke.ts` prints the fingerprints).
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
- Orbs are fixed slots from `orb` map entities (`src/entities/energyOrb/orbSystem.ts`); an absorbed orb
  stays gone. Map entities are a union in `src/map/MapTypes.ts` (`prop`, `playerStart`, `orb`,
  `villageSeed`); a new marker type touches the editor palette, preview meshes, gizmo rules and the entity
  spawner, and the `villageSeed` change is the pattern to follow.
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
- There is no persistence: everything is session-only. The village RNG streams are `alea` generators
  (`sim/villageRng.ts`). Browser storage is only used for the chosen map (`sessionStorage`) and DEV flags.
- Story documents describe standing stones, landmarks, a fog of war, an elder (Caros) and a shepherd (Aera).
  I found no code for any of them (only the story text in `src/ui/StoryLog.ts`).

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

## Currencies (proposed)

| Currency | Source | Used for |
|---|---|---|
| Energy | Residue orbs (they respawn once the tree has opened), shrines, skills, later believers | Casting arch I powers, like mana. Cap 100, `Surge` adds 60 |
| Faith | Believers (and orb presence), after conversion | Building sites, newcomers, arch II powers, respec; lost when villagers die |
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

## Active abilities (proposed)

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

## Belief and conversion (proposed)

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

## Skill tree layout (proposed)

- **Arch I, The Void** (opens at the energy cap, funded by sparks): the passive nodes and the three
  conversion powers above. `Remembrance` (reveal explored areas) waits until a fog of war exists.
- **Arch II, The Village** (opens in act 3 when faith earned passes a threshold; needs `villageConverted`):
  village upgrades in two branches, plus the builder powers above. One keystone per branch, two exclusive
  choices, adjacency unlock as in Cookie Clicker's ascension tree.

| Branch (arch II) | Nodes | Keystone choice |
|---|---|---|
| Hearth (village) | Wider beds (+1 per house), Sharp axes (+wood per tree), Good soil (+wheat), Granary (food lasts longer), Quick hands (faster builders) | Town (higher building cap) or Lean winters (3x starvation grace) |
| Land (nature) | Seedkeeper (faster regrowth), Rain-reader (forecast icon), Tide-caller (more fish), Gravekeeper (deaths cost less faith) | Evergreen (trees regrow fully in rain) or a second choice still to design |

Because there are no resets, costs need a long curve that suits one continuous game, not a prestige loop.

## UI (proposed)

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
| Cast feedback (target ring on a villager or house), belief indicator on villagers, converts counter | Act 2 | M2 |
| Objective line and journal | From the elder's meeting | M2b |
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

Status: done on branch `ui-foundation` (2026-10-15), not committed yet. A shared UI kit so every later screen
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
`npm run ui:check` covers the pure rules. Checked in the browser: panel open and close, Esc, backdrop click,
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
  `{ version, savedAt, playSeconds, mapId, summary, profile, village }`. `summary` (day count, population,
  a small thumbnail) feeds the load list. A snapshot that is corrupt, from a newer version or from another
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
      save:check` covers the rules and the service on a memory store; the IndexedDB store was run in
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
      so a save cannot hold claims that disagree with the pool. `npm run save:village` is the sim-smoke
      round trip: a straight run and a run saved midway (through `structuredClone`) and restored must end
      in identical state with identical events, on island-mountain and on dala with trees and shore, at 1
      minute, 1 h and 3 h; I checked that it fails when any of eight parts of the restore is left out, and
      the `village:smoke` fingerprints are unchanged. Not saved (belongs to later items): the orb system's
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
- Headless: `npm run save:check` (rules, service, profile, autosaver, boot), `npm run save:village` (a
  village run straight on equals one saved midway and restored, on two maps, plus the compatibility
  checks against a real village) and unchanged `village:smoke` fingerprints.
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

Still to do for every later milestone: add its slice to the save and extend `npm run save:village` in the
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
- [ ] Thumbnails: dropped for now (`summary.thumbnail` stays null).

Verified (2026-10-17): headless `npm run save:check` (launch rules, slot lists and times, pause rules,
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
      requires, ranks, effects), unlock, spend, respec (free until faith exists), parsing for saves.
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
- [x] DEV hook `window.__pantheonSkills`; `npm run skills:check` (24 pure checks).

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
      `npm run skills:check` (they are not UI-kit rules).

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
- [x] `npm run energy:check` (26 pure checks), DEV hook `window.__pantheonOrbs`.

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

### M2: Hamlet, belief and the conversion powers (size L)

Status: todo. The "Whisper" act, first half; the elder and the quest come in M2b.

- [ ] Hamlet start: at founding the sim seats a finished hamlet (reuse `startSiteNow` and
      `completeOpenSites`, which the DEV helpers already use) and freezes growth, newcomers and faith income
      until `villageConverted`. A DEV sandbox switch keeps today's behaviour.
- [ ] `belief` per villager in the pool (`model/types.ts`, `villagerPool.ts`); the elder is the first priest;
      converts counter; event `villagerConverted`.
- [ ] Powers: Murmur, Dream and Sign as abilities (M1). They find villagers with a loop over the pool
      (at most 200); villagers react (pause and face the orb, existing poses only). Dream needs sleeping
      villagers, which the existing routine already provides at night.
- [ ] `faith.ts`: income from believers instead of the flat base rate; `crownOrb.ts` brightness follows belief.
- [ ] Provisional conversion rule (the elder plus 60% believers emits `villageConverted`), replaced by the
      quest chain in M2b. Phase handoff: `state.phase = 2` at `villageConverted`; the village's growth gate
      and `VillageHud.ts` read it.
- [ ] Sparks awarded per convert and at conversion.
- [ ] UI: a target ring on the villager or house a power would affect, a subtle belief indicator on villagers
      near the orb, and a converts counter (see UI).
- [ ] Save slice: belief, elder id, converts, phase.

Verify: smoke scenario with scripted casts converts villagers and, under the provisional rule, the village,
and growth starts only afterwards; the frozen hamlet grows nothing before then; fingerprints; in the
browser, the powers read clearly (villagers visibly notice) and the temple beam tracks belief.

### M2b: The elder, story beats and quests (size L)

Status: todo. The story weave: the orb meets the elder, and that meeting starts the quest to convert the
village. The story content and the help tasks are deferred: build the framework and a placeholder chain
first, then write the story once the core systems stand.

- [ ] `src/quests/` (pure data and rules): a quest has steps; each step has text, a condition and effects
      (sparks, unlock a node, start a story beat). Conditions read the bus and the sim: villagers converted,
      `orb:absorbed`, energy thresholds, `elderMet`, later stock levels. The state is serialisable (current
      step, done flags).
- [ ] Story beats: data (id, trigger, text), shown through the existing queue in `src/ui/StoryLog.ts`.
- [ ] The elder: a named villager (Caros in the story documents), the first priest. Priests already pray at
      dawn and dusk, so the meeting happens at the temple: when the orb comes within range during a prayer,
      `elderMet` fires, a story beat plays (he alone perceives the orb, in line with the Whisper phase) and
      the quest begins.
- [ ] Objective UI: one current-objective line in the style of the story log, plus a journal panel (a key)
      with finished steps and story fragments.
- [ ] The conversion quest chain from the Quests section: meet the elder; convert N villagers; a few help
      tasks (to choose with the user); the elder believes. The last step emits `villageConverted`
      (`state.phase = 2`, growth unfreezes, faith income and the builder phase start); the provisional
      rule from M2 is removed.
- [ ] Save slice: quest state, story beats seen, `elderMet`.

Verify: pure tests of step progression (conditions, order, no double reward); the smoke runs the scripted
chain to `villageConverted`; a save made mid-quest resumes at the same step; in the browser the meeting
triggers once and the objective line updates.

### M3: Builder phase: overview camera, orb cursor, info icons (size L)

Status: todo. Opens when the village is converted.

- [ ] `CameraRig.ts`: an overview mode the camera transitions into (pitch 50 to 60 degrees, free pan, zoom,
      rotate, clamped to the village radius plus a margin, cursor visible, smooth 0.8 s transition). Toggled
      by a key near the temple door (new binding in `src/core/InputManager.ts`); the roam view and its
      controls stay as they are, and the sim keeps running.
- [ ] Orb as cursor: the pointer is raycast onto terrain, buildings, fields and villagers; the orb hovers at
      the hit point with a smoothed float and bob. The roam orb is hidden while the cursor is shown, and on
      exit it lands where the cursor was and the camera swings behind it. Spike first: whether the orb's
      visuals (`src/entities/PlayerVisuals.ts`) can be positioned independently of the player controller.
- [ ] Click handling: select a house or site (info), cast the selected arch II power on a target.
- [ ] `src/ui/VillageOverlay.ts` (DOM, pooled elements projected to the screen each frame, overview only):
      bed pips per house, wood and food chips, no-wood and hunger warnings. One inline-SVG icon set shared
      with a resource bar.
- [ ] Optional later: a residents panel for a clicked house.

Verify: toggle in and out repeatedly (no stuck pointer lock, no orb input leaking through), the cursor orb
tracks the mouse over terrain and buildings, icons track buildings while panning, frame time with 60
buildings, narrow-window layout.

### M4: Stockpiles, production, wood-gated building, housing pressure (size M)

Status: todo. Wood and food exist, the right roles make them, and wood plus bed pressure decide when houses start.

- [ ] `sim/economy.ts` (pure): `Stock { wood, food }`, caps from granaries and workshops, `add`, `spend`, `canAfford`.
- [ ] `ECONOMY` block in `src/config/village.ts`: day length (mirror of `sky.ts`, with a comment), food per
      person per day, field yield per harvest, fish per catch and catch interval, wood per chop (flat until
      M6), wood cost per building type, storage caps, pressure threshold, active-site cap by pressure.
- [ ] `villageSim.ts`: create the economy; add food at the harvest reset; `startSite` requires wood and
      pressure (free beds, counting beds under construction, below about 15%); raise the active-site cap
      with pressure (today `PLAN.MAX_ACTIVE_SITES` is 3); daily food use from `dt`; `stats()`; DEV
      `addWood` and `addFood`.
- [ ] `agents.ts`, `model/types.ts`, `villagerPool.ts`: a per-villager work accumulator; woodcutters and
      fishermen emit `onProduce(role, amount)` from `act()` (same pattern as `onWork`).
- [ ] `population.ts`: newcomers also need a day of food in stock.
- [ ] Village modifiers (from M1) read here: `bedBonus`, `woodPerTree`, builder rate and so on.
- [ ] HUD: wood and food in the faint line of `src/ui/VillageHud.ts`; DEV panel
      (`src/dev/panel/devPanelVillage.ts`) and probe (`src/dev/runtime/villageProbe.ts`).
- [ ] Save slice: the stock; round-trip assert.

Verify: `npx tsc --noEmit`; `npx biome check` on the changed files only; `npm run village:check` with new
smoke asserts (food never below zero in the baseline; houses started at most wood spent / cost; a
wood-starved scenario stalls growth and `addWood` restarts it; determinism flag true); record the new
fingerprints in `AGENTS.md`.

### M5: Hunger, death, graves and the graveyard (size M, riskiest sim piece)

Status: todo.

- [ ] Food at zero for `STARVE_GRACE_DAYS` (2 to start): villagers turn weak (slower, no work). After
      `DEATH_AFTER_S` of weakness one dies, then another per interval while food stays at zero (idlers
      first, priests last), so the village dwindles instead of collapsing at once. Newcomers stop while
      food is below a day's worth.
- [ ] Death presentation: a new `Anim.Collapse` (an addition, existing ids unchanged), then the body fades.
      Event `villagerDied`; the bed frees; HUD hunger warning.
- [ ] Each death costs faith (`DEATH_FAITH_COST`, floored at zero so it cannot soft-lock).
- [ ] Graveyard: `planGraveyard` modelled on `planWell` and `planField` in `sim/planner.ts`, reserved at
      founding like `reserveWell`. Rules: flat enough, walkable from the temple, beyond the outer ring and off
      the main road, a good distance from houses and fields, on a side few paths use. A grid of plots filled
      in order, extended when full.
- [ ] A grave appears in the next free plot when a villager dies: a mound and headstone, instanced
      (`dressingKit.ts` placeholder first; a modelled version later).
- [ ] Pool removal. `agentTargets.ts` keys claims by villager index, so a swap-remove must re-key the moved
      villager's slot, field and tree claims. Spike this first (read `agentTargets.ts`, and how the villager
      renderer uses `pool.count` and the `prev*` arrays); fall back to an `alive` flag with compaction.
- [ ] `population.ts`: the residents map decrements.
- [ ] Save slice: weakness timers, graves; round-trip assert.

Verify: a smoke scenario with farmers disabled shows the population falling to what the food supports and
then holding; graves equal deaths; faith never below zero; assert that no claims are left on removed
villagers; fingerprints.

### M6: Trees fall, give limited wood, regrow (size L)

Status: todo.

- [ ] `sim/forest.ts` (pure): tree registry (id, x, z, key, scale, state Standing / Felled / Stump / Sapling
      with growth); yield from a `FOREST.YIELD[key]` table scaled by tree size (check the species list in
      `ASSET_MANIFEST.trees` first); chop hits per tree. `workSpots.trees` carries the tree id, `claimTree`
      skips non-standing trees, and wood is added when the last hit lands (replacing the flat M4 rate).
- [ ] `render/forestView.ts` (modelled on `terraformView.ts`): map each tree to its static group and index
      by position once at init. On `treeFelled`: set `placements[i].scale = 0` and its matrix, set
      `group.dirty = true` (no edits to `updatePropLod` or `resnapMapProps`); play a 2 to 3 s fall with a
      temporary `DynamicPropBatch` instance of that tree key (rotate about the base, ease in, small
      bounce), then remove it. Stump: a placeholder cylinder in
      `src/world/village/assets/placeholder/dressingKit.ts` (a modelled stump comes later).
- [ ] Regrowth: after `REGROW_S` a sapling at the stump grows from 0.1 to 1 over game days, using a dynamic
      instance updated at about 4 Hz (like the terraform flush), then the static group gets its scale back.
      Rain multiplier from a `rain01` input (0 until M8). Skip spots that are now occupied (site grid) and
      cap the number of saplings.
- [ ] Shadows: reuse the shadow-dirty call `terraformView` makes after levelling.
- [ ] Save slice: the state and growth of every tree that is not standing; on load it is applied before the
      first draw so felled trees never flash back.
- [ ] DEV: `__pantheonVillage.fell(n)` to fell the nearest trees on demand.

Known limitation: prop contact AO and the grass exclusion map are baked from the original props, so a
felled tree leaves a dark patch. Decide after seeing it whether re-baking is worth it.

Verify: smoke asserts (felled never exceeds the registry; regrowth only on stumps; no tree both felled and
standing; round trip); in the browser pane: fall animation, LOD swap while a tree falls, shadows, no tree
reappearing after the village levels nearby ground; measure frame time, because the dynamic batches add draws.

### M7: Daily routines per role (size M, can run next to M6)

Status: todo.

- [ ] `routine.ts`: a per-role schedule table in config (phase windows): farmers from dawn, fishermen at
      dawn and dusk, builders by the site queue, priests at the temple, idlers on the plaza.
- [ ] New activities `Eat` (a meal at home at midday and in the evening; this is also where daily food is
      deducted, with a continuous fallback for villagers without a home), `Shelter` (`rain01` above a
      threshold sends non-priests home) and `Mourn` (priests visit the graveyard at dusk).
- [ ] `agents.ts` (`begin` and `arrive`) handle the new activities; `Activity` in `model/types.ts` gains
      values. Villagers already vanish indoors (`pool.indoors`), so no new rendering is needed, and the
      existing poses (idle, walk, carry, chop, hoe, fish, pray) are enough.

Verify: the smoke prints activity counts by hour; fingerprints; in the pane, people go home for meals.

### M8: Rain from clouds (size L)

Status: todo.

- [ ] Spike first (pure script, no visuals): sample the cloud field and the drift and wrap maths from
      `cloudWindInstances.ts` over one game day and report how often the village sits under a cluster above
      an extent and density threshold. That decides between a threshold on the existing big clusters and
      marking a few clusters as storm clouds at generation.
- [ ] `src/rendering/weather/`: pure `sampleOverheadMass`, and `stepWeather(dt)` with hysteresis and a 60 to
      120 s ramp that produces `rain01` and a slow `wetness01`; the village reads them as inputs.
- [ ] Visuals: instanced rain streaks in a camera-following box on its own layer (kept out of the shadow
      cameras); darker, greyer light and cloud tint through the existing TOD and `cloudColorTsl.ts`
      uniforms; wet ground as one uniform on terrain, prop and grass shading (no new textures).
- [ ] Sim effects: crop growth and tree regrowth multipliers, shelter (M7).
- [ ] Hook for the Call rain and Clear skies powers (M9): a forced storm target the weather steps toward.
- [ ] Save slice: the weather clock (cloud wind time is already in the day-cycle and cloud clock of M0), so a
      loaded game continues the same sky; `rain01` itself is recomputed.
- [ ] DEV: force-rain slider and `__pantheonWeather`.

Verify: the spike's numbers before any visuals; browser-pane frame time with and without rain; no new
shader errors in the console; no rain layer leaking into shadow passes.

### M9: Arch II: village upgrades and builder powers (size M, last)

Status: todo. Balance only after the M4 to M8 numbers exist.

- [ ] Arch II opens when faith earned passes a threshold (tunable) in act 3; panel from M1b gets the second arch.
- [ ] Hearth and Land nodes from the layout table, as modifier changes (beds, wood per tree, wheat yield,
      builder rate, storage caps, regrowth, hunger grace, death faith cost), plus the Devotion node (energy
      per believer, the temple as a regeneration point).
- [ ] Builder powers with the orb cursor: Blessing, Kindle, Provide, Call rain and Clear skies (needs M8).
- [ ] Save slice: arch II unlocks and cooldowns that should survive a save.

Verify: pure tests for the new nodes; a smoke run with nodes applied shows the intended modifier effects; the
powers work from the cursor and spend faith; balance pass against the economy numbers.

---

## Not in scope

Hauling visuals (carrying logs and sacks to the store), modelled stump, log and grave assets, audio,
seasons, cloud saves or accounts, new building types beyond granary and workshop, a selectable-villager
panel, the Deity phase and beyond (Verath's incursion, Smite, morality axis effects).

## Open checks (answered during the work, not blockers)

- The story (deferred by the user until the core concepts are solid): what happens when the elder is met,
  and which help tasks make up the conversion quest.
- Orb respawn and regeneration numbers (interval, cap of live orbs, rates, shrine radius) are my first guesses.
- Hamlet size and the conversion thresholds (60% believers, N converts) are my first numbers.
- The shrine entity's name and fields (the first one sits at the player's starting point).
- UI details still open: the look of the tree panel and the final look of the save screens. Settled: `E`
  saves at the temple, Esc is the pause menu, no gamepad.
- Spark sources and the faith threshold that opens arch II.
- Casting input in roam (number keys? a radial menu?) and how the ability bar sits with the existing HUD.
- Whether the orb's visuals can be detached from the player controller (M3 spike).
- Save: both M0 spikes are answered. `alea` can export and import its state; replaying path laying does
  not reproduce the roads, so the network and the wear grid are saved.
- How much faith a death costs, and whether Gravekeeper should reduce it.
- Tree species, sizes and a sensible yield table (first thing in M6).
- Whether big clouds sit over the village often enough for rain (M8 spike).
- Whether the stale AO and grass patch under felled trees is visible enough to fix (M6).
- Whether pool swap-remove is safe or an `alive` flag is needed (M5 spike).

## Working rules

See `AGENTS.md` and `CLAUDE.md` (GitNexus impact analysis before edits, no commits unless asked, the dev
server is run by the user).
