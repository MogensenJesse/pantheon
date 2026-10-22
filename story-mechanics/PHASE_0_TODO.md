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

### Villagers (in progress)
12 figures in `public/models/village-kit/villagers.glb`; the rig contract and pipeline are in `public/models/village-kit/README.md`. A figure missing from the GLB falls back to its placeholder, so you can drop them in one at a time.
- [ ] The painted models and textures
- [ ] Optional later: baked animation clips (idle, walk, hammer, pray, carry, chop, hoe, fish, collapse)

## Story — final text (placeholder text ships until then; it is all in `src/story/fragments.ts`)
- [ ] Five chapters, told in visit order 1 to 5, ending at the village (`LANDMARK_CHAPTER_IDS`: fragments 2, 5, 6, 9, 13)
- [ ] A short caption for each landmark kind (`LANDMARK_CAPTIONS`)
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

## Look and sound
- [ ] Beacon colour per kind, the feel of dwelling and awakening
- [ ] Review the light effects on a real GPU (I can only build them and check the code here)
- [ ] Optional, not built: a landmark hum, an awakening chime
