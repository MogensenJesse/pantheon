# Phase 0 — your to-do list

What the build needs from you (design: `PHASE_0_LANDMARKS.md`). Tick items off here; stand-ins keep the game running until the real thing arrives.

## 3D models

### Landmarks (5)
Stand-in props are used until these exist. For each: `runestones`, `tree`, `temple_ruin`, `sunken_ruin`, `monolith`.
- [ ] `runestones`
- [ ] `tree`
- [ ] `temple_ruin`
- [ ] `sunken_ruin` (half in water: decide whether the water line is part of the model or the terrain)
- [ ] `monolith`

What I need per model: a glTF `.glb` with the origin at the base and +Y up; a target height in metres (`targetHeightM` in `src/assets/assetManifest.ts`) and rough footprint; a LOD chain (`Name.glb`, `Name_lod1.glb`, `Name_lod2.glb`); textures baked to KTX2 by `npm run bake:play-props`; which parts should glow (a separate emissive material or node, or a mask) so I can drive them from the awakening; a pick/dwell radius if the footprint is unusual. Put them in `public/models/landmarks/` (a new family) and tell me the file names.

### Places of power: the "after" models (5)
The village phase restores each landmark (`PHASE_2_RESTORATION.md`). Each kind needs a second model: the **before** is the landmark above, the **after** is either the restored ruin or the place with a construction built around it. Same format and origin as the landmarks above, tell me the file names and which parts should glow.
- [ ] `tree` after: shrine and fence ring built around the tree
- [ ] `runestones` after: the fallen stones standing again
- [ ] `temple_ruin` after: the temple rebuilt
- [ ] `sunken_ruin` after: the ruin restored, the water pulled back
- [ ] `monolith` after: a ring of vigil fires (or similar) around the stone
- [ ] One shared scaffold prop, shown while a place is being restored
- [ ] A camp model for the builder crew (a hut and fire; placeholder props stand in, `CAMP_PROPS`)
- Build side, once the after models exist (mine, not yours): the code that hides the before model and spawns the after model on restore. Today the restored look is only extra rings of existing props around the before model (`LANDMARK_RESTORE_PROPS` in `src/landmarks/landmarkStandIns.ts`); nothing replaces the before model yet. Also the glow parts of the new models need wiring to the awakening lights.

### Villagers (in progress)
12 figures in `public/models/village-kit/villagers.glb`; the rig contract and pipeline are in `public/models/village-kit/README.md`. A figure missing from the GLB falls back to its placeholder, so you can drop them in one at a time.
- [ ] The painted models and textures
- [ ] Optional later: baked animation clips (idle, walk, hammer, pray, carry, chop, hoe, fish, collapse)

## Story — final text (placeholder text ships until then; it is all in `src/story/fragments.ts`)
- [ ] Five chapters, told in visit order 1 to 5, ending at the village (`LANDMARK_CHAPTER_IDS`: fragments 2, 5, 6, 9, 13)
- [ ] A short caption for each landmark kind (`LANDMARK_CAPTIONS`)
- [ ] A closing line for each place the village restores (`LANDMARK_RESTORED_CAPTIONS`)
- [ ] The "something is unfinished" beat shown when the bar is full but landmarks are left (fragment 17)
- [ ] Read through the placeholder chapters and rewrite what you want different
- [ ] Review the Aethon memory (id 16) and the energy fragments (3, 7, 10, 14)
- [ ] Names: keep or change Merra, Verath, Caros (the elder), Aera (the shepherd)
- [ ] What each landmark means for later phases (shrine-like regeneration, builder boost, quest hook)

## Map (island-mountain)
- [ ] Place the five landmarks in the editor (Markers palette)
- [ ] Add about 20 more orbs in a trail that bends toward the landmarks (order of placement = order of the guide line)
- [ ] Put the last landmark near the village
- [ ] Paint Path cells along the guide route so the line follows them
- [ ] Decide whether dala, island-test and volcanic get landmarks (without them the old energy-only rule applies)
- Placement rules for restoring the places (phase 2): the map needs a `villageSeed`; every landmark must be reachable on foot from it within a 20-minute walk (`ROUTE_WALK_LIMIT_MIN`, about 1.6 km), not behind water or a steep ridge. An unreachable one is refused in play as "no way there", and the editor does not warn. After placing, tell me and I run the reachability check (`npm run check:village-route` covers shipped maps).

## Restoring the places (phase 2)
- [ ] Look at the whole flow on a real GPU, since headless could not render: the restoring ring, the crew camp, the restored ring, and a crew member far from the village (draw distance, shadow). Only the tree has been run through it in a browser.
- [ ] Playtest and tune the placeholder numbers in `src/config/village/restoration.ts` (`START_WOOD`, `SITE_WORK_S`, `CREW`, `RESTORE_FAITH`, `ROUTE_WALK_LIMIT_MIN`) and the hurdle and boon strengths in `src/landmarks/landmarkEffects.ts`
- [ ] Decide the monolith: its hurdle and boon are provisional, and the lower faith income the design lists is not built
- [ ] Decide whether the order of the five places matters (any order works today) and what happens when all five are restored (the Deity phase is not built)

## Village interaction (upgrades, plots, prayers, Hearten, outposts)
Built and working with placeholder props (design: `VILLAGE_INTERACTION.md`; docs in `docs/village/`: `upgrades.md`, `plots.md`, `prayers.md`, `hearten.md`, `outposts.md`). What is left is yours:
- [ ] Look at it on a real GPU, since headless could not render: the plot ring and door dot in the overview, the star over a praying villager and the ✧ over a heartened one, the planks on a building being raised, the outpost camp and finished hut. Play it through: reach ten finished buildings (plots), answer five prayers (Hearten), restore a place (outposts).
- [ ] Playtest and tune the placeholder numbers: `src/config/village/upgrades.ts`, `prayers.ts` (needs, patience, faith paid, how fast the lapsed recover), `hearten.ts`, `outposts.ts` (cost, rates, limit), and the milestone thresholds in `src/skills/milestones.ts`. Watch faith: an over-strong prayer drain can stall growth.
- [ ] Decide which skill nodes carry which milestone gate (today: Great halls needs 20 villagers, Vaults needs the first restored place).
- [ ] Models, optional until you want them (props stand in): a look per upgrade level (2 and 3) for the house, granary and workshop; a lumber camp and a fishing hut (and which other outpost kinds, if any); a glow for a heartened villager and a marker for a praying one.
- [ ] Words: the toast and hint texts are placeholders (`ui/village/villageAlerts.ts`, `ui/overview/overviewPlots.ts`, `overview/overviewDescribe.ts`); the milestone labels in `src/skills/milestones.ts`.
- [ ] Not built, decide if wanted: a "healing" prayer (needs a sickness mechanic), raids, trade, a creature companion (`BACKLOG.md`).

## Quests
- [ ] Read `QUESTS.md`: cut, change or approve the proposed quests and answer its open questions (phase 0 objective, teaching quests, rewards, Caros's favours, the end of Spirit). Write the texts you want for each; the placeholders are mine.

## Look and sound
- [ ] Beacon colour per kind, the feel of dwelling and awakening
- [ ] Review the light effects on a real GPU (I can only build them and check the code here)
- [ ] Optional, not built: a landmark hum, an awakening chime
