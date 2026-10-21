# Phase 0 — your to-do list

What the build needs from you, with the milestone each item blocks (see `PHASE_0_LANDMARKS.md`). Tick items off here; stand-ins keep the game running until the real thing arrives.

## 3D models

### Landmarks (5) — blocks the final look of L4
Stand-in props are used until these exist. For each: `runestones`, `tree`, `temple_ruin`, `sunken_ruin`, `monolith`.
- [ ] `runestones`
- [ ] `tree`
- [ ] `temple_ruin`
- [ ] `sunken_ruin` (half in water: decide whether the water line is part of the model or the terrain)
- [ ] `monolith`

What I need per model: a glTF `.glb` with the origin at the base and +Y up; a target height in metres (`targetHeightM` in `src/assets/assetManifest.ts`) and rough footprint; a LOD chain (`Name.glb`, `Name_lod1.glb`, `Name_lod2.glb`); textures baked to KTX2 by `npm run bake:play-props`; which parts should glow (a separate emissive material or node, or a mask) so I can drive them from the awakening; a pick/dwell radius if the footprint is unusual. Put them in `public/models/landmarks/` (a new family) and tell me the file names.

### Villagers (in progress)
12 figures (roles builder, priest, farmer, woodcutter, fisherman, idler, by sex) in `public/models/village-kit/villagers.glb`, built by `assets-src/village/villager_build.py` and converted by `src/world/village/assets/villagerKit.ts`.
- [ ] The painted models and textures (the rig contract: pivots `VILLAGER_RIG`, part ids and colour slots skin/hair/tunic; 830 to 1,200 triangles each)
- [ ] Optional later: baked animation clips (idle, walk, hammer, pray, carry, chop, hoe, fish, collapse)
A figure missing from the GLB falls back to its placeholder, so you can drop them in one at a time. Pipeline notes: `public/models/village-kit/README.md`.

## Story — blocks L5 (placeholder text ships until then)
- [ ] Five chapters, told in visit order 1 to 5, ending at the village
- [ ] A short caption for each landmark kind
- [ ] The "something is unfinished" beat shown when the bar is full but landmarks are left
- [ ] Rewrites of the fragments that mention syllables, stones, the spring or "the ruin" (ids 2, 5, 6, 8, 9, 11, 12, 13, 14, 15)
- [ ] Review the Aethon memory (id 16) and the energy fragments (3, 7, 10, 14)
- [ ] Names: keep or change Merra, Verath, Caros (the elder), Aera (the shepherd)
- [ ] What each landmark means for later phases (shrine-like regeneration, builder boost, quest hook)

## Map (island-mountain) — blocks the L6 playtest
- [ ] Place the five landmarks in the editor (Markers palette, once L1 is in)
- [ ] Add about 20 more orbs in a trail that bends toward the landmarks (order of placement = order of the guide line)
- [ ] Put the last landmark near the village
- [ ] Paint Path cells along the guide route so the line follows them
- [ ] Decide whether dala, island-test and volcanic get landmarks (without them the old energy-only rule applies)

## Look and sound
- [ ] Beacon colour per kind, the feel of dwelling and awakening
- [ ] Review the light effects on a real GPU (I can only build them and check the code here)
- [ ] Optional, not built: a landmark hum, an awakening chime

## Decisions
- [ ] Target length of phase 0 (20 to 30 minutes assumed) — confirm after the first playtest
- [ ] Energy per landmark and per orb (first guess about 13 per landmark) — tune after the first playtest
