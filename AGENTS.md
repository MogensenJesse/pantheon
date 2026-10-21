# Pantheon — Agent Guide

Phase 0 prototype: a divine remnant explores **authored maps** (Three.js WebGPU + Vite + TypeScript). Design intent and lore live in `story-mechanics/`; gameplay tunables in `src/config/phase0.ts`, visual look in `src/config/visual/` (imported via `visualTuning.ts`).

## Stack (non-negotiable)

- **Renderer:** `WebGPURenderer` only — no WebGL fallback. Entry check: `src/rendering/webgpuCapability.ts`.
- **Shaders:** Prefer **TSL** (`three/tsl`, `Mesh*NodeMaterial`, `SpriteNodeMaterial`, `RenderPipeline`) over raw GLSL `ShaderMaterial`. Post-FX uses `three/addons/tsl/display/*` nodes.
- **Imports:** `import * as THREE from 'three/webgpu'` (or granular `three` + `three/webgpu` where the file already does).
- **Build:** Vite, `esnext` target. Do **not** start `npm run dev` — the user runs the dev server manually.

## Project layout

| Path | Purpose |
|------|---------|
| `src/main.ts` | Bootstrap: WebGPU check, launch request (new / continue / start screen), map selection, assets, world build, starts `GameLoop` |
| `src/core/gameTick.ts` | Per-frame `fixedUpdate` / `render` tick (`createFrameTick`) |
| `public/maps/` | Authored map JSON + `manifest.json` (play catalog) |
| `src/map/` | Shared map types/grids/IO/validation; `play/` selection; `authoring/` editor tools + DOM helpers |
| `src/bootstrap/` | Pieces of the boot that `main.ts` calls: play loading phases (lore messages + asset/terrain batch progress), `renderStack.ts`, `shadowWarmup.ts`, `startPose.ts`, `askForSave.ts` |
| `src/ui/MapSelectScreen.ts` | Map chooser, **DEV builds only** (production always starts in `DEFAULT_PLAY_MAP_ID`) |
| `src/config/phase0.ts` | Phase 0 gameplay tunables (energy, orbs, reveal) |
| `src/config/village.ts` | Village gameplay tunables (`VILLAGE`), composed from `config/village/{layout,life,economy,powers}.ts`; `config/clock.ts` is the one game-day length; `config/weather.ts` the storm fronts |
| `src/config/visualTuning.ts` | Barrel re-export of `VISUAL` + types from `config/visual/*` |
| `src/config/visual/` | Split visual look modules (sky, postfx, terrain, grass, player, organicOrb, guideLine, energyOrb, sparkleLook, …) |
| `src/config/world.ts` | Map size, segments, height scale, biome height bands (`WORLD`) |
| `src/core/` | Game loop, input (`CameraInput`), `settings.ts` (DEV and render settings), `state/` (gameplay state), event bus. Camera rig: `src/rendering/CameraRig.ts` |
| `src/core/reveal/` | Energy-cap gate (`WorldReveal.ts`) + post-cap day cycle (`DayCycle.ts`); `sunRevealState.ts`; `dayCycleState.ts` (the pure saved state and its parser) |
| `src/assets/` | Manifest, `AssetLoader`, KTX2/Draco helpers (`createKtx2Loader.ts`, `decoderPaths.ts`) |
| `src/world/` | Terrain, map props, GPU grass (`grass/`), water |
| `src/world/grass/` | Player-follow biome grass + optional flowers — see **Grass subsystem** below |
| `src/world/mapProps/` | GLB instancing — `config/` / `material/` / `tsl/` (+ placement/instancing at root) |
| `src/world/water/` | Water mesh + normals — `config/` / `mesh/` / `material/` / `sync/` / `data/` / `tsl/` |
| `src/world/village/` | The village (temple, houses, fields, villagers): pure `sim/`, shared `model/`, `render/`, `assets/` — see **Village subsystem** below |
| `src/overview/` | The village overview camera and the orb as a cursor (M3); its screens are in `src/ui/overview/` — see **Village overview** below |
| `src/rendering/` | Scene, post-FX, camera rig, WebGPU helpers |
| `src/rendering/sky/` | `SkySystem`, reveal blend, `skyDefaults` |
| `src/rendering/sky/hdri/` | Night EXR load, HDRI weight, runtime tuning |
| `src/rendering/sunShadow/` | Sun shadows: near PCSS, far, cloud-cast, whole-map world cascade (+ visibility resolve), `receiverUniforms` |
| `src/rendering/layers/` | Camera/object layer policy (water reflector mask) |
| `src/rendering/clouds/` | Mesh cloud system — `MeshCloudSystem` + wind/sort/lifecycle helpers |
| `src/world/weather/` | Storm fronts (M8, pure and node-runnable): rain as a function of the game clock and a place (see *Weather* in the village table); numbers in `src/config/weather.ts` |
| `src/rendering/debug/` | DEV GPU / render / shadow debug logs |
| `src/rendering/loaders/` | Alpha-cutout texture helper (`configureAlphaCutoutTexture.ts`) |
| `src/rendering/postfx/` | Post pipeline (`createPostFxPipeline` + `pipelineComposite` / `pipelineAaFsr`) + effect nodes |
| `src/rendering/atmosphere/` | Day aerial + night valley fog (`atmosphereSystem.ts`) |
| `src/rendering/weather/`, `src/rendering/tsl/` | Rain streaks, the weather's look and the wet-ground shader (`weather/`); small shared TSL nodes (`tsl/`) |
| `src/entities/` | Player, energy orbs, organic orb volume, guide-line ribbon, shared sparkle field |
| `src/gameplay/` | Gameplay wiring that `main.ts` calls: `initGameplay.ts` (quest, powers and their screens, regeneration, shrine zones, orb respawn, the per-step update) and `progression.ts` (sparks for converts, phase 2 at the conversion, Echo's faith, opening arch II), `setupSaving.ts` (saving, pause and quit wiring) and `energyRegen/` (shrine and temple regeneration). The DEV hooks are in `src/dev/runtime/installProbes.ts` |
| `src/ui/` | HUD, map select, play loading screen, story log; `kit/` is the shared UI kit (below); `village/` (village line and alerts), `overview/`, `skills/`, `abilities/`, `quests/`, `saves/` and `overlay/` are screens built on it |
| `src/story/`, `src/quests/` | Story text and memory fragments (`story/`, placeholders); the pure quest rules and runtime (`quests/`) |
| `src/save/` | Saved games: snapshot rules, slots, IndexedDB store, save service — see **Save system** below |
| `src/ui/overlay/` | DOM markers that follow points in the world: belief pips and the power target rings (see `docs/village/hamlet-quest.md`) |
| `src/ui/saves/` | The save screens on the UI kit: start screen, slot lists, pause menu, temple save hint, autosave indicator — see **Save system** below |
| `src/skills/` | The skill tree: pure rules and nodes (`skillTree.ts`), the shared modifier record (`modifiers.ts`), the runtime that applies it (`skillRuntime.ts`) — see **Skills and abilities** below |
| `src/abilities/` | Active abilities: definitions (`abilities.ts`: Murmur, Dream, Sign, and the five builder powers), their effects on the village (`powers.ts`, `builderPowers.ts`), the pure cast pipeline (`caster.ts`), its wiring (`abilityRuntime.ts`) — see **Skills and abilities** below |
| `src/dev/` | DEV tooling — `panel/` (Dev + Perf chrome, sliders), `runtime/` (render debug apply), `profiling/` (WebGPU/TSL perf suite), `bindRange`, panel tick hooks |
| `public/models/` | Nature `.glb` props (KTX2) in per-family folders (see `src/assets/assetManifest.ts`) |
| `public/textures/` | `terrain/{biome}/`, `terrain/atlases/`, `water/`, `environment/` (night HDRI), `grass/` |
| `public/basis/` | Self-hosted Basis/KTX2 transcoder (committed; refresh via `npm run tool:sync-decoders`) |
| `public/draco/` | Self-hosted Draco WASM under `gltf/` (committed; same sync script) |
| `story-mechanics/` | GDD — vision, phases, the village roadmap (read before large gameplay changes) |
| `docs/village/` | Per-milestone village notes: rules, config keys, events, save fields, DEV hooks, checks |
| `scripts/` | `checks/` (headless checks and their runner), `assets/` (bake scripts), `tools/` — see **Scripts** |
| `editor.html` | DEV map editor entry (`src/editor/main-editor.ts`) |
| `src/editor/` | Terrain sculpt/paint, entity place mode, save/load UI |
| `vite/mapDevApiPlugin.ts` | DEV POST `/api/dev/maps/save` → `public/maps/` |
| `vite/optimizerDevApiPlugin.ts` | DEV optimizer library / capabilities / staged save API |
| `vite/gradeLutManifestPlugin.ts` | Scans `public/textures/grade/**/*.cube` → `manifest.json` |
| `optimizer.html` | DEV asset optimizer entry (`src/optimizer/main-optimizer.ts`); not in the prod build |

Use a **file path comment** on new modules (e.g. `// src/rendering/Foo.ts`) to match existing files.

**DEV override convention:** Visual systems that need live slider merges use module `getLive*` / `*DevOverrides` (e.g. `getLiveCloudSettings` in `cloudDevState.ts`, `skyDevOverrides`, `guideLineDevState`, `organicOrbDevState`, `playerParticleDevState`, `energyOrbParticleDevState`). GameState-backed panels use `devSettings` from `src/core/settings.ts` plus reset helpers (water: `waterDevDefaults`; grade: `resetPostFxGradeDev` in `postfxGrade.ts`). Prefer extending an existing pattern over inventing a third.

## Grass subsystem (`src/world/grass/`)

Revo-inspired GPU grass: 3 LOD rings, SSBO compaction, indirect `InstancedMesh` draw. Optional edelweiss flowers are a separate stateless `InstancedMesh` (`render/flowerRingField.ts`): no SSBO or compute pass — the vertex shader recomputes wrap-tile placement, biome/prop/clump keep and scale per instance (shared helpers from `compute/shared/`).

**Entry:** `grass/core/GrassSystem.ts` — `initGrassSystem()` / `GrassSystem` interface. Init from `main.ts`; per-frame from `gameTick.ts`; DEV: `dev/panel/DevPanel.ts`, `dev/panel/devPanelGrass.ts`.

**Per-frame:** `grassSystem.update()` in `gameTick.ts` **after** `cameraRig.update()`. Compact encodes synchronously before the draw (tile-mark submit, then compact submit). Await `whenComputeReady()` **only** when `!isFieldReady()` (rebuild boundary). Draw shaders compute wrap-tile XZ from slot index + player; the grass SSBO is `uvec2` (height + state/debug reason, 8 B). Indirect args use the `drawIndexedIndirect` layout (`indexCount, instanceCount, firstIndex, baseVertex, firstInstance`). Ring fade is a linear distance band (`uFadeBandM` outer skirt, `uFadeInBandM` inner ramp; `createRingFadeOut/In` in `vegetationVisibilityTsl.ts`) that drives both density in compact and blade length/width in draw.

**Culling (two stages, both sphere-vs-frustum with the same `grassSphereInFrustum`):** tiles first, then blades. Mark kernel (submit 1) resets the indirect count and marks `tileCullSize` (32 slots) tiles visible; tile bounds are slope-aware (3×3 terrain height samples → min/max Y → bounding sphere) with integer row/col tile ids, padded by the camera-lag term (`CAMERA_LAG_RADIUS_PER_M`, 0.008 m per metre of player distance). Marks are sticky (value 2) so a tile stays through the compact pass that follows. Compact kernel (submit 2) early-outs on unmarked tiles, then runs the per-blade frustum test (`grassFrustumVisibility(worldPos, boundsRadius)` — 4 side planes), stochastic keep, pack and append. Tile cull gives a modest win (~1–2 fps in profiling) and is toggled by `VISUAL.grass.tileCullEnabled`. DEV **Freeze cull camera** (`GrassSystem.setCullCameraFrozen`) freezes the frustum planes at the current camera and draws a `CameraHelper` so you can orbit and see exactly what is culled.

**LOD0 cost:** profiling shows LOD0 is fragment-bound, mostly sun-shadow taps. `VISUAL.grass.nearShadow` (default `false`) makes LOD0 use the far-only receiver (Vogel + cloud, ~20 taps) instead of near PCSS (~50 extra taps/pixel); `true` restores near PCSS (page reload). Per-instance values the fragment stage needs (noise, offsets, world position, bend length, cull reason) are hoisted with `.toVarying()` — without it TSL re-emits the whole graph, including storage reads, per fragment. Do not wrap shared non-var expressions inside an `If`/`Else`; `.toVar()` them in the outer scope. Compare-sampler shadow reads cannot run in the vertex stage (Three limitation), so per-vertex shadow is not an option.

LOD2 draw uses far-only sun shadow (Vogel + cloud), distant sine wind, and skips sheen/proximity AO. Ring layout is `readGrassRingsLayout()` only (no `ringDerived` cache). Field manager public API is `{ state, boot, rebuildAll, setWorldPosition, dispose }`.

Data map is **RGBA8** (`R` = biome grass weight, `G` = baked clump, `B` = wheat field (0 outside, 0.12..1 inside by ripeness; written by `GrassSystem.setWheatField`, painted by `data/wheatFieldMask.ts`; the compact pass lifts weight to 0.95, forces no clumping and one even blade height, and the draw shader colours the blade green to gold via `tsl/grassWheatTsl.ts`), `A` unused — `.g` from an RG8 `DataTexture` was unreliable on WebGPU in r186); clump bake sliders in DEV re-bake the whole map on CPU, so they commit on release (`change`). Blade Y comes from the terrain surface sample, not the data texture. Prop exclusion (and terrain contact AO, same `exclusionTextureSize`) uses `EXCLUSION_TEXEL_SCALE` 2 (~4096² R8, ~16 MB) with `propGrassEdgeFadeM` 0.12 m. The exclusion influence is a hard cull below `propGrassCullThreshold` (0.3), and blades above it **taper**: scale goes from `propGrassTaperMinScale` at the cull to full over `propGrassTaperBand` (`createPropGrassTaper`, applied in `grassSsbo` and the flower material), so grass shrinks toward paths, yards and props instead of ending in a wall. Leftover compute lever (tuning, not code): LOD2 at 5 blades/m² with `widthFarGain` 2 still allocates ~1.29M compact threads. Removed DEV: NDC cull pads, `detailedWindRadius`, `ringDerived` cache, GPU compact-count readback, `rebuildRing` / `reinitInstances`.

```
grass/
  core/       GrassSystem.ts, grassFieldManager.ts, grassComputeQueue.ts
  compute/    grassSsbo.ts, grassSsboPack.ts; shared/ vegetationIndirectTsl.ts, vegetationVisibilityTsl.ts, vegetationOffsetTsl.ts, vegetationTileCullTsl.ts, vegetationCompactTsl.ts
  render/     grassMaterial.ts, flowerMaterial.ts, grassGeometry.ts, *RingField.ts
  tsl/        grassWindTsl.ts, grassFrustumVisibilityTsl.ts, grassVegetationShadingTsl.ts, grassNightLightingTsl.ts; fake SSS + wrap/hemi in `rendering/tsl/foliageWrapHemisphereTsl.ts` (props: wrap/hemi only)
  config/     grassConfig.ts, grassFieldMetrics.ts, flowerConfig.ts, grassUniforms.ts, applyGrassDevUniforms.ts
  data/       grassDataTexture.ts, loadGrassWindAtlas.ts, loadFlowerSprite.ts, propGrassExclusionTexture.ts, propGrassMeshRaster.ts
```

| Concern | Where |
|---------|--------|
| Shipped tunables | `VISUAL.grass` in `visualTuning.ts` → `grass/config/grassConfig.ts` → `grassFieldMetrics.ts` |
| Shared GPU uniforms | `grass/config/grassUniforms.ts` (`grassSharedUniforms`) |
| Map biome densities | `map/mapGrassSettings.ts` (`mapGrassToUniforms`) |
| DEV sliders | `dev/panel/devPanelGrass.ts` → `grass/config/applyGrassDevUniforms.ts` |
| Ring create/rebuild/dispose | `grass/core/grassFieldManager.ts` (`boot` / `rebuildAll`) |
| Compute queue + rebuild serialization | `grass/core/grassComputeQueue.ts` |
| Data map (RGBA8 weight + clump) | `grass/data/grassDataTexture.ts` |
| Prop exclusion texel size | `grass/data/propGrassMeshRaster.ts` (`EXCLUSION_TEXEL_SCALE`) |

Full page reload after `visualTuning.ts` grass changes or terrain/material edits that re-seed grass data.

## Sparkles + guide line (`src/entities/`)

Shared additive HDR sparkle sprites (`SpriteNodeMaterial` + `InstancedMesh`) for the path ribbon, player orb, and residue energy orbs. Placement differs; look (disc, HDR bloom, tube spin, packet density, breath, A→B→C travel — currently white) is shared. Player orb, residue orbs, sparkles, and the guide ribbon opt into the water reflector (`enableWaterReflectionLayer`); grass stays on layer 0 only. Map props are opted in by `MapEntitySpawner` per `VISUAL.water.reflectProps`; `'large'` and `'all'` both cover every prop in the manifest (trees, rocks, structures), at every LOD, with the full prop material.

**Shared field:** `entities/sparkleField.ts` (`createSparkleField`) — `place()` supplies path vs shell vs burst positions. Defaults: `config/visual/sparkleLook.ts` (`SPARKLE_LOOK` / `SPARKLE_PALETTE`); per-system overrides on `VISUAL.guideLine`, `VISUAL.player.particles`, and `VISUAL.energyOrb.particles`. Shared pulse TSL: `rendering/tsl/energyPulseTsl.ts` (`guideLine/guidePulseTsl.ts` re-exports for ribbon/sparkle/orb graphs).

**Guide ribbon:** `entities/guideLine/GuideLineSystem.ts` — A* path to the next energy orb, HDR mesh (`guideLineMesh.ts`), path-sampled sparkles (`guideLineParticles.ts`), terrain/prop receive glow stamp (`guideGlowMap.ts`). Receive uniforms + cobble TSL live under `rendering/guideGlowUniforms.ts` and `rendering/tsl/guideReceiveGlowTsl.ts` so terrain/props do not import `entities/`. New path after absorb washes in along the ribbon (`revealSec`, ease-in-out, player → orb). Init from `WorldBuilder`; per-frame `guideLine.update(visPos, camera, dt)` in `gameTick.ts`. DEV: **Look → Guide line** (ribbon) + **Glow & bloom → Particles → Guide line**. Live merges: `guideLineDevState.ts`.

**Organic orb volume:** `entities/organicOrb/organicOrbMaterial.ts` — shared TSL `MeshBasicNodeMaterial` on the player orb and residue energy orbs (translucent viewport-refracted fill, white fresnel rim, local-space `triNoise3D` morph). Shared sphere: `createOrganicOrbGeometry` (32 segments). Player keeps a private material so rim HDR and fill white scale with energy (`orbEmissiveMin` / `orbFillWhiteMin` at 0% → `VISUAL.organicOrb.rimHdr` / `fillWhite` at cap) and the mesh stretches along move velocity (sparkle-lag teardrop; reverse grows a new back instead of spinning). Residue orbs share one material and apply `VISUAL.energyOrb.look` overrides (rim power / HDR / fill white), `VISUAL.energyOrb.morphOriginMul`, plus a smaller `PHASE0.ORB.ENERGY_RADIUS`. `organic.sync` runs when energy or DEV look changes, not every tick. Sparkle shells stay separate. DEV: **Look → Orb** (player). Live merges: `organicOrbDevState.ts`. Full page reload after shader graph / `visual/organicOrb.ts` changes.

**Player orb halo:** `entities/playerOrbParticles.ts` from `PlayerVisuals.ts`. Shell around the orb; per-mote drag lag + motion shake; **drawn `mesh.count` scales with energy** (0 at 0% → `VISUAL.player.particles.count` at cap; capacity is fixed). Mesh **scale and rim HDR** grow with energy (`VISUAL.player.orbScaleMin` / `orbEmissiveMin` at 0% → current size and `organicOrb.rimHdr` at cap). One fixed-step energy smoother (`getDisplayEnergy`) drives mesh/rim/fill and the night point light. Drag buffer uploads skip when standing still (or lag is 0). Follow runs from `PlayerController.applyRenderPosition`. DEV: **Glow & bloom → Particles → Player**. Live merges: `playerParticleDevState.ts`.

**Energy orbs:** `entities/energyOrb/index.ts` is the barrel (`energyOrb.ts` instance, `orbSystem.ts` visual bootstrap and respawn wiring, `orbState.ts` the pure saved state: `OrbsState`, `parseOrbs`, `serializeOrbs`, `planRestore`). Sparkles: `entities/energyOrbParticles.ts` from `initOrbSystem`. Shared idle halo (orb-position texture, one InstancedMesh for all live orbs) plus a pooled absorb burst (pop, then assimilate into the player orb). Terrain footing is sampled once at spawn (orbs do not move in XZ). Idle sparkle texture uploads only when orb XYZ / absorbed bits change. Init from `WorldBuilder`; per-frame from `orbSystem.update` in `gameTick.ts` fixed step. DEV: **Glow & bloom → Particles → Energy orb**. Live merges: `energyOrbParticleDevState.ts`.

Full page reload after sparkle `count` / shader graph changes (`visual/player.ts`, `visual/guideLine.ts`, `visual/energyOrb.ts`, `visual/organicOrb.ts`, `sparkleField.ts`, `organicOrbMaterial.ts`). HMR is not enough.

## Terrain subsystem (`src/world/terrain/`)

Biome-splat terrain: TSL `MeshBasicNodeMaterial` with manual sun/ambient/shadow lighting. **Play** loads offline-baked KTX2 color + AO atlases (`loadBakedTerrainAtlases`); the **editor** loads the same `color.ktx2` (AO is a 1×1 stub). There is no runtime fallback packer. Mesh build stays in `src/world/MapTerrainBuilder.ts`.

**Play and editor** share one world-fixed `PlaneGeometry` whose vertex step equals `VISUAL.terrain.chisel.stepM` (8 m → 256 segments on the 2048 m world). **Play** CPU-bakes vertex Y once (heights are static) and the visible mesh casts sun shadows; the one exception is the village **detail patch** (`terrain/fineTerrainPatch.ts`): the coarse cells around the village seed are carved out and replaced by a child mesh of 2 m facets (coarse chisel Y + `FineDelta` offsets, flat per-face normals and offset slopes as attributes) drawn by the terrain's own shading graph (`splatMaterial.groundColor`, same uniforms and sun shadow node, no extra fragment textures). CPU `getWorldY`/normals include the offsets; the `*Base` samplers do not. **Editor** keeps GPU vertex displacement so sculpt updates live (no shadow cast). Fragment lighting uses per-triangle face N (not interpolated vertex N), with an optional crease fillet (`chisel.edgeSoft`) that blends only that lighting normal across triangle edges. **Editor** uses `simpleShading` (albedo splat + hue-split; no PBR, shadows, glow, or wetness). Painterly umbra is `mix(unlit, lit, (N·L)×sunVis)` in `terrainStylizeLightingTsl.ts` — one `uShadowFloor` on the splat material.

**Entry:** `terrain/index.ts` — `loadTerrainTextures`, `createTerrainSplatMaterial`, `syncTerrainSplatLighting`, `applyTerrainDevUniforms`. Texture load: `bootstrap/playLoadingPhases.ts` (play) / `main-editor.ts` (editor); mesh: `MapTerrainBuilder.ts`; lighting: `rendering/worldLighting.ts`; DEV: `dev/panel/devPanelTerrain.ts`.

```
terrain/
  config/     terrainBiomeTuning.ts
  loaders/    loadTerrainTextures.ts, loadBakedTerrainAtlases.ts, terrainLoadErrors.ts, terrainTextureTypes.ts
  atlas/      atlasConstants.ts, bakedAtlasPaths.ts, terrainMapAtlas.ts (types, stub AO, GPU init)
  material/   createTerrainSplatMaterial.ts, syncTerrainSplatLighting.ts, biomeSplatUniforms.ts,
              biomeSplatDisplacement.ts, biomeSplatShading.ts, applyTerrainDevUniforms.ts
  tsl/        biomeAtlasUv.ts, terrainMacroHeightTsl.ts, snowDistributionTsl.ts, terrainSurfaceHeightTsl.ts, terrainStylizeColorTsl.ts, terrainStylizeLightingTsl.ts
  cpu/        terrainSurfaceCpu.ts, terrainChiselCpu.ts
```

| Concern | Where |
|---------|--------|
| Shipped visual tunables | `VISUAL.terrain` (`config/visual/terrain.ts`) → `config/terrainBiomeTuning.ts` |
| Play / editor mesh | `MapTerrainBuilder.ts` — one world-fixed plane; segments = `WORLD.SIZE / chisel.stepM`. Play: CPU-baked Y + `castShadow` on the visible mesh; editor: GPU displace |
| Vertex displacement | `material/biomeSplatDisplacement.ts` — editor GPU chisel Y; play uses `positionLocal` after CPU bake. Fragment face N + crease fillet from `terrainMacroHeightTsl.ts` |
| Height models | **Chisel Y** = walkable/visible (`getWorldY`, mesh, grass Y, shadows, waterline, wetness, snow overlay, prop ground-contact). **Bilinear sculpt Y** = |∇h| / foam `fwidth` (`macroSlopeAtWorldXZ`) only |
| Waterline / wetness | Play water + terrain wet sand sample **chiseled Y** for the waterline; |∇h| stays bilinear (`macroSlopeAtWorldXZ`) so foam `fwidth` does not pick up 8 m creases |
| Slope-rock / grass / snow | Shared chisel N.y curve (`TERRAIN_SLOPE_ROCK_*` / `slopeRockDerivedFromNormalY`); grass `packMaps.grass.slopeKill` and snow overlay both scale off that 0–1 weight (snow × `(1 − derived)`). Snow coverage is **per facet** (centroid height/noise + knife face N) so it matches slope-rock geometry |
| Prop contact AO | Terrain `uPropAoMap` darkens albedo; sun term is `min(PCSS, contact-sun)` so tree umbra does not double-multiply |
| Play terrain | Always on in play (`WorldBuilder` → `buildMapTerrain`); editor passes `simpleShading: true` |
| Editor terrain shading | `simpleShading` on the splat material — albedo splat + hue-split; no AO atlas, PCSS receive graph, glow, or wetness |
| Painterly umbra | `tsl/terrainStylizeLightingTsl.ts` — hue-split is `mix(unlit, lit, (N·L)×sunVis)`; Disable shadows / floor slider hit the one splat `uShadowFloor` |
| GPU macro height | `map/MapGrids.ts` (`createHeightTexture`) → `uHeightTex` in `biomeSplatUniforms.ts` |
| Texture sources / ingest | `assets-src/terrain/{biome}/` (never shipped), scanned by `scripts/lib/scanTerrainBiomeFolder.ts` + `scripts/lib/pbrMapClassify.ts` in `npm run bake:terrain-atlases` (color required, AO optional); see `assets-src/terrain/README.md` |
| Atlas load (fail-fast) | `loaders/loadBakedTerrainAtlases.ts` — `color.ktx2` + `ao.ktx2` (editor: color only); no fallback |
| Overlay masks | One RGBA8 `uOverlayMap` on the height grid (`map/overlayChannels.ts`): **R** path (baked from painted Path, the village adds roads, yards and wear), **G** meadow, **B** water, **A** authored convex ridge. Baked in `map/biomeWeightBake.ts`, uploaded via `MapGrids` (`createOverlayTexture` / `updateOverlayTexture` / `updateOverlayConvex`). **Path wins over meadow** (`meadowW × (1 − pathW)`) so runtime roads show on meadow ground. Grass density bakes from the authored masks only (DEV re-bakes read a copy taken before the village founds) |
| Texture budget | The splat is bound by the 16 fragment-texture default; packing the masks freed 3 slots. `createReceiverSunShadowNode(..., { textureHeavy: true })` still drops the world-cascade visibility texture on default-limit GPUs; lift it only after checking a 16-limit adapter |
| Atlas GPU init | `initTerrainAtlases` after textures load |
| Material composer | `material/createTerrainSplatMaterial.ts` |
| Per-frame lighting sync | `material/syncTerrainSplatLighting.ts` ← `rendering/worldLighting.ts` |
| DEV sliders | `dev/panel/devPanelTerrain.ts` → `material/applyTerrainDevUniforms.ts` — Stylize: hue-split mix, global sun/ground/shadow, per-biome palettes |
| Macro shadow caster | Play: the visible CPU-baked mesh (`configureMeshShadowCast`). GPU-displaced (editor) terrain does not cast |
| Grass surface Y | `createTerrainSurfaceHeightTsl` reuses splat `macroHeight` (same chisel Fns as the terrain material) |

Full page reload after `visualTuning.ts` terrain changes, atlas re-bake, paint-map upload, or terrain splat shader graph edits.

Splat shader gotcha: the per-layer atlas gradients (`biomeAtlasTileGrads`) must be `.toVar()`-pinned before the `If(weight > overlayEps)` gates in `biomeSplatShading.ts`. As bare expressions TSL emits `dFdx`/`dFdy` at first use, inside a gate, and the sand AO then vanishes wherever the other land layers have exactly zero weight: a hard, stair-stepped edge along the support of the 7×7 biome blur (blotchy sand against flat beige).

## Village subsystem (`src/world/village/`)

In the game the village is a **hamlet** that stays as founded until it is converted (see [docs/village/hamlet-quest.md](docs/village/hamlet-quest.md)); a DEV `?sandbox` visit keeps the older village that grows on its own around an authored `villageSeed` map entity (editor palette marker, singleton, DEV fallback `?villageSeed=x,z[,rotY]` on maps without one). Growth is **faith**-driven: a slow base rate, sped up by the orb's presence from Phase 1 (`state.phase >= 1`); Phase 0 villagers keep vigil at night. The sim can save and restore itself (`sim.serialize()`, `createVillageSim({ restore })`; see [docs/village/save.md](docs/village/save.md)); seeded RNG (`createVillageRngs`; its streams export and import their position).

Per-milestone detail (rules, config key names, events, save fields, DEV hooks, checks) lives in `docs/village/`: [economy](docs/village/economy.md) (M4), [hunger and graves](docs/village/hunger.md) (M5), [forest](docs/village/forest.md) (M6), [daily routine](docs/village/routine.md) (M7), [weather](docs/village/weather.md) (M8), [hamlet, belief and the conversion quest](docs/village/hamlet-quest.md) (M2), [arch II and builder powers](docs/village/arch-ii.md) (M9), [overview](docs/village/overview.md) (M3), [village save](docs/village/save.md). Tunables are in `src/config/village.ts`, which composes `src/config/village/{layout,life,economy,powers}.ts`.

| Concern | Where |
|---------|-------|
| Tunables | `src/config/village.ts` (`VILLAGE`, composed from `config/village/*.ts`) — pacing, planner, rings, faith, villagers, paths, wear, fields, economy, forest, hunger, powers (pure-sim, node-runnable); the game day is `config/clock.ts` (`GAME_DAY_S`); render look and instance budgets in `src/config/visual/village.ts` (`VISUAL.village`: capacities, rise-in, smoke and light schedules, terrain-mark tiles, villager draw distance and blob shadows) |
| Wiring | `VillageSystem.ts` (sim inputs, sub-stepped DEV time scale, events → bus `village:*` and view) → `render/VillageView.ts` (owns every draw) |
| Shared model | `model/` — pure types and keys used by sim, renderers and assets: `types.ts` (buildings, fields, villagers, events), `assetKeys.ts` (kit keys and per-type metadata), `seed.ts` (`VillageSeed`, `makeVillageSeed`) |
| Pure sim (node-runnable, explicit `.ts` imports) | `sim/` — `villageSim` (orchestration: founding, `update()` pipeline, planner passes) with `villageSimTypes` (state and stats types) and `villageSave` (serialize, restore, validation); `population` (roles incl. ambient woodcutters and fishermen, sex, beds, newcomers) + `workSpots` (where they stand: trees from the map's props, reachable shore cells of the site grid), `support` (fields and the well), `economy`, `hunger`, `graveyard`, `forest`, `faith`, `belief`, `blessings` (the milestone modules, see `docs/village/`), `planner` + `ringModel` (layout, below), `construction`, `siting` (footprint relief, seating a building on its level pad) + `pad` (the 2 m pad nodes and floor), `agents` (behaviour state machine; its types in `agentTypes`) + `agentTargets` + `agentMotion` + `routine`, `pathfind` (A*) over `walkGrid` (terrain, regions, effort flood), `pathiness` (wear to cost grid), `pathNetwork` + `pathGraph` + `pathTracks` + `pathGeometry` (paths, below), `wearField`, `geometry` (yaw transform, wraps, hash), `siteGrid` (`OCCUPANT` ids), `villageRng` |
| Layout | **Concentric rings** around the temple (`ringModel.ts`, `VILLAGE.RINGS`): ring `k` has a wobbling, terrain-elongated radius `radiusAt(k, θ)`, a capacity and a fill target. `planner.planOnRing` scores blue-noise spacing + a density field, faces doors toward the temple (jitter, ~8% turned), skips the main-road corridor and any site not walkable from the temple (`pathfind.regionOf`, `walkEffort`). Fields go beyond the outer ring (gaps between rings as fallback), the well on the plaza. Layout is a pure function of map heights + seed id |
| Paths | `sim/pathNetwork.ts` (nodes and painting in `pathGraph.ts`, searched field tracks in `pathTracks.ts`): **ring roads** follow the rings (`ringModel.roadRadiusAt`, midway between two rings of houses); ring 0 is the plaza loop, laid at founding. The main road runs from the temple door along its axis and grows ring by ring (`growAxisRoad` in `pathNetwork.ts`), ending just past the outermost ring with houses. A new building adds a node on its ring's road (joined to the angular neighbours along the road, `ARC_MAX_M`), a short stub from its doorstep, and, if that road is not yet connected to the temple, **radial lanes** inward ring by ring (extras with `RADIAL_P`); lanes slide along the ring to slip between houses. The planner keeps houses between their ring's road and the next (`planner.clearOfRoads`) and off laid lanes. Only field tracks and rare fallbacks are searched by A* (merging into existing paths, `AFFINITY.TRACK`). Everything is painted into the wear field with a permanent floor; foot traffic deepens it. Villagers mostly follow paths: per-journey affinity (70% followers, 30% cutters) over a pathiness grid, 60% of strolls aimed at paths (`PATHS.AFFINITY`, `WANDER_ON_PATH_SHARE`) |
| Kit | `assets/villageAssets.ts` registers the placeholder kit (`assets/placeholder/`, code-generated vertex-coloured meshes) and lays modelled GLBs from `public/models/village-kit/` over it (`assets/villageKit.ts`, loaded by the async `initVillageSystem`; metadata from glTF extras; one shared KTX2 trim-sheet atlas, graded in daylight by `VISUAL.village.KIT_LOOK`, live via `__pantheonVillage.kitLook`). Keys in `model/assetKeys.ts`. Sources and the Blender build scripts: `assets-src/village/` (`village_models.blend` is a merged snapshot of every model in one row; rebuild it after changing the scripts); pipeline and conventions: `public/models/village-kit/README.md` |
| Buildings | `render/buildingRenderer.ts` — stage meshes (`<type>_s0/1/2`) on `DynamicPropBatch`es over `buildDynamicPropLodGroup` (`mapProps/mapPropInstancing.ts`), so `updatePropLod`, prop materials and lighting are reused |
| Villagers | `render/villagerRenderer.ts` — one instanced draw per figure, role × sex (12 chunky Norse figures from `public/models/village-kit/villagers.glb`, 830 to 1,200 triangles each, built by `assets-src/village/villager_build.py` and converted by `assets/villagerKit.ts`; a figure missing from the GLB falls back to its placeholder in `assets/placeholder/villagerFigure.ts`; plain `Mesh` + `InstancedBufferGeometry`: `InstancedMesh` applies instancing *before* `positionNode`), all sharing the GPU rig in `villagerMaterial.ts` (rigid parts swung about their joints in the vertex shader; poses idle, walk, hammer, pray, carry, chop, hoe, fish; the tool shows only while working, the priest's staff except while praying; colour alpha = slot / 3 (`VillagerSlot`): skin, hair and tunic are tinted per villager from `variant` 0..255); soft contact shadows in `blobShadows.ts` (they do not cast into shadow maps). Roles: builder, priest, farmer, woodcutter, fisherman, idler; woodcutters and fishermen are ambient (no resource yet) and only exist when the map has trees or a reachable shore near the village (`VILLAGERS.WOODCUTTER_SHARE`, `FISHERMAN_SHARE`). Console: `__pantheonVillage.lineup()` stands every figure in a row, `people(role)` counts and locates them. Animation clips baked from Blender come later; the rig pivots (`VILLAGER_RIG`, mirrored in `villager_build.py`), part ids and slots are the interface |
| Terrain marks | `render/villageTerrainLayers.ts` — grass exclusion map (`grassSystem.propExclusionMap`), prop AO and the path channel (R) of the terrain overlay map, composed from a base snapshot + stamps + wear. The wear field reports changed **tiles** (`WEAR.TILE_CELLS`), and the layers compose and upload them per tile under a per-frame budget (`VISUAL.village.TERRAIN`); decay only dirties tiles whose visible value changes. Worn ground has **no hard edges**: the layers read `wear.sampleFeathered` (a cell keeps its value across the cell and fades over one cell beyond it, so one-cell paths keep their width) for the crisp core and `wear.sampleHalo` (a `WEAR.HALO_CELLS` tent blur, refreshed per dirty tile in `takeDirty`) for the skirt: dirt up to `PATH.HALO_MAX`, grass thinned by up to `GRASS.HALO_STRENGTH` (kept above the blade cull, so the skirt only shortens blades). Stamps use wide fades (`YARD.FADE_M`, `GRASS_FADE_M`). DEV terrain-AO re-bakes re-apply the village shade through `onPropContactAoRebaked`. No new terrain texture (terrain is at the 16-sampler budget) |
| Dressing | `render/dressingRenderer.ts` (field fences, site stockpiles), `render/wheatFields.ts` (marks each field as wheat in the grass data map, ripeness follows `Field.growth`), `windowGlow.ts` (additive `_glow` instance per lit building), `smokeRenderer.ts` |
| Shadows | Buildings are static casters: `shadowInvalidationBatcher.ts` limits only *its own* far + near invalidations to once per 1.5 s; the follow bake (`shadowFollowPose.ts`) still re-runs every frame the sun angle or the player moves; the world cascade re-bakes with the sun (10 Hz cap) |
| DEV | Dev panel **Village** section (`dev/panel/devPanelVillage.ts`, incl. ring fill and path stats), `window.__pantheonVillage` (`dev/runtime/villageProbe.ts`; `layout()` tables ring offset and door facing), `villageDevState.ts` |
| Headless checks | `npm run check:fast` runs every village check in parallel (`scripts/checks/run.mjs`); each is also a script of its own, `npm run check:village-<name>`: `kit` (kit geometry and budgets), `hamlet`, `economy`, `hunger`, `forest`, `routine`, `upgrades`, `golden` (hashes of `sim.serialize()` for several scenarios, `-- --update` after a deliberate change), and the slow `smoke` (`sim-smoke.ts [mapId] [x,z,rotY]`: multi-hour sim on real map heights: growth, determinism, overlaps, ring adherence, door facing, spacing, path connectivity, share of walking on paths; also a hostile-terrain stress seed; it prints a `state=` fingerprint per scenario, and behaviour-preserving refactors must keep those unchanged). `npm run tool:village-map -- <mapId> <outDir> [counts] [x,z,rotY]` writes a PNG of the layout at N buildings: hillshade, rings, wear/paths, doors, villagers |

Notes: the sim plans on the original ground (`createTerrainSampler` uses `sampleChiseledWorldYBase`) and seats every building on a level pad (`sim/pad.ts`, `planPad`): the floor `plinthTopY` is the mean ground over the 2 m detail nodes of every cell the footprint touches, `plinthBaseY` the lowest; the field names date from the old stone plinth. There is no plinth mesh: `render/terraformView.ts` + `render/terraformer.ts` level the terrain under each pad into the **2 m detail layer** (`terrain/cpu/fineDelta.ts`: offsets on a 4x finer lattice over a square of `VILLAGE.PLINTH.REGION_HALF_M` around the seed, border zero, original grids untouched). Pad nodes land exactly on the floor, a `SKIRT_M` skirt fades back, overlapping claims average by build progress. Progress drives it: fraction = foundation-phase `progress / WORK_S[0]`, 1 from stage 1 on; founded buildings are settled before the first draw. Each flush (4 Hz) rebakes the patch mesh, re-seats static map props (`resnapMapProps`) and dressing (`dressing.resnap`), invalidates grass blade heights (`GrassSystem.invalidateTerrainHeights`) and marks the shadow maps dirty. Changes to the plan or to who the villagers are re-baseline the fingerprints printed by `check:village-smoke` and the hashes in `scripts/checks/village/golden.json`. Shared GitNexus-critical symbols are **not** edited (`updatePropLod`, `commitGridTextureUpload`); village code only adds exports beside them.

## UI kit (`src/ui/kit/`)

Game UI is plain DOM (no framework). New screens build on the kit instead of injecting their own `<style>`; the principles and the screen-by-milestone table are in `story-mechanics/VILLAGE_ROADMAP.md` (UI section).

| Piece | Where and how |
|---|---|
| Tokens | `tokens.css`, linked from `index.html` so the loading screen is styled before any script runs: colours (rgb triplets so alpha is a per-use choice), type scale, spacing, radii, motion durations, z layers. Sizes are in rem: `--ui-scale` sets the root font size. High contrast and reduced motion are `:root[data-ui-contrast='high']` / `[data-ui-motion='reduced']` blocks that only override tokens. `screens.css` (page base, loading, map chooser, camera hint) and `hud.css` (energy bar, village line, story log) use the tokens; classes of the kit's own components are prefixed `k-` (`kit.css`; the DEV panel owns `.ui-panel`) |
| Layers | `layers.ts`: `#ui-root` with `hud`, `overlay`, `panel`, `modal`, `toast`, `tooltip` layers (z tokens). Mount UI with `getLayer(name)`; layers let clicks through, what you mount opts back in with `pointer-events: auto`. `getHudSlot('hints')` is the bottom-centre stack for quiet hint lines (`.k-hint`, `.k-hint--accent` sits above plain ones) so hints do not pick their own offsets |
| Panels and input focus | `panels.ts`: `openPanel({ id, title, content, modal?, pausesWorld?, onClose? })`; `pausesWorld` freezes the game while the panel is open (the game wires what that means once with `setPanelPauseHandler`, in `gameplay/setupSaving.ts`); `onPanelsChanged(cb)` says when any panel opens or closes (no polling). `button(text, onClick, { class?, ariaLabel? })` and `openConfirmPanel({ id, title, text, action, onConfirm })` are the kit's button and two-answer question. A modal panel dims the world, drops pointer lock, calls `setInputBlocked(true)` (`core/InputManager.ts`: held movement keys are cleared, new ones ignored) and its backdrop swallows clicks so the canvas cannot re-lock the mouse. Esc closes the top panel, Tab stays inside a modal, focus returns on close |
| Hotkeys | `hotkeys.ts`: every binding in one table (`registerHotkey(code, handler, label, { onUp?, whenPanelOpen? })`); `onUp` is for held keys (the radial menu's `Q`), `whenPanelOpen: false` for keys that open a screen (`T`, `J`, `E`); a second binding of a key warns in DEV. `O` opens Settings, `Esc` opens the pause menu (`gameplay/setupSaving.ts`) |
| Notifications, tooltips | `notify({ text, kind, priority, durationMs, key })` (rules in the pure `notifyQueue.ts`: 3 visible, same key merges into a counter, `durationMs: 0` is sticky); `attachTooltip(el, { title, body, inspect })` (300 ms hover delay, instant on keyboard focus, Shift shows `inspect`, placement in the pure `tooltipPlacement.ts`) |
| HUD visibility | `visibility.ts`: `createContextualHud(el, { base })` gives hidden / peek / persistent / expanded with quick fade-in and slow fade-out |
| Settings | `settings.ts`, `settingsModel.ts` (pure validation), `settingsPanel.ts`: interface size 80 to 150%, reduce motion, high contrast; per device in `localStorage` key `pantheon.ui.settings.v1` (never part of a save); first run follows the system's reduced-motion and more-contrast preferences |
| Icons, DOM helper | `icons.ts` (inline SVG, `currentColor`; an icon with a warning meaning always needs a word beside it), `dom.ts` (`h(tag, props, ...children)`); `hint.ts` (`createHint(content, { accent? })`: a quiet hint line with keycaps, mounted in the `hints` slot) |
| DEV, checks | `window.__pantheonUi` (`dev/runtime/uiProbe.ts`: `openSettings`, `notify`, `settings`, `update`, `hotkeys`); `npm run check:ui` runs `scripts/checks/ui/kit-check.ts` on the pure rules (queue, placement, settings). The DOM parts are checked in the browser |

## Save system (`src/save/`)

Plain TypeScript with no DOM except the IndexedDB store, the autosave triggers and the play clock. The milestone is M0 in `story-mechanics/VILLAGE_ROADMAP.md`, which also has the design: what is saved and what is rebuilt.

| Piece | Where and how |
|---|---|
| Snapshot | `snapshot.ts`: `SaveSnapshot { version, savedAt, playSeconds, mapId, summary, profile, village }`; `profile` and `village` are plain structured-clone data (typed arrays are fine, functions are not) that each system fills with its own slice. `parseSnapshot(raw, { mapId })` accepts a stored value or refuses it as `corrupt`, `newer-version` or `other-map`, with a message for the player |
| Versions | `SAVE_VERSION` in `snapshot.ts`; `migrate.ts` holds `MIGRATIONS[n]` (version n to n + 1) and is **empty on purpose**: the game is in development and nobody has saves worth keeping, so changing the shape of a save means bumping the version and nothing else (no migration, no fallback for a missing field); an older save is refused as `too-old` ("This save is from an older version of the game and can't be opened."). The chain stays for the day a released game needs it. Version 6 added the village's wood and food stock, version 7 hunger, the graveyard and `Villagers.dying`, version 8 the forest, version 9 the meals (`economy.round` and `missed`, `Villagers.done`), version 10 arch II and the builder powers (`SkillsState.villageOpened`/`faithSparks`, `ProfileState.powers`, `VillageSimState.blessings`) |
| Slots | `slots.ts`: `auto-a` and `auto-b` take turns (the last two autosaves are kept), `manual-1` to `manual-3` are the player's. `SlotMeta` is the slot list's line (day, population), stored beside the save so listing never reads one |
| Store | `store.ts`: `SaveStore` (`list`, `read`, `write`, `remove`). `createIndexedDbStore()` keeps a `meta` and a `data` object store in database `pantheon-saves` and writes both in one strict-durability transaction, so a failed write (quota, a value that cannot be cloned) leaves the previous save of that slot untouched; a failed open is retried on the next call. Errors are `SaveError` with a `code` (`unavailable`, `quota`, `failed`). `createMemoryStore()` is the same contract for tests |
| Service | `saveService.ts`: `createSaveService(store, { mapId })` gives `save(slot, parts)`, `autosave(parts)` (older autosave slot), `load(slot)`, `loadLatest()` (Continue: newest slot that loads, with the slots it passed over listed in `skipped`) and `remove`. It refuses to write a snapshot it would not load back |
| Profile slice | `profile.ts`: `ProfileState` is the save's `profile` (game state, day-cycle and reveal state, player position, camera yaw and pitch, picked-up orbs by position, the wind and fixed-step clocks). `captureProfile` copies it, `parseProfile` is strict (a damaged part names itself and the whole save is refused), `applyGameProfile` edits the live `state` in place. Each owner exposes its part: `DayCycleContext.serialize/restore`, `OrbSystemContext.serialize/restore` (orbs match by position within 0.5 m, so editing the map between saves does not break a save), `FrameTick.getClocks` + `initialClocks`, `initCameraInput(canvas, yaw, pitch)` |
| Boot | **Loading is booting**: the page starts over and applies the save while it builds, nothing is torn down in place. `main.ts` reads the save right after the map loads (`bootSave.ts`: `loadBootRestore`, which refuses a save the map or build cannot continue from via `gameSnapshotProblem`: damaged profile, a village from another seed, a different grid or ring count, a village on a map that has none) and then applies it in build order: game state, player and camera start pose, orbs after the world, village (`initVillageSystem({ restore })`, shown by `view.showFounded()` exactly like founding: every building at its saved stage and progress, pads levelled, no rise-in), day cycle after `initDayCycle`, clocks in `createFrameTick`. A save that fails to load starts a new game with a toast; a village that fails to restore stops the boot with an error rather than mixing the two |
| Launch | `saveRequest.ts` `resolveLaunch(search, dev)`: a visit either carries a request in its address or shows the **start screen**. `?new` or `?save` = new game with autosave, `?load=latest` or `?load=<slot>` = continue (and autosave), `?start` = the start screen. A **DEV build's plain visit skips the start screen** and never saves (reloading while developing stays instant and cannot touch a save); a production build always shows it. `startScreenUrl` and `loadUrl` build the addresses the menus navigate to (loading a save reloads the page). In production the game starts in `DEFAULT_PLAY_MAP_ID` (island-mountain); only a DEV build offers the map chooser |
| Autosave | `gameSave.ts` `createAutosaver`: every 5 minutes, when the tab is hidden and on `pagehide` (the state is captured synchronously before the page is taken down; the IndexedDB write that follows is best effort once the page is going away; at most one automatic save per 5 s). `onStart`/`onSaved`/`onError` drive the indicator and toasts. The play clock stops while the game is paused or the tab hidden. `navigator.storage.persist()` is asked for when saving is on |
| DEV | `window.__pantheonSave` (`dev/runtime/saveProbe.ts`): `save(slot)`, `autosave()`, `list()`, `read(slot)`, `load(slot \| 'latest')` (reloads with `?load=`), `newGame()`, `startScreen()`, `pause(open)`, `wipe()`, `capture()` (what a save would hold now), `restored()` |
| Screens (`src/ui/saves/`) | Built from the kit, styled by `saves.css` (tokens only). **Start screen** (`startScreen.ts`): sits in the overlay layer so the kit's panels open above it; Continue (newest save, with its day, villagers and age shown under the buttons), Load game, New game (asks first when saves exist), Settings; if storage cannot be read it says so and a new game does not save. **Slot lists** (`slotPanel.ts`, panels `slots-save` / `slots-load`): rows come from the pure `save/slotView.ts` (autosaves newest first and only when they exist, then three numbered slots; times in the player's local time). A used slot asks in its own row before it is replaced, loaded over or deleted (numbered slots only). `openConfirmPanel` is the generic question. **Pause menu** (`pauseMenu.ts`, panel `pause`): Resume, Save game, Load game, Settings, Quit to start (saves first; stays if that fails); opening it calls `GameLoop.setPaused(true)`, which stops fixed steps and passes a frame time of 0 to `render`, so the world and the play clock stand still while the frame keeps drawing. **When it opens** (`ui/pauseRules.ts`): Esc with the mouse free, or the mouse lock being lost with no panel open (the browser swallows Esc while locked, so the page only sees the lock go; this also covers alt-tabbing away). **Temple** (`templeSave.ts`): within the temple's footprint plus 14 m a hint "Press E to save" fades in and `E` opens the save list (hotkey `KeyE`). **Indicator** (`autosaveIndicator.ts`): "Saving" in the bottom right for at least 1.2 s per write |
| Village slice | `VillageSimState` (`world/village/sim/villageSim.ts`, serialization in `villageSave.ts`) is what the save's `village` holds; `sim.serialize()` copies it and `createVillageSim({ ..., restore })` continues from it instead of founding. **A new piece of sim state that later steps depend on must be added to `VillageSimState`**; `npm run check:save-village` fails when something is missing. What each module saves and the version history: [docs/village/save.md](docs/village/save.md) |
| Check | `npm run check:save` runs `scripts/checks/save/save-check.ts` (validation, migration chain, slot rotation, service on a memory store); `npm run check:save-village` runs `scripts/checks/save/village-save-check.ts` (about 80 s: a village saved midway and restored must end identical to one that ran straight on, `quick` runs one case). The IndexedDB store needs a browser: it was exercised in headless Chromium |

## Skills and abilities (`src/skills/`, `src/abilities/`)

The milestones are M1 and M1b in `story-mechanics/VILLAGE_ROADMAP.md`. Rules are pure and run in node; the runtime files are the only ones that touch the game.

| Piece | Where and how |
|---|---|
| Tree | `skillTree.ts`: `SKILL_NODES` (arch I: Resonance, Presence, Echo, Surge, Dream, Sign, Attunement, Renewal; arch II is in [docs/village/arch-ii.md](docs/village/arch-ii.md); each has `arch`, `x`/`y`, `cost` in sparks, `ranks`, `requires` (all must have a rank), per-rank `effects`, optional `ability`). `SkillsState { opened, sparks, ranks, villageOpened, faithSparks }` is plain data; `canUnlock`, `unlock`, `respec`, `openTree`, `grantSparks`, `excludes` (exclusive keystones), `modifiersOf`, `grantedAbilities`, `treeProblems`, `parseSkills` all return new values and never change their input. Respec is free (a decision, not a gap) |
| Modifiers | `modifiers.ts`: one shared `modifiers` record (orb reach and light, energy cap and regeneration, the faith trail, and the village's rule changes from arch II: see the interface for the full list), neutral (1 or 0) until a node changes it. Readers: the orb's pickup radius (`energyOrb.ts`), the player light (`PlayerController.ts`), the energy cap (`skillRuntime.ts`), `orbFaithTrail` (Echo) in `gameplay/progression.ts` (each orb picked up adds that much faith to the village, `village.addFaith`), and the village sim, which reads the record live (`createVillageSim({ modifiers })`). **Game code reads `modifiers`; it never asks which node set a value** |
| Runtime | `skillRuntime.ts` `initSkills(initial?)`: holds the state, applies it (`setModifiers`, `state.energyCap` = base + `energyCapAdd`, clamping the energy), opens the tree once when `memory:trigger` brings the Aethon memory (the energy cap, with `FIRST_SPARKS` = 2), and emits `skills:opened` and `skills:changed`. The cap reveal is latched, so spending energy or lowering the cap never undoes the sunrise |
| Abilities | `abilities.ts`: `AbilityDef { id, name, arch, cost { energy, faith }, cooldownSec, targeting }`; `ABILITIES` holds Murmur, Dream and Sign and the five builder powers (`grantedWithVillage`, see [arch II](docs/village/arch-ii.md)); `abilityById` looks one up, `armHint` is the line shown when a builder power is armed; `drainPerSec` makes a channel (it needs that much energy to begin) and `grantedAtOpen` gives a power with the tree (Murmur). `caster.ts` `createAbilityCaster(deps)`: `cast` checks granted, cooldown, energy, faith and target, then performs, pays and starts the cooldown (an effect that rejects its target costs nothing); `update(dt)` runs cooldowns and is called from the fixed step in `gameplay/initGameplay.ts`, so a paused world holds them. `abilityRuntime.ts` `initAbilities(skills)` wires it to `energy.ts` and emits `ability:cast`; what powers do is hooked in once with `setPerformer` (`initGameplay` passes `powers.perform`); `ABILITY_IDS` names the shipped powers |
| Save | The profile's `skills` slice (`SkillsState`, parsed by `parseSkills`). Cooldowns are saved in the `powers` slice (`ProfileState.powers`) |
| DEV | `window.__pantheonSkills` (`dev/runtime/skillsProbe.ts`): `state()`, `modifiers()`, `energy()`, `energyCap()`, `setEnergy(n)`, `unlock(id)`, `canUnlock(id)`, `respec()`, `grantSparks(n)`, `radialOpen()`, `yaw()` |
| Screens (`src/ui/skills/`, `src/ui/abilities/`) | Built from the kit, styled by `skills.css` and `abilities.css` (tokens only). **Tree panel** (`skillPanel.ts`, modal panel `skills`, title "The Void"): the constellation is drawn by `constellation.ts` (nodes as real buttons plus one SVG for the lines) into the layer of `panZoomViewport.ts`; the panel updates itself from `skills:changed`, two tabs (The Void, The Village) swap the content in place; drag pans, wheel and the +/− buttons zoom, Centre resets; hover (or Shift) shows the kit tooltip; a click that is refused says why in a toast; Respec asks first. It opens with `pausesWorld` (the same freeze as the pause menu). What nodes look like and say, the edges and the pan/zoom maths are the pure `skills/skillView.ts`. **`skillUi.ts`**: `T` opens the panel once the tree exists; the "N sparks to spend · T" line shows while sparks are unspent; the first opening happens by itself after the Aethon memory has finished showing (`story:fragmentEnded` from `StoryLog.ts`), waits for any open panel, and falls back to 20 s after `skills:opened`. **Ability bar** (`abilityBar.ts`): bottom right, one slot per granted power with cost, a cooldown sweep and a word when it cannot be cast; hidden with no powers. **Radial menu** (`radialMenu.ts`, geometry in `abilities/radial.ts`): hold `Q` while the mouse is locked; mouse movement moves a virtual pointer (the camera does not turn: `CameraInputContext.setLookBlocked`), releasing `Q` casts the chosen sector, Esc or losing the lock or the window cancels. Both read an `AbilitySource` (`list()`), so a test power can drive the same code. Casts aim at the orb's own position until target picking comes with the first power (M2) |
| Conversion powers and quest | Murmur, Dream, Sign, the conversion quest and the world markers: [docs/village/hamlet-quest.md](docs/village/hamlet-quest.md) |
| Shrines and regeneration (`src/entities/shrine/`, `src/gameplay/energyRegen/`) | Map entity `shrine { x, z, radiusM?, regenPerSec? }` (several allowed; defaults `PHASE0.SHRINE`: 12 m, 0.5/s; move-only in the editor, marker = stone plus a ring at the zone radius; `collectShrines` in `MapEntitySpawner.ts`, `world.shrines`). `regen.ts` (pure): `zoneRateAt` (the best zone containing the orb, zones never stack), `regenRate` = zone rate only with Attunement (`modifiers.shrineAttuned`) + Renewal's `flatRegenPerSec`, `regenStep` (never above the cap). `energyRegen.ts` is the one tick (fixed step in `gameplay/initGameplay.ts`, so a paused world does not regenerate) and emits `energy:regen` for the HUD's "+0.5/s" mark beside the bar (0 when full). `shrineZones.ts` (in `entities/shrine/`) draws a faint additive ring on the terrain at each zone's edge that brightens while the orb stands in a zone it can use. Attunement (1 spark, no prerequisite) and Renewal (1 spark, needs Attunement) are in the tree |
| Orb respawn (`src/entities/energyOrb/`) | A rule, not a skill: once the tree has opened (`skills.state().opened`) picked-up orbs return. `respawn.ts` (pure): `stepRespawn` clock (240 s, runs only while the tree is open, a slot is free and fewer than `MAX_LIVE` (12) are alive, otherwise it stays full), `pickRespawnSpot` (walkable, 40 m from the player, 25 m from live orbs, out of keep-clear discs, half the tries 30-120 m around a shrine), `respawnEnergy` (3-7), `retrySoon`. `orbSystem.ts` owns the `respawn` alea stream and clock; `configureRespawn` is called from `gameplay/initGameplay.ts` (walkable = above water + `PHASE0.RESPAWN_PLACE.WATER_CLEARANCE_M` and ground normal at least 0.9; the village disc plus 15 m is kept clear). `EnergyOrb.respawn(...)` brings a slot back at a new place; a respawned orb does **not** add to `state.orbsAbsorbed` (that drives the night lightness). Tunables: `PHASE0.RESPAWN` |
| Orb save | `OrbsState { absorbed (home places of slots with no live orb), relocated (live orbs at a respawn place: home, place, energy), respawn { remainingSec, rng } }`. Slots are named by their home place on the map, so a map edited between saves still matches (new slots start fresh, removed ones are dropped). |
| DEV (orbs) | `window.__pantheonOrbs` (`dev/runtime/orbProbe.ts`): `total()`, `liveCount()`, `live()`, `absorb(n)`, `respawnOne()`, `clock()`, `config()`, `setInterval(s)`, `setMaxLive(n)`, `regenRate()`, `inActiveZone()`, `zones()`, `ringMeshes()` |
| Checks | `npm run check:skills` (tree data, unlock and respec rules, modifiers, parsing, the panel's node status, tooltips and pan/zoom maths), `check:abilities` (the cast pipeline, the radial geometry, the ability bar's rows), `check:energy` (regeneration, respawn), `check:quests`, `check:powers`. Checks share `scripts/checks/lib/check.ts` (`check`, `finish`, `expectParses`/`expectRefuses`), `saveFixtures.ts` (fake save sources, `rawProfile`) and `villageHeadless.ts` (`loadMap`, `makeSim`, `simulate`). The wiring and the screens (opening at the cap and after the memory, `T`, the frozen world, unlocking, tooltip, pan and zoom, respec, the bar, the radial menu with a real pointer lock) were exercised in headless Chromium |
| Arch II, The Village (M9) | The second tree, its exclusive keystones, the builder powers and the overview bar: [docs/village/arch-ii.md](docs/village/arch-ii.md) |

## Village overview (`src/overview/`, `src/ui/overview/`)

Milestones M3 and M3b in `story-mechanics/VILLAGE_ROADMAP.md`. Press `B` within `PHASE0.OVERVIEW.REACH_M` of the temple, once the village is converted: the camera lifts to a fixed view, the mouse is freed, the orb becomes the cursor; clicks select villagers, buildings and fields (non-modal info panel), and arch II's builder powers are cast from here. Maths (`overviewMath.ts`), picking (`overviewPick.ts`) and the panel text (`overviewDescribe.ts`) are pure; the controller (`overviewController.ts`) owns the camera and input. Details, DEV hooks and checks: [docs/village/overview.md](docs/village/overview.md).

## 3D assets (`public/models/` and `public/textures/`)

- Add assets directly under **`public/`** — the game loads from there only (see `src/assets/assetManifest.ts`, `collectAssetLoadJobs()`).
- **3D layout:** `public/models/{family}/` — self-contained `.glb` per prop (KTX2/`KHR_texture_basisu`; bake with `npm run bake:play-props`). Emits lod0 as `Name.glb` plus `Name_lod1.glb` / `Name_lod2.glb` (mid/far: simplify + textures ≤1024/512). Packs use `scene.glb` + `scene_lod1/2.glb` (e.g. `stone-pack/`). Catalog keys in `src/assets/assetManifest.ts`; shadow casters in `src/world/mapProps/config/propShadowKeys.ts` (trees, rocks and structures cast; the LOD bands that cast are `VISUAL.props.lod.shadowCastMaxLod`). Play loads only the prop keys its map places (`runPlayAssetBatch(…, assetKeys)` → `loadAllAssets(…, keys)`); the editor still loads the whole catalog.
- **Terrain textures:** sources are `assets-src/terrain/{biome}/` (PBR maps from Poly Haven, ambientCG, etc., scanned by filename; **not** under `public/`, so they never ship). Play and the editor load the pre-baked `color.ktx2` (+ `ao.ktx2` in play) from `public/textures/terrain/atlases/`; editor biome thumbnails are `public/textures/terrain/thumbs/`. Rebuild all with `npm run bake:terrain-atlases`.
- **Map grid sidecars:** `public/maps/{id}.*` — `height.f32`, `biome.u8`, `heightBase.f32` (editor only; play does not fetch it) and `terrainAux.u8` (authored convex ridge, one byte per cell). Older maps with a packed `terrainAux.rgba8` still load (A channel is read) and migrate with `scripts/migrate-terrain-aux-r8.ts`.
- **Environment textures:** `public/textures/environment/` (`night-sky.exr`, shipped 4096×2048 — rebuild with `npm run bake:night-exr`).
- **Grass textures:** `public/textures/grass/` (`noise-atlas.ktx2` wind/bake atlas, `edelweiss.ktx2` flower sprite — rebuild with `npm run bake:grass-ktx2`).
- **Decoders (self-hosted, committed):** `public/basis/` (KTX2/Basis transcoder) and `public/draco/gltf/` (Draco) are checked into the repo and served statically. Refresh from the installed `three` package with `npm run tool:sync-decoders` after upgrading `three` — no CDN. `loadAllAssets(renderer)` requires `renderer.init()` first so `KTX2Loader.detectSupport` can run; shared helper: `src/assets/createKtx2Loader.ts`.

### Asset bake pipeline (play)

Offline scripts produce the compressed files play loads (no runtime Basis encode, no PNG fallbacks):

| Command | Output |
|---------|--------|
| `npm run tool:sync-decoders` | `public/basis/`, `public/draco/gltf/` from `three` |
| `npm run bake:night-exr` | `night-sky.exr` → 4096×2048 (needs `hdrify`) |
| `npm run bake:grass-ktx2` | grass `.ktx2` (needs source PNGs restored if deleted; `toktx`) |
| `npm run bake:play-props` | walks `.gltf` inputs → lod0 `.glb` + `_lod1`/`_lod2` siblings + strip sidecars; or `--from-glb` to emit mid/far from existing lod0 GLBs (needs `@gltf-transform/cli` via npx + `toktx` for full bake) |
| `npm run bake:terrain-atlases` | `assets-src/terrain/` → `public/textures/terrain/atlases/color.ktx2` + `ao.ktx2` + `thumbs/*.jpg` (needs `sharp` + `toktx`) |

Requires [KTX-Software](https://github.com/KhronosGroup/KTX-Software) `toktx` on PATH for grass/terrain/prop KTX2. **Full page reload** after replacing anything under `public/`.

## Map editor (DEV)

- **Entry:** `editor.html` → `createEditorSession()` in `src/editor/core/EditorSession.ts` (WebGPU, same stack as play mode). Dual-dock chrome lives in `src/editor/ui/shell/EditorShell.ts`.
- **Tools:** Document bar (map list, New/Import/Duplicate, Undo/Redo, View, Save), left tool rail (Sculpt / Paint / Place + sub-modes), contextual library (biomes or assets), properties dock, status bar. Place has **Single** (drag-drop, select, gizmo), **Brush** (`src/editor/tools/PropBrushTool.ts`: shift+click mix, LMB scatter, Shift+LMB erase), and **Fill**. Map save/load lives in `src/editor/document/EditorMapDocument.ts`.
- **Save:** Toolbar Save or Ctrl+S; first save prompts for map id. Writes via `MapIO.saveMapToProject` / `vite/mapDevApiPlugin.ts`. Restart dev server after plugin changes.
- **Validation:** Shared `src/map/validateMapPayload.ts` (client + save API). Entities: `map/authoring/mapEntityCatalog.isValidMapEntity`.
- **Markers:** palette group `markers` holds the energy orb, player start, village seed (singleton) and **shrine** (several; move-only; the marker is a stone plus a ring draped on the terrain at the zone radius, pinned so picking and the gizmo use the stone only). Radius and regen rate are edited in the map JSON (`radiusM`, `regenPerSec`).
- **New maps:** `createEmptyMapGrids()` — flat height, Shore biome; no procedural bake.
- **Reload:** Full page reload after changing `WORLD.SIZE` / `WORLD.SEGMENTS` in `src/config/world.ts` or `VISUAL.terrain.chisel.stepM`. Map switch reloads grids in-session via `placeMode.rebind` (`createEditorPlaceMode`).
- **Docs:** `story-mechanics/MAPS.md` for authored map schema and play catalog.

## Workflow rules

1. **Full page reload** after changing the play map, `phase0.ts`, `visualTuning.ts` / `config/visual/*` that re-seed materials or instance counts, anything under `public/` assets (models / textures / decoders), or anything that re-seeds map prop instancing / height samples. HMR is not enough for map terrain regeneration or sparkle capacity.
2. **Play maps:** Runtime always loads `public/maps/{id}.json` from manifest (or `?map=id`). No procedural play island. Editor new maps start blank (`createEmptyMapGrids`: flat height, Shore biome). Future multi-region travel: `story-mechanics/MAPS.md`.
3. **Shader warmup:** `compileAsync` runs after the world is built — expect first-frame cost if you add many new materials; keep dev meshes in-scene when profiling.
4. **DEV-only code** must stay behind `import.meta.env.DEV` (dev panel, GPU logs, shadow debug).
5. **Minimize scope** — match surrounding patterns; avoid unrelated refactors.
6. **Commits** — only when the user explicitly asks.

## Color pipeline

Play-mode pixels: scene HDR → god rays → bloom add → **AgX** (`uExposure`) → optional **SMAA** (working-color silhouette resolve) → **renderOutput** → **procedural grade** → **LUT** (delta-blend) → DoF → optional **FXAA** (full-frame for FXAA method; CoC-gated cleanup when SMAA + DoF) → optional **FSR1** upscale. Default AA is SMAA (`VISUAL.render.aaMethod`); whole-screen upscaling is off by default (`VISUAL.render.upscaling`, scene pass at `resolutionScale` 0.67 when on, DEV panel toggles it). Water reflections are independent: the planar reflector already renders at `VISUAL.water.resolutionScale` (0.33 max, adaptive down to `adaptive.minScale` 0.15 by coast distance and view) and the GPU bilinear-upsamples it when the water is drawn. Renderer uses `NoToneMapping`; tonemap/grade run only in `postfx/createPostFxPipeline.ts` (`outputColorTransform = false`).

Per-frame sync: **`syncAtmosphere`** (`postfx/syncAtmosphere.ts`) — single entry from `gameTick.ts` after night HDRI weight:

1. `applySkyForReveal` — Preetham atmosphere + `setAgxExposure` / `setSkyExposure` from `sampleLighting`
2. `setBloomSkyReduceFromSun` — sky bloom mask reduce + scene bloom weight (`goldenHourT`)
3. `setGodraysFromSun` — shaft weight (intensity × elev ramp × `goldenHourT`)
4. `samplePostFxGrade` — noon/golden sat/contrast/warmth (+ LUT strength; LUT enable independent of grade)
5. `setValleyFogFromSun` — fog tint + night-valley master + DEV isolate valley fog / distance haze

| Signal | Owner | Applied to |
|--------|-------|------------|
| AgX exposure | `sampleLighting().globalExposure` ← `VISUAL.sky.exposureCurve` | `postFX.setAgxExposure()` |
| Sky brightness | `sampleLighting().skyExposure` | `sky.setSkyExposure()` |
| Bloom tunables | `VISUAL.bloom` | bloom node + sky mask depths/luma |
| Sky bloom reduce | `skyReduceForElevation()` | read-only in dev (elevation-driven) |
| Golden-hour weights | `goldenHourT` ← `VISUAL.sky.cycle.goldenHourPower` | bloom `SCENE_WEIGHT_*`, god rays `WEIGHT_AT_*`, grade, terrain palettes, clouds |
| Haze tint | `hazeStrengthForElevation` (same night master) | valley fog color (not orb `daylightFactor`) |
| Haze night master | `hazeStrengthForElevation` (`clearElevationDeg` / `cyclePower`) | `uFogMaster`; aerial live = `aerialStrength × mix(aerialNightMul, 1, 1 − master)` |
| Procedural grade | `VISUAL.postfx.grade` | after `renderOutput`, before LUT |
| LUT | `VISUAL.postfx.grade.lut` or DEV picker | after procedural grade, delta-blend strength |

Elevation envelopes (sun °) share shape, not endpoints — full table in `src/config/visual/atmosphere.ts`. Short form: HDRI fade −5°→15°; god-ray ramp −1°→8°; haze night master −5°→30° (`cyclePower` 1.4); lighting / `goldenHourT` peak 58° (`goldenHourPower` 1.4). HDRI `horizonDim` is luma; day haze `skyHorizon*` is aerial fog-tint mix; night sky uses valley-slab volume.

**Config:** noon AgX is `VISUAL.sky.exposureCurve.groundHigh` (`SKY_EXPOSURE_CURVE` in `config/visual/sky.ts`). `VISUAL.sky.day` holds Preetham params only (no exposure field).

**DEV tuning:** exposure → **Sky → Day cycle** (AgX low/high, Sky exp low/high, golden-hour sharpness); glow → **Glow & bloom** (particles nested under **Particles → Guide line / Player**); orb volume → **Look → Orb**; grade/LUT → **Post FX → Grade**; haze cycle + clock (`dayT` / `goldenHourT` / haze master) → **Distance haze**. Use **Other / Presetpro** display creative LUTs. Vendor log LUTs (Sony, Arri, …) need a log shaper (not wired).

## Rendering notes

- **Bloom:** Single scene pass; emissive/glow via HDR `colorNode` — no MRT (Chrome-safe). Sky bloom attenuation: `postfx/bloomSkyMask.ts`, tunables in `VISUAL.bloom`. Player/guide/energy-orb sparkles and the organic orb rim use the same HDR path (`uHdrBloomScale` in `glowMaterial.ts`).
- **God rays:** Screen-space occlusion shafts (`postfx/godrays/GodraysRadialNode.ts`) — radial scatter toward the sun’s screen UV. Emitter is a sun disc (`VISUAL.godrays` core/radius); sky is cleared far-plane *view distance* only so distant trees occlude. No per-pixel dither (that stippled the shafts); a 5-tap Gaussian on the half-res RT smooths sample rings. Additive composite in `pipelineComposite.ts` (not mix-to-tint). After shader warmup, **stay wired** (`effectGraphBypass` never auto-disconnects) so dawn does not rebuild the post graph; weight 0 at night skips the half-res pass (`skipPassesWhenWeightZero` in `godraysControls.ts`). DEV sliders: **Light shafts / god rays** (defaults in `visualTuning.ts` → `VISUAL.godrays`). Isolate with Perf **Disable god rays** vs **Disable valley fog** / **Disable distance haze**. Full page reload after shader-graph change.
- **Color grading:** Procedural grade (saturation/contrast/lift/warmth) after `renderOutput`, before LUT — `postfx/postGrade.ts` (`applyProceduralPostGrade`). Sat/contrast are one noon→golden pair (`goldenHourT`). Lift and warmth tint are live uniforms. Display creative LUT with delta-blend strength (`applyLutGrade`) — default `Other/Presetpro - Elite Chrome.cube`; LUT enable is independent of Grade enable. DEV **Post FX → Grade** LUT picker. Render debug **Disable grade** bypasses both. DoF bokeh stays on energy (`dofReveal.ts`).
- **Distance haze:** Two terms on `scene.fogNode` (`atmosphereSystem.ts`, Three.js `webgpu_custom_fog`), combined `1-(1-day)*(1-night)`. Day: camera-XZ `smoothstep(aerialStartM, aerialEndM)` × live aerial (`aerialStrength × mix(aerialNightMul, 1, 1 − night master)`). Night: Y-slab volume (`heightSlabFogTsl.ts`) × `hazeStrengthForElevation` (−5°→30°, `cyclePower` 1.4) × inland fade (metres from ocean via map-edge flood; inland lakes stay in the pool). Tint follows the same night master (not orb-lifted daylight). Under `fogTop` (including below `fogBase`): surround veil `fadeHeight^valleyObscurePower × beer(τ)` on horizon/zenith; look-down uses path. Ridge is path-only. Caps: `valleyRayMaxM` / `valleyAmbientM`. SkyMesh / night HDRI stay `fog = false` and mix the same terms (`applySkyHorizonHaze`); HDRI intensity before fog mix (`scene.backgroundIntensity` stays 1). Clouds `fog = false`, night term × `hazeMix`. Water `setupFog` × shore bypass (foam is albedo). Play never detaches `fogNode`. DEV **Distance haze** + Perf **Disable valley fog** / **Disable distance haze**. Editor omits aerial and keeps `fogNode` (preview zeros/restores `uFogMaster`, night tint). Full page reload after slab shader-graph change.
- **Depth of field:** `DepthOfFieldNode` in `postfx/createPostFxPipeline.ts` (after LUT). Auto-focus on player; bokeh scales with energy (8 at 0% → 0 at 100%, `postfx/dofReveal.ts` / `VISUAL.dof`). At daytime bokeh 0 the half-res pass is skipped and the graph mixes to live sharp color; the 8→0 ramp stays smooth via the energy lerp. Blur runs at half-res — SMAA runs before DoF; CoC-gated FXAA after when DoF is active (in-focus stays sharp). Graph rebuilds **rebind** the existing DoF node (`dofControls.rebindSharp`) instead of disposing it — avoids a cleared RT flash at sunrise. Input RGB is clamped (`DOF_INPUT_RGB_MAX`). DEV: **Depth of field** + Render debug **Disable DoF**.
- **Sky:** Night EXR from `VISUAL.sky.nightHdri.path` (`rendering/sky/hdri/`); fades on sun elevation (`nightHdriBlend.ts`). Night HDRI intensity is applied in the background node **before** valley fog mix (`scene.backgroundIntensity` stays 1) so in-valley sky fill is not crushed. Preetham `SkyMesh` in `rendering/sky/SkySystem.ts` with independent `uSkyExposure`. All lighting signals from `rendering/sky/lightingCurves.ts` keyed on `sunRevealState.elevationDeg`. Post-reveal looping midnight→midnight cycle in `core/reveal/DayCycle.ts` + `rendering/sky/sunCycle.ts` (elevation + azimuth). Sun direction from `sunSpherical.ts` (`sunRevealState.azimuthDeg`).
- **Shadows:** Sun/ambient intensity from lighting curves + day cycle (energy-gated). Ground receive uses near PCSS inside the follow ortho and far Vogel beyond a light-view edge fade (`createReceiverSunShadowNode`). Handoff is a Chebyshev `mix` — TSL `If` around those samples draws the ±32 m ortho as a dark square. LOD2 grass already skips near (`createFarOnlySunShadowNode`). Cloud-cast `min`s on every ground pixel so the 32 m square keeps overhead umbras. Follow target is player XZ **and terrain Y**. Terrain painterly umbra is `mix(unlit, lit, (N·L)×sunVis)` in `terrainStylizeLightingTsl.ts` (one splat `uShadowFloor`). Play terrain casts from the visible CPU-baked mesh. Main/far sun map feeds cloud mesh receive + ground beyond near. Soft cloud-cast umbras are a separate map (`cloudCastShadow.ts`). Cloud cast follow runs in `gameTick.ts` when `sun.intensity > 0`. Beyond the ±200 m far map receivers read the **world cascade** (`worldCascadeShadow.ts` + `worldShadowVisibility.ts`): a whole-map map re-baked with sub-texel Halton jitter, resolved at the terrain surface of a fixed world-XZ grid and blended 1/N per bake into an RG texture (R full visibility, G casters the near/far maps clip). Never sample its depth map directly; its sun-rotated grid makes thin casters pop. **Shadow dev hooks:** DEV **Shadows → World cascade** (tuning, View modes, freeze/re-bake, bakes/s), `window.__pantheonWorldShadow` (get/set/reset/freeze/invalidate/view), `window.__pantheonShadowProbe()` (CPU ray-march from the player toward the sun: does a shadow have a real occluder?), `window.__logShadowDebug()`; installed from `dev/runtime/shadowProbes.ts` and `rendering/debug/shadowDebugLog.ts`. At night the sun is off; ambient uses `lightingCurve.nightDaylightFloor` plus `VISUAL.sky.worldLightness` (orb-absorbed lift). Local fill is the player point light.
- **Map props:** GLB instancing in `world/mapProps/` with distance-banded mesh LOD (`mapPropLod.ts`, `VISUAL.props.lod`; bake emits `_lod1`/`_lod2` via `npm run bake:play-props`). Wrap/hemi foliage lighting in `mapProps/tsl/mapPropShadingTsl.ts`. Casting is per asset family (`propShadowKeys.ts`: trees, rocks, structures) and per LOD band (`VISUAL.props.lod.shadowCastMaxLod`). Prop materials beat the grass depth bias (0.45 m pull toward the camera) in the vertex stage via `material.vertexNode` (`VISUAL.props.vertexDepthBias`; `false` restores the old per-fragment `depthNode`, which disables early-Z); `positionWorld` stays the true position. Village buildings opt out (`largeFaces` of `createMapPropNodeMaterial`, set by `villageMaterials.ts`) and keep the per-fragment write: the vertex pull interpolates wrongly across faces metres wide (textures swim with the camera, layered faces swap order). LOD1/LOD2 materials sample the far-only sun receiver (`createFarOnlySunShadowNode`, no near PCSS taps) because those bands start past the ±32 m near square. A prop asset without `_lod1`/`_lod2` siblings falls back to lod0 for every band (`AssetLoader.ts`): bake siblings with `bake:play-props --from-glb --one <lod0.glb>` (never `--from-glb` without `--one`, it overwrites hand-authored LODs such as the temple). **Ground contact** darkens/tints bases via chisel Y (`mapProps/tsl/propGroundContactTsl.ts`); tunables `VISUAL.props.groundContact`; DEV **Shadows → Ground contact** + **Prop LOD**.
- **Clouds:** Mesh-cluster soft spheres (`VISUAL.clouds` → `rendering/clouds/MeshCloudSystem.ts`; wind/sort/lifecycle in sibling helpers; the live field is ~7.8k puffs on island-mountain: `maxInstances` is only a floor, `buildCumulusDeckField` raises it to `cloudCount * particles + 64`). Clouds sit on `CLOUD_SHADOW_LAYER` and the main camera enables it, so the sun, near and world shadow cameras carry `SHADOW_CAMERA_EXPLICIT_LAYER`: Three's `ShadowNode.updateShadow` overwrites a shadow camera whose mask is only layer 0 with the main camera's mask, which would draw clouds into those maps. The cloud-cast map (`castShadowMapSize` 1024²) is re-baked every frame. Palette stops (night / golden hour / noon) mix from `goldenHourT` plus a short night fade. DEV: **Procedural clouds**.
- **Terrain:** Biome splat + path/meadow overlay TSL — see **Terrain subsystem** above. All data maps (biome weights, overlay masks, height, prop AO) are required at material creation; only the DEV biome-id map is a 1×1 stub in production play.
- **Grass:** CPU RGBA8 weight/clump bake (`grass/data/grassDataTexture.ts`) → GPU compaction (`grass/compute/*Ssbo.ts`) → indirect draw (`grass/render/*RingField.ts`). Draw shaders sample chisel Y via splat `macroHeight` (`createTerrainSurfaceHeightTsl`) and SSBO-packed height.
- **Guide line / sparkles / orbs:** Path ribbon + player/energy-orb HDR motes + shared organic orb volume — see **Sparkles + guide line** above.
- **Profiling:** See **Profiling checklist** below (ordered disable list in dev panel).

## Render loop (per frame)

Owner: `src/core/gameTick.ts` (`createFrameTick` → `render`). All pixels go through `postFX.render()` — do not call `renderer.render(scene, camera)` in gameplay. `WorldReveal` has **no per-frame `update`**; it listens to `energy:changed`. Player sparkle follow runs inside `player.applyRenderPosition` (before this list).

1. `dayCycle.update` → after energy cap: one-shot `revealSunrise` (then looping `dayDurationSec` arc, left→right)
2. `player.updateIllumination` + `syncWorldLighting` → night point light (from fixed-step `getDisplayEnergy` + sun) + terrain lighting uniforms
3. `overview.update` (poses the camera when the overview is on, and sets where the orb is drawn); otherwise `cameraRig.update`
4. `grassSystem.update` (when grass enabled) — after the camera so compact uses this frame’s frustum; mark + compact submit before the draw
5. `guideLine.update` (ribbon + path sparkles)
6. `village.render` (when the map has a `villageSeed`: building rise-in, villagers, glow, terrain-layer uploads) → `updatePropLod` (distance-band map prop InstancedMeshes into lod0/1/2; village batches share the same groups). `village.update` runs in `fixedUpdate` after the orbs
7. `updateFarSunShadowTarget`; when `sun.intensity > 0` also near cascade + `updateCloudCastShadowTarget`; then `resolveWorldCascadeVisibility` + `updateWorldCascadeShadow`
8. `nightHdriWeightForGameState` → `skySystem.setNightHdriWeight`
9. `syncAtmosphere` — AgX/sky exposure, bloom/god-ray sun weights, grade, valley fog (see **Color pipeline**)
10. `cloudSystem.update` (when clouds enabled)
11. `skySystem.update`
12. `updateWaterReflectionQuality` + `syncPantheonWater` (when water present)
13. `postFX.setDofFocus` + `postFX.setDofBokehScale` (energy → bokeh)
14. `await grassSystem.whenComputeReady()` **only if** `!isFieldReady()` (rebuild boundary)
15. `postFX.render()`

## Configuration

| Layer | File | Role |
|-------|------|------|
| Shipped visual look | `src/config/visual/` → `visualTuning.ts` (`VISUAL`) | Bloom, DoF, player orb + sparkles, organic orb volume, guide line, energy orbs, god rays, sky, HDRI, water, clouds, terrain, atmosphere haze. Shared sparkle defaults: `sparkleLook.ts` (imported by `player` / `guideLine` / `energyOrb`, not a `VISUAL` key). Wrap/hemi: `foliage.ts` → `VISUAL.grass` / `VISUAL.props`. |
| Gameplay tunables | `src/config/phase0.ts` (`PHASE0`) | Energy, orbs, camera, story — **not** visual re-exports |
| Runtime dev overrides | `devSettings` from `src/core/settings.ts` | `renderDebug`, terrain `dirty`, live slider state (`GameState` itself is energy/phase only) |
| Sun position (play) | `src/core/reveal/sunRevealState.ts` | Elevation + azimuth from `DayCycle` / `sunCycle.ts` after energy cap |
| Night baseline + lighting curves | `VISUAL.sky.nightBaseline`, `VISUAL.sky.lightingCurve`, `VISUAL.sky.worldLightness`, `VISUAL.sky.cycle` | Below-horizon elev, sun/ambient/exposure vs elevation; orb-absorbed night lift |
| Reveal + static sky fallbacks | `rendering/sky/skyDefaults.ts` | `SKY_NIGHT`, `NIGHT_BASELINE_ELEVATION_DEG` |
| Dev-only sky merge | `rendering/sky/skyDevOverrides.ts` | Merged into `applySkyForReveal` |

- **Gameplay / energy:** `src/config/phase0.ts`
- **Sun azimuth (DEV scrub):** writes `sunRevealState.azimuthDeg`; `sunDevState.lightDistance` for shadow frustum only

When adding a **visual** tunable, add it to `VISUAL` first, then wire the dev panel if artists need live sliders. Gameplay tunables stay in `PHASE0`. Prefer `VISUAL` over new `PHASE0.*` literals in new rendering code.

## Profiling checklist (DEV)

Use the **Perf** panel (button next to **Dev**) in this order to isolate cost:

1. Enable **Performance overlay** (stats.js FPS/MS/MB + stats-gl GPU/compute/Hz/draws/tris) and/or **Three.js Inspector** (per-pass GPU, memory, command timeline, TSL Graph). Snapshot `inspector.gpuRollup` is exclusive GPU; the world Scene pass is one timestamp — hide toggles to split grass/terrain/props.
2. Hide water / terrain / map props / sky / clouds / grass
3. Disable valley fog → distance haze → god rays → DoF → grade → bloom → shadows → AA
4. Log GPU snapshot / GPU device, or **Export snapshot** JSON (`window.__pantheonPerf.exportSnapshot()`)
5. Chrome Performance panel: User Timing measures named `pantheon/<section>` (player, grass, camera, …)

GPU times need `trackTimestamp` on `WebGPURenderer` (DEV) plus a drain of `resolveTimestampsAsync` each frame (suite or Inspector). Spector.js is WebGL-only and is not useful here. Do not enable Inspector **Force WebGL**.

Play's `GameLoop` drives `renderer.setAnimationLoop` so Inspector frame begin/finish wrap the real tick.

Full page reload after `visualTuning.ts` or terrain/material changes.

## Installed agent skills

Project skills are in `.agents/skills/` (lockfile: repo-root `skills-lock.json`). Prefer these by task:

| Task | Skill |
|------|--------|
| TSL, node materials, WebGPU renderer, compute | `webgpu-threejs-tsl` |
| WebGPU limits, adapters, raw API debugging | `webgpu` |
| Bloom, passes, effect pipeline | `threejs-postprocessing` |
| Scene graph, cameras, renderer basics | `threejs-fundamentals`, `threejs` |
| Loaders, GLTF, textures | `threejs-loaders` |
| Raycast, controls, input | `threejs-interaction` |
| Animation / mixing | `threejs-animation` |
| FBM, noise, procedural patterns | `shader-noise` |
| Legacy GLSL `ShaderMaterial` only | `threejs-shaders` (secondary — project is TSL-first) |
| Game loop, platforms, 3D web games | `game-development` → `web-games` / `3d-games` |
| Dev panel, HUD, readability | `game-ui-design` |

Install or refresh skills: `npx skills list`, `npx skills check` (from repo root).

## Scripts

`package.json` is the list; the names follow their job:

- `dev`, `build` (typecheck + vite build), `preview`.
- `lint` / `lint:fix` (Biome over the whole repo), `typecheck` (`tsc` over `src`, then over `scripts/`, `vite/` and the config files with `tsconfig.scripts.json`).
- `check:fast` (typecheck, lint, every fast check in parallel, about a minute) and `check:all` (the same plus the slow village smoke and the save round trips, about 5 minutes).
- `check:<name>` runs one headless check (`abilities`, `energy`, `overview`, `powers`, `powers-builder`, `quests`, `save`, `save-village`, `skills`, `ui`, `weather`, `village-economy`, `village-forest`, `village-golden`, `village-hamlet`, `village-hunger`, `village-kit`, `village-routine`, `village-smoke`, `village-upgrades`). The manifest and the parallel runner are `scripts/checks/run.mjs`; the checks sit in `scripts/checks/<domain>/` and share `scripts/checks/lib/` (`check.ts`, `villageHeadless.ts`, `saveFixtures.ts`, `memoryStore.ts`). A check is a node script that exits non-zero on failure; flags after `--` go to a single named check (`check:village-golden -- --update`).
- `tool:*` are developer tools (`tool:village-map`, `tool:sync-decoders`), `bake:*` the asset bakes in `scripts/assets/`.

Dead-code reports: use GitNexus (`CLAUDE.md`), not a script.

## Browser support

Chrome 113+, Edge 113+, Safari 18+. Firefox WebGPU is still uneven — see README if the app does not start.

## Story / phase context

The village roadmap (M0 to M9) is complete; the open design questions are listed at the end of `story-mechanics/VILLAGE_ROADMAP.md`. Phase 0 (God Particle) is being rebuilt around five landmarks: the plan, rules and milestones are in `story-mechanics/PHASE_0_LANDMARKS.md`, the author's checklist (models, story, map) in `story-mechanics/PHASE_0_TODO.md`, and the shipped behaviour so far (collect orbs, sun reveal at the energy cap, story fragments via `StoryLog`) in `story-mechanics/PHASE_0_GOD_PARTICLE.md`. See `story-mechanics/OVERVIEW.md` (the long-term vision, not implemented) before changing win conditions or the energy economy.

## Code intelligence

The GitNexus rules (impact before editing, change analysis before committing) are in `CLAUDE.md`.
