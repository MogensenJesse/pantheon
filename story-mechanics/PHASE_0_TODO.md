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

## Animals and ambient life

Built with chunky code-made stand-ins (design and rules: `docs/ambient.md`). Your models replace them one file at a time: drop `public/models/animals/<key>.glb` and the key stops using its stand-in. A missing file is normal.

### Models to make
| Key | Parts (exact node names) | Height | Notes |
|---|---|---|---|
| `sheep` | `body`, `head`, `leg_fl`, `leg_fr`, `leg_bl`, `leg_br`, `tail` | about 0.85 m | grazes: the head dips; legs swing in diagonal pairs |
| `lamb` (optional) | same as `sheep` | about 0.55 m | not used yet and not loaded: no code draws it (a smaller sheep for later) |
| `chicken` (hen) | `body`, `head`, `leg_l`, `leg_r`, `tail`, `wing_l`, `wing_r` | about 0.4 m | the head bobs as it walks and dips to peck; wings open only to run |
| `rooster` (optional) | same as `chicken` | about 0.5 m | not used yet and not loaded: no code draws it |
| `songbird` | `body`, `head`, `tail`, `wing_l`, `wing_r` | about 0.12 m | flocks circling the woods and the great tree; drawn 2.2 times larger so it can be seen at flying height |
| `dove` | same as `songbird` | about 0.26 m | circles the temple ruin; drawn 1.6 times larger |

- [ ] `sheep`
- [ ] `chicken`
- [ ] `songbird`
- [ ] `dove`
- [ ] Optional: `lamb`, `rooster` (tell me when you have them: they need a place in `life.MODEL_HEIGHT_M`, the rigs and something that draws them)

### The contract (rigid parts, no skinning)
The animals are not skinned and have no animation clips (the DEV optimizer rejects skins, morphs and clips): each moving part is its own named node and the game turns it about its joint.
- One glTF `.glb` per key, `public/models/animals/<key>.glb`, textures baked to KTX2 (`npm run bake:play-props` conventions). Optional root node named like the key.
- **One node per part, named exactly as in the table** (Blender's `.001` suffixes are ignored). Each part node's **origin is the joint it turns about**: the shoulder or hip for a leg, the neck for the head, the shoulder for a wing, the root for the tail. Meshes inside the node (or a mesh named for the part) belong to it. A part the rig does not know stays still, so a model with fewer parts still works.
- The whole model stands with its **feet centred on the origin, on y = 0, +Y up, facing +Z**. It is scaled in the game to the height in the table, whatever size you modelled it at; a model made floating is sunk to the ground.
- **Wings:** `wing_r` sits on the model's +X side and `wing_l` on the -X side; they turn about the Z axis (up and down). Model the rest shape you want: folded at the sides for a hen, spread out for a flying bird (the beat goes about 1 radian up and down). **Head:** nods about X (positive is nose down). **Legs:** swing about X, rest straight down. Keep each model to a few hundred triangles; a few dozen birds and sheep can be in view at once.
- One material per part is expected; several materials in a part draw as several pieces.
- Tell me the file names. On load the console prints one `[life]` line naming the keys that still have no file (a file that loads but has no mesh is warned about); `__pantheonLife.animals()` only says how many animals and birds are out.

### To look at on a real GPU (headless could not render any of this)
- [ ] Tree sway: the amplitude (a calm day should be barely there, a storm should show), the gust sweeping across a wood, birch against fir, the flutter close up and near the orb. DEV panel "Tree sway".
- [ ] Tree shadows stay at the rest pose while the crowns move: check that it does not look wrong in a storm or at sunset.
- [ ] A hitch the first time trees, leaves, fireflies, animals or place life are drawn (everything is made before the warm-up; if one hitches, report which).
- [ ] The grass, flowers and smoke now lean toward the west like the clouds; the wheat waves, the wheat lying down in rain, the rustle round the orb, the flowers brightening.
- [ ] Leaves and pollen: density near and far from trees, in wind and in rain; birch leaves copper. Fireflies at night by the shore and in the woods, and drifting to the orb from Phase 1.
- [ ] Sheep and hens (convert a village, or `__pantheonLife.farm(true)`): the pasture and the yard, how they walk and graze, feet not sliding, the blob shadows, hens scattering from the orb.
- [ ] Birds over the woods by day: height, speed, banking, the wingbeat, flying off when the orb is near, coming back.
- [ ] The places' life (`__pantheonLife.fakePlaces()`; real once the five landmarks are placed): the great tree's birds and leaves, fireflies at the sunken ruin and on the runestones' ring, doves at the temple, motes at the monolith; the difference between awake (faint) and restored (full), and the faint trace after the name returns.
- [ ] After the audit fixes (the shader edits were only built headlessly): birch leaves copper but spread through the air, not in bands; the orb's rustle on the grass fading out smoothly to its rim; the far (LOD2) grass waving along the wind, not a fixed way; grass gusts and flower sway keep time with the trees (and stop together when paused); fireflies follow the orb as drawn, without stutter; a regrowing sapling hardly moves in the wind instead of swaying like a full tree.
- [ ] After the second clean-up (look-only changes, built headlessly): the fireflies of the box now come out at dusk and dawn (half as many) like the ones at the places; pollen is no longer tinted copper; all specks and clouds now share one material builder (`createSpeckMaterial`), so look for any that is the wrong size, colour or blink; ambient bird flocks start in different spots than before.
- [ ] Tune with the numbers in `src/config/visual/life.ts` and `VISUAL.props.sway`.

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

## The hand (uproot, lift, drop) and the new buildings
Built and working with stand-ins (design: `HAND.md`; code notes: `docs/village/hand.md`). Nothing here was ever drawn on a real GPU: headless checks cover the rules, not the look. What is left is yours.

To look at on a real GPU (convert a village, or `__pantheonVillage.convertNow()`, then `__pantheonHand`):
- [ ] The carried tree: its size next to the orb (about a third of the tree next to the 0.24 m orb), the tilt and the trailing, clipping through the ground or the orb, its level of detail at distance, and the shadow of a moving carried tree (it may stay at the rest pose).
- [ ] The stump that stays where a lifted tree stood, and that **cancelling** (Esc, a cutscene, a save) puts back exactly one tree, not two or none.
- [ ] Wheat: the field after a harvest by the hand (the grass data map repaints when growth falls), and the sheaf stand-in that hangs from the orb.
- [ ] A held sheep: the pose, whether the legs read as lifted, the missing blob shadow, and the spot left in the flock; a new sheep walking into view after it respawns.
- [ ] The ring and the hint on what would be lifted and on where it would be put down: legible by day, at dusk and in the overview (both the field rings and the building rings).
- [ ] The sparkles of a drop, also at the overview cursor; the overview cursor while it carries something.
- [ ] A hitch the first time a tree is lifted (the batches and the materials are made before the warm-up; if it hitches, say which).
- [ ] Farmstead and Shrine stand-ins (the house kit: a low open barn, a small stone hall): their footprints against the lanes and the fields, the planks while they are built or raised, levels 2 and 3 (no visible change yet), and that a farmstead does not look like a house from the overview.
- [ ] That the faith effect reads: a shrine at level 3 and Fervour make the faith number move visibly faster.

Models, optional until you want them (stand-ins hold the places):
- [ ] **Farmstead**, levels 1 to 3 (footprint about 7 x 4.5 m; it helps the fields around it, so a barn with a few tools and a cart is enough).
- [ ] **Shrine**, levels 1 to 3 (footprint about 3.6 x 3.6 m; a place for offerings; not the same as the map's energy shrines).
- [ ] **Market** and **Beacon**, all levels. Not built (named ideas: surplus into faith, a wider orb presence); the model comes first if you want them.
- [ ] Carry props for the hand: a log bundle (a tree cut small, today the tree itself is drawn small), a sheaf of wheat (a pile stands in), a sack. Hens are not liftable yet.

Decide and tune:
- [ ] Playtest the numbers in `src/config/village/hand.ts` (reach, energy cost per kind, belief per deed, witness radius, cooldowns, wood to work, food per sheaf and per sheep) and `src/config/village/effects.ts` (the farmstead's reach and bonus, the workshop's axes, the shrine's faith). The conversion takes about 13 minutes of deeds at the placeholder numbers.
- [ ] Whether carrying should slow the orb or drain energy (today energy is only charged at the lift).
- [ ] The name **Shrine** for the building (it overlaps with the energy shrines of the map); which building types come next.
- [ ] Words: the hand's lines (`src/hand/handText.ts`), the node texts for Farmsteads, Shrines, Fine works and Fervour (`src/skills/skillTree.ts`).

## Quests
Design: `QUESTS.md` (decided: no phase-0 quest line, several quests at once, rewarded teaching quests, Caros's five favours, a memory-book journal, Aera, the final act "The Name Returns"). Placeholders ship; yours:
- [ ] Words: Caros's lines for the eight teaching quests and five favours, Aera's lines (her only one now is the monolith favour's closing line, placeholder text), the final fragment and Caros's closing line (a trader seen on the road).
- [ ] Look at the memory book (`J`) on a real GPU: the rune cover, the spacing, the long fragments.
- [ ] The rune: its shape (five strokes, one per place) and how it looks in the sky and on the memory book cover.
- [ ] The finale cutscene: look at it on a real GPU (the five beams, the camera path and distances, the length of each slot, the strokes lighting one after another in the return shot, whether Space or Enter skips cleanly, the camera's way home, the village HUD hidden meanwhile and B not opening the overview) and tune `PHASE0.QUEST.FINALE.CUTSCENE`. DEV: `__pantheonQuest.playCutscene()` plays it alone.
- [ ] Watch for a stall when the first beam or the rune is drawn: the scene is built when the cutscene starts and its shaders compile on the first frame they are visible. If it hitches, warm them up while the opening look plays.
- [ ] The beams' look at a place (thin like the guide line today; the temple's crown beam is the model), the rune's size and height in the sky, and how faint the rest state after the finale should be (`BEAM_SETTLED`, `RUNE_SETTLED`).
- [ ] Optional models: a look for Caros and Aera, a prop for the rune traced in the dust.
- [ ] Decide where Merra's smooth stone and Verath's offer fit.

## Look and sound
- [ ] Beacon colour per kind, the feel of dwelling and awakening
- [ ] Review the light effects on a real GPU (I can only build them and check the code here)
- [ ] Optional, not built: a landmark hum, an awakening chime
