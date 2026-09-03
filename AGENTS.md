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
| `src/main.ts` | Bootstrap: WebGPU check, map chooser, assets, world build, starts `GameLoop` |
| `src/core/gameTick.ts` | Per-frame `fixedUpdate` / `render` tick (`createFrameTick`) |
| `public/maps/` | Authored map JSON + `manifest.json` (play catalog) |
| `src/map/` | Shared map types/grids/IO/validation; `play/` selection; `authoring/` editor tools + DOM helpers |
| `src/bootstrap/` | Play loading phases (lore messages + asset/terrain batch progress) |
| `src/ui/MapSelectScreen.ts` | Startup map chooser when no map id in URL/session |
| `src/config/phase0.ts` | Phase 0 gameplay tunables (energy, orbs, reveal) |
| `src/config/visualTuning.ts` | Barrel re-export of `VISUAL` + types from `config/visual/*` |
| `src/config/visual/` | Split visual look modules (sky, postfx, terrain, grass, player, organicOrb, guideLine, energyOrb, sparkleLook, …) |
| `src/config/world.ts` | Map size, segments, height scale, biome height bands (`WORLD`) |
| `src/core/` | Game loop, input (`CameraInput`), `GameState` barrel, event bus. Camera rig: `src/rendering/CameraRig.ts` |
| `src/core/reveal/` | Energy-cap gate (`WorldReveal.ts`) + post-cap day cycle (`DayCycle.ts`); `sunRevealState.ts` |
| `src/assets/` | Manifest, `AssetLoader`, KTX2/Draco helpers (`createKtx2Loader.ts`, `decoderPaths.ts`) |
| `src/world/` | Terrain, map props, GPU grass (`grass/`), water |
| `src/world/grass/` | Player-follow biome grass + optional flowers — see **Grass subsystem** below |
| `src/world/mapProps/` | GLB instancing — `config/` / `material/` / `tsl/` (+ placement/instancing at root) |
| `src/world/water/` | Water mesh + normals — `config/` / `mesh/` / `material/` / `sync/` / `data/` / `tsl/` |
| `src/rendering/` | Scene, post-FX, camera rig, WebGPU helpers |
| `src/rendering/sky/` | `SkySystem`, reveal blend, `skyDefaults` |
| `src/rendering/sky/hdri/` | Night EXR load, HDRI weight, runtime tuning |
| `src/rendering/sunShadow/` | PCSS sun shadows + cloud cast shadows + `receiverUniforms` |
| `src/rendering/layers/` | Camera/object layer policy (water reflector mask) |
| `src/rendering/clouds/` | Mesh cloud system — `MeshCloudSystem` + wind/sort/lifecycle helpers |
| `src/rendering/debug/` | DEV GPU / render / shadow debug logs |
| `src/rendering/loaders/` | Alpha-cutout texture helper (`configureAlphaCutoutTexture.ts`) |
| `src/rendering/postfx/` | Post pipeline (`createPostFxPipeline` + `pipelineComposite` / `pipelineAaFsr`) + effect nodes |
| `src/rendering/atmosphere/` | Day aerial + night valley fog (`atmosphereSystem.ts`) |
| `src/entities/` | Player, energy orbs, organic orb volume, guide-line ribbon, shared sparkle field |
| `src/ui/` | HUD, map select, play loading screen, story log |
| `src/dev/` | DEV tooling — `panel/` (Dev + Perf chrome, sliders), `runtime/` (render debug apply), `profiling/` (WebGPU/TSL perf suite), `bindRange`, panel tick hooks |
| `public/models/` | Nature `.glb` props (KTX2) in per-family folders (see `src/assets/assetManifest.ts`) |
| `public/textures/` | `terrain/{biome}/`, `terrain/atlases/`, `water/`, `environment/` (night HDRI), `grass/` |
| `public/basis/` | Self-hosted Basis/KTX2 transcoder (committed; refresh via `npm run sync-decoders`) |
| `public/draco/` | Self-hosted Draco WASM under `gltf/` (committed; same sync script) |
| `story-mechanics/` | GDD — vision, phases, ascension tree (read before large gameplay changes) |
| `editor.html` | DEV map editor entry (`src/editor/main-editor.ts`) |
| `src/editor/` | Terrain sculpt/paint, entity place mode, save/load UI |
| `vite/mapDevApiPlugin.ts` | DEV POST `/api/dev/maps/save` → `public/maps/` |

Use a **file path comment** on new modules (e.g. `// src/rendering/Foo.ts`) to match existing files.

**DEV override convention:** Visual systems that need live slider merges use module `getLive*` / `*DevOverrides` (e.g. `getLiveCloudSettings` in `cloudDevState.ts`, `skyDevOverrides`, `guideLineDevState`, `organicOrbDevState`, `playerParticleDevState`, `energyOrbParticleDevState`). GameState-backed panels use `devSettings` from `src/core/GameState.ts` plus reset helpers (water: `waterDevDefaults`; grade: `resetPostFxGradeDev` in `postfxGrade.ts`). Prefer extending an existing pattern over inventing a third.

## Grass subsystem (`src/world/grass/`)

Revo-inspired GPU grass: 3 LOD rings, SSBO compaction, indirect `InstancedMesh` draw. Optional edelweiss flower field shares the same compute patterns.

**Entry:** `grass/core/GrassSystem.ts` — `initGrassSystem()` / `GrassSystem` interface. Init from `main.ts`; per-frame from `gameTick.ts`; DEV: `dev/panel/DevPanel.ts`, `dev/panel/devPanelGrass.ts`.

**Per-frame:** `grassSystem.update()` in `gameTick.ts` **after** `cameraRig.update()`. Compact encodes synchronously before the draw (tile-mark submit, then compact submit). Await `whenComputeReady()` **only** when `!isFieldReady()` (rebuild boundary). Draw shaders compute wrap-tile XZ from slot index + player; grass SSBO is `uvec2` (height + state, 8 B), flowers `uint` (height + vis + debug reason). Frustum cull is a sphere vs 6 Hessian planes (`uFrustumPlanes`). LOD2 draw uses far-only sun shadow (Vogel + cloud), distant sine wind, and skips sheen/proximity AO. Ring layout is `readGrassRingsLayout()` only (no `ringDerived` cache). Field manager public API is `{ state, boot, rebuildAll, setWorldPosition, dispose }`.

Data map is **RG8** (`R` = biome grass weight, `G` = baked clump); blade Y comes from the terrain surface sample, not the data texture. Prop exclusion (and terrain contact AO, same `exclusionTextureSize`) uses `EXCLUSION_TEXEL_SCALE` 2 (~4096² R8, ~16 MB) with `propGrassEdgeFadeM` 0.12 m. Leftover compute lever (tuning, not code): LOD2 at 5 blades/m² with `widthFarGain` 2 still allocates ~1.29M compact threads. Removed DEV: NDC cull pads, `detailedWindRadius`, `ringDerived` cache, GPU compact-count readback, `rebuildRing` / `reinitInstances`.

```
grass/
  core/       GrassSystem.ts, grassFieldManager.ts, grassComputeQueue.ts
  compute/    grassSsbo.ts, flowerSsbo.ts, *SsboPack.ts; shared/ vegetationIndirectTsl.ts, vegetationVisibilityTsl.ts, vegetationOffsetTsl.ts, vegetationTileCullTsl.ts, vegetationCompactTsl.ts
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
| Data map (RG8 weight + clump) | `grass/data/grassDataTexture.ts` |
| Prop exclusion texel size | `grass/data/propGrassMeshRaster.ts` (`EXCLUSION_TEXEL_SCALE`) |

Full page reload after `visualTuning.ts` grass changes or terrain/material edits that re-seed grass data.

## Sparkles + guide line (`src/entities/`)

Shared additive HDR sparkle sprites (`SpriteNodeMaterial` + `InstancedMesh`) for the path ribbon, player orb, and residue energy orbs. Placement differs; look (disc, HDR bloom, tube spin, packet density, breath, A→B→C travel — currently white) is shared. Player orb, residue orbs, sparkles, and the guide ribbon opt into the water reflector (`enableWaterReflectionLayer`); grass and map props stay on layer 0 only.

**Shared field:** `entities/sparkleField.ts` (`createSparkleField`) — `place()` supplies path vs shell vs burst positions. Defaults: `config/visual/sparkleLook.ts` (`SPARKLE_LOOK` / `SPARKLE_PALETTE`); per-system overrides on `VISUAL.guideLine`, `VISUAL.player.particles`, and `VISUAL.energyOrb.particles`. Shared pulse TSL: `rendering/tsl/energyPulseTsl.ts` (`guideLine/guidePulseTsl.ts` re-exports for ribbon/sparkle/orb graphs).

**Guide ribbon:** `entities/guideLine/GuideLineSystem.ts` — A* path to the next energy orb, HDR mesh (`guideLineMesh.ts`), path-sampled sparkles (`guideLineParticles.ts`), terrain/prop receive glow stamp (`guideGlowMap.ts`). Receive uniforms + cobble TSL live under `rendering/guideGlowUniforms.ts` and `rendering/tsl/guideReceiveGlowTsl.ts` so terrain/props do not import `entities/`. New path after absorb washes in along the ribbon (`revealSec`, ease-in-out, player → orb). Init from `WorldBuilder`; per-frame `guideLine.update(visPos, camera, dt)` in `gameTick.ts`. DEV: **Look → Guide line** (ribbon) + **Glow & bloom → Particles → Guide line**. Live merges: `guideLineDevState.ts`.

**Organic orb volume:** `entities/organicOrb/organicOrbMaterial.ts` — shared TSL `MeshBasicNodeMaterial` on the player orb and residue energy orbs (translucent viewport-refracted fill, white fresnel rim, local-space `triNoise3D` morph). Shared sphere: `createOrganicOrbGeometry` (32 segments). Player keeps a private material so rim HDR and fill white scale with energy (`orbEmissiveMin` / `orbFillWhiteMin` at 0% → `VISUAL.organicOrb.rimHdr` / `fillWhite` at cap) and the mesh stretches along move velocity (sparkle-lag teardrop; reverse grows a new back instead of spinning). Residue orbs share one material and apply `VISUAL.energyOrb.look` overrides (rim power / HDR / fill white), `VISUAL.energyOrb.morphOriginMul`, plus a smaller `PHASE0.ORB.ENERGY_RADIUS`. `organic.sync` runs when energy or DEV look changes, not every tick. Sparkle shells stay separate. DEV: **Look → Orb** (player). Live merges: `organicOrbDevState.ts`. Full page reload after shader graph / `visual/organicOrb.ts` changes.

**Player orb halo:** `entities/playerOrbParticles.ts` from `PlayerVisuals.ts`. Shell around the orb; per-mote drag lag + motion shake; **drawn `mesh.count` scales with energy** (0 at 0% → `VISUAL.player.particles.count` at cap; capacity is fixed). Mesh **scale and rim HDR** grow with energy (`VISUAL.player.orbScaleMin` / `orbEmissiveMin` at 0% → current size and `organicOrb.rimHdr` at cap). One fixed-step energy smoother (`getDisplayEnergy`) drives mesh/rim/fill and the night point light. Drag buffer uploads skip when standing still (or lag is 0). Follow runs from `PlayerController.applyRenderPosition`. DEV: **Glow & bloom → Particles → Player**. Live merges: `playerParticleDevState.ts`.

**Energy orbs:** `entities/EnergyOrb.ts` is a stable barrel (`energyOrb/energyOrb.ts` instance + `energyOrb/orbSystem.ts` visual bootstrap). Sparkles: `entities/energyOrbParticles.ts` from `initOrbSystem`. Shared idle halo (orb-position texture, one InstancedMesh for all live orbs) plus a pooled absorb burst (pop, then assimilate into the player orb). Terrain footing is sampled once at spawn (orbs do not move in XZ). Idle sparkle texture uploads only when orb XYZ / absorbed bits change. Init from `WorldBuilder`; per-frame from `orbSystem.update` in `gameTick.ts` fixed step. DEV: **Glow & bloom → Particles → Energy orb**. Live merges: `energyOrbParticleDevState.ts`.

Full page reload after sparkle `count` / shader graph changes (`visual/player.ts`, `visual/guideLine.ts`, `visual/energyOrb.ts`, `visual/organicOrb.ts`, `sparkleField.ts`, `organicOrbMaterial.ts`). HMR is not enough.

## Terrain subsystem (`src/world/terrain/`)

Biome-splat terrain: TSL `MeshBasicNodeMaterial` with manual sun/ambient/shadow lighting. **Play** loads offline-baked KTX2 color + AO atlases (`loadBakedTerrainAtlases`); **editor** prefers play `color.ktx2` (canvas-packs 1024 tiles if the bake is missing). Mesh build stays in `src/world/MapTerrainBuilder.ts`.

**Play and editor** share one world-fixed `PlaneGeometry` whose vertex step equals `VISUAL.terrain.chisel.stepM` (8 m → 256 segments on the 2048 m world). **Play** CPU-bakes vertex Y once (heights are static) and the visible mesh casts sun shadows. **Editor** keeps GPU vertex displacement so sculpt updates live (no shadow cast). Fragment lighting uses per-triangle face N (not interpolated vertex N), with an optional crease fillet (`chisel.edgeSoft`) that blends only that lighting normal across triangle edges. **Editor** uses `simpleShading` (albedo splat + hue-split; no PBR, shadows, glow, or wetness). Painterly umbra is `mix(unlit, lit, (N·L)×sunVis)` in `terrainStylizeLightingTsl.ts` — one `uShadowFloor` on the splat material.

**Entry:** `terrain/index.ts` — `loadTerrainTextures`, `createTerrainSplatMaterial`, `syncTerrainSplatLighting`, `applyTerrainDevUniforms`. Texture load: `bootstrap/playLoadingPhases.ts` (play) / `main-editor.ts` (editor); mesh: `MapTerrainBuilder.ts`; lighting: `rendering/worldLighting.ts`; DEV: `dev/panel/devPanelTerrain.ts`.

```
terrain/
  config/     terrainBiomeTuning.ts, terrainTextureManifest.ts
  loaders/    loadTerrainTextures.ts, loadBakedTerrainAtlases.ts, pbrMapClassify.ts, …
  atlas/      atlasConstants.ts, bakedAtlasPaths.ts, terrainMapAtlas.ts
  material/   createTerrainSplatMaterial.ts, syncTerrainSplatLighting.ts, biomeSplatUniforms.ts,
              biomeSplatDisplacement.ts, biomeSplatShading.ts, applyTerrainDevUniforms.ts
  tsl/        biomeAtlasUv.ts, biomeSplatWeights.ts, terrainMacroHeightTsl.ts, snowDistributionTsl.ts, terrainSurfaceHeightTsl.ts, terrainStylizeColorTsl.ts, terrainStylizeLightingTsl.ts
  cpu/        terrainSurfaceCpu.ts, terrainChiselCpu.ts
  shadow/     terrainShadowCast.ts
```

| Concern | Where |
|---------|--------|
| Shipped visual tunables | `VISUAL.terrain` in `visualTuning.ts` → `config/terrainBiomeTuning.ts` |
| Play / editor mesh | `MapTerrainBuilder.ts` — one world-fixed plane; segments = `WORLD.SIZE / chisel.stepM`. Play: CPU-baked Y + `castShadow` on the visible mesh; editor: GPU displace |
| Vertex displacement | `material/biomeSplatDisplacement.ts` — editor GPU chisel Y; play uses `positionLocal` after CPU bake. Fragment face N + crease fillet from `terrainMacroHeightTsl.ts` |
| Height models | **Chisel Y** = walkable/visible (`getWorldY`, mesh, grass Y, shadows, waterline, wetness, snow overlay, prop ground-contact). **Bilinear sculpt Y** = |∇h| / foam `fwidth` (`macroSlopeAtWorldXZ`) and biome height-band weights only |
| Waterline / wetness | Play water + terrain wet sand sample **chiseled Y** for the waterline; |∇h| stays bilinear (`macroSlopeAtWorldXZ`) so foam `fwidth` does not pick up 8 m creases; biome height-band weights stay bilinear |
| Slope-rock / grass / snow | Shared chisel N.y curve (`TERRAIN_SLOPE_ROCK_*` / `slopeRockDerivedFromNormalY`); grass `packMaps.grass.slopeKill` and snow overlay both scale off that 0–1 weight (snow × `(1 − derived)`). Snow coverage is **per facet** (centroid height/noise + knife face N) so it matches slope-rock geometry |
| Prop contact AO | Terrain `uPropAoMap` darkens albedo; sun term is `min(PCSS, contact-sun)` so tree umbra does not double-multiply |
| Play terrain | Always on in play (`WorldBuilder` → `buildMapTerrain`); editor passes `simpleShading: true` |
| Editor terrain shading | `simpleShading` on the splat material — albedo splat + hue-split; no AO atlas, PCSS receive graph, glow, or wetness |
| Painterly umbra | `tsl/terrainStylizeLightingTsl.ts` — hue-split is `mix(unlit, lit, (N·L)×sunVis)`; Disable shadows / floor slider hit the one splat `uShadowFloor` |
| GPU macro height | `map/MapGrids.ts` (`createHeightTexture`) → `uHeightTex` in `biomeSplatUniforms.ts` |
| Texture ingest / biome folders | `config/terrainTextureManifest.ts` + `loaders/pbrMapClassify.ts` (Poly Haven, ambientCG, …) |
| Play atlas load (fail-fast) | `loaders/loadBakedTerrainAtlases.ts` — `color.ktx2` + `ao.ktx2` only |
| Editor/runtime canvas pack | `atlas/terrainMapAtlas.ts` — prefers play `color.ktx2`; else 1024-tile canvas pack + stub AO |
| Atlas GPU init | `initTerrainAtlases` after textures load |
| Material composer | `material/createTerrainSplatMaterial.ts` |
| Per-frame lighting sync | `material/syncTerrainSplatLighting.ts` ← `rendering/worldLighting.ts` |
| Shared biome weights (TSL) | `tsl/biomeSplatWeights.ts` — height/paint/snow weights for disp + shading |
| DEV sliders | `dev/panel/devPanelTerrain.ts` → `material/applyTerrainDevUniforms.ts` — Stylize: hue-split mix, global sun/ground/shadow, per-biome palettes |
| Macro shadow caster | Play: visible mesh (`configureMeshShadowCast`). GPU-disp+cast path still has `terrainShadowCast.ts` (layer 1 clone) |
| Grass surface Y | `createTerrainSurfaceHeightTsl` reuses splat `macroHeight` (same chisel Fns as the terrain material) |

Full page reload after `visualTuning.ts` terrain changes, atlas re-bake, paint-map upload, or terrain splat shader graph edits.

## 3D assets (`public/models/` and `public/textures/`)

- Add assets directly under **`public/`** — the game loads from there only (see `src/assets/assetManifest.ts`, `collectAssetLoadJobs()`).
- **3D layout:** `public/models/{family}/` — self-contained `.glb` per prop (KTX2/`KHR_texture_basisu`; bake with `npm run bake:play-props`). Emits lod0 as `Name.glb` plus `Name_lod1.glb` / `Name_lod2.glb` (mid/far: simplify + textures ≤1024/512). Packs use `scene.glb` + `scene_lod1/2.glb` (e.g. `stone-pack/`). Catalog keys in `src/assets/assetManifest.ts`; shadow casters in `src/world/mapProps/config/propShadowKeys.ts` (trees/rocks always; foliage + optional pebbles via `VISUAL.props.shadowCast`).
- **Terrain textures:** `public/textures/terrain/{biome}/` — PBR maps (Poly Haven glTF, ambientCG ZIP, etc.; scanned by filename). Play loads pre-baked `color.ktx2` + `ao.ktx2` from `public/textures/terrain/atlases/` (`npm run bake:terrain-atlases`); editor prefers that color atlas (1024 canvas pack if missing).
- **Environment textures:** `public/textures/environment/` (`night-sky.exr`, shipped 4096×2048 — rebuild with `npm run bake:night-exr`).
- **Grass textures:** `public/textures/grass/` (`noise-atlas.ktx2` wind/bake atlas, `edelweiss.ktx2` flower sprite — rebuild with `npm run bake:grass-ktx2`).
- **Decoders (self-hosted, committed):** `public/basis/` (KTX2/Basis transcoder) and `public/draco/gltf/` (Draco) are checked into the repo and served statically. Refresh from the installed `three` package with `npm run sync-decoders` after upgrading `three` — no CDN. `loadAllAssets(renderer)` requires `renderer.init()` first so `KTX2Loader.detectSupport` can run; shared helper: `src/assets/createKtx2Loader.ts`.

### Asset bake pipeline (play)

Offline scripts produce the compressed files play loads (no runtime Basis encode, no PNG fallbacks):

| Command | Output |
|---------|--------|
| `npm run sync-decoders` | `public/basis/`, `public/draco/gltf/` from `three` |
| `npm run bake:night-exr` | `night-sky.exr` → 4096×2048 (needs `hdrify`) |
| `npm run bake:grass-ktx2` | grass `.ktx2` (needs source PNGs restored if deleted; `toktx`) |
| `npm run bake:play-props` | walks `.gltf` inputs → lod0 `.glb` + `_lod1`/`_lod2` siblings + strip sidecars; or `--from-glb` to emit mid/far from existing lod0 GLBs (needs `@gltf-transform/cli` via npx + `toktx` for full bake) |
| `npm run bake:terrain-atlases` | `public/textures/terrain/atlases/color.ktx2` + `ao.ktx2` (needs `sharp` + `toktx`) |

Requires [KTX-Software](https://github.com/KhronosGroup/KTX-Software) `toktx` on PATH for grass/terrain/prop KTX2. **Full page reload** after replacing anything under `public/`.

## Map editor (DEV)

- **Entry:** `editor.html` → `createEditorSession()` in `src/editor/core/EditorSession.ts` (WebGPU, same stack as play mode). Dual-dock chrome lives in `src/editor/ui/shell/EditorShell.ts`.
- **Tools:** Document bar (map list, New/Import/Duplicate, Undo/Redo, View, Save), left tool rail (Sculpt / Paint / Place + sub-modes), contextual library (biomes or assets), properties dock, status bar. Place has **Single** (drag-drop, select, gizmo), **Brush** (`src/editor/tools/PropBrushTool.ts`: shift+click mix, LMB scatter, Shift+LMB erase), and **Fill**. Map save/load lives in `src/editor/document/EditorMapDocument.ts`.
- **Save:** Toolbar Save or Ctrl+S; first save prompts for map id. Writes via `MapIO.saveMapToProject` / `vite/mapDevApiPlugin.ts`. Restart dev server after plugin changes.
- **Validation:** Shared `src/map/validateMapPayload.ts` (client + save API). Entities: `map/authoring/mapEntityCatalog.isValidMapEntity`.
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

Play-mode pixels: scene HDR → god rays → bloom add → **AgX** (`uExposure`) → optional **SMAA** (working-color silhouette resolve) → **renderOutput** → **procedural grade** → **LUT** (delta-blend) → DoF → optional **FXAA** (full-frame for FXAA method; CoC-gated cleanup when SMAA + DoF) → optional **FSR1** upscale. Default AA is SMAA (`VISUAL.render.aaMethod`); upscaling off by default. Renderer uses `NoToneMapping`; tonemap/grade run only in `postfx/createPostFxPipeline.ts` (`outputColorTransform = false`).

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
- **Distance haze:** Two terms on `scene.fogNode` (`atmosphereSystem.ts`, Three.js `webgpu_custom_fog`), combined `1-(1-day)*(1-night)`. Day: camera-XZ `smoothstep(aerialStartM, aerialEndM)` × live aerial (`aerialStrength × mix(aerialNightMul, 1, 1 − night master)`). Night: Y-slab volume (`heightSlabFogTsl.ts`) × `hazeStrengthForElevation` (−5°→30°, `cyclePower` 1.4). Tint follows the same night master (not orb-lifted daylight). Under `fogTop` (including below `fogBase`): surround veil `fadeHeight^valleyObscurePower × beer(τ)` on horizon/zenith; look-down uses path. Ridge is path-only. Caps: `valleyRayMaxM` / `valleyAmbientM`. SkyMesh / night HDRI stay `fog = false` and mix the same terms (`applySkyHorizonHaze`); HDRI intensity before fog mix (`scene.backgroundIntensity` stays 1). Clouds `fog = false`, night term × `hazeMix`. Water `setupFog` × shore bypass (foam is albedo). Play never detaches `fogNode`. DEV **Distance haze** + Perf **Disable valley fog** / **Disable distance haze**. Editor omits aerial and keeps `fogNode` (preview zeros/restores `uFogMaster`, night tint). Full page reload after slab shader-graph change.
- **Depth of field:** `DepthOfFieldNode` in `postfx/createPostFxPipeline.ts` (after LUT). Auto-focus on player; bokeh scales with energy (8 at 0% → 0 at 100%, `postfx/dofReveal.ts` / `VISUAL.dof`). At daytime bokeh 0 the half-res pass is skipped and the graph mixes to live sharp color; the 8→0 ramp stays smooth via the energy lerp. Blur runs at half-res — SMAA runs before DoF; CoC-gated FXAA after when DoF is active (in-focus stays sharp). Graph rebuilds **rebind** the existing DoF node (`dofControls.rebindSharp`) instead of disposing it — avoids a cleared RT flash at sunrise. Input RGB is clamped (`DOF_INPUT_RGB_MAX`). DEV: **Depth of field** + Render debug **Disable DoF**.
- **Sky:** Night EXR from `VISUAL.sky.nightHdri.path` (`rendering/sky/hdri/`); fades on sun elevation (`nightHdriBlend.ts`). Night HDRI intensity is applied in the background node **before** valley fog mix (`scene.backgroundIntensity` stays 1) so in-valley sky fill is not crushed. Preetham `SkyMesh` in `rendering/sky/SkySystem.ts` with independent `uSkyExposure`. All lighting signals from `rendering/sky/lightingCurves.ts` keyed on `sunRevealState.elevationDeg`. Post-reveal looping midnight→midnight cycle in `core/reveal/DayCycle.ts` + `rendering/sky/sunCycle.ts` (elevation + azimuth). Sun direction from `sunSpherical.ts` (`sunRevealState.azimuthDeg`).
- **Shadows:** Sun/ambient intensity from lighting curves + day cycle (energy-gated). Ground receive uses near PCSS inside the follow ortho and far Vogel beyond a light-view edge fade (`createReceiverSunShadowNode`). Handoff is a Chebyshev `mix` — TSL `If` around those samples draws the ±32 m ortho as a dark square. LOD2 grass already skips near (`createFarOnlySunShadowNode`). Cloud-cast `min`s on every ground pixel so the 32 m square keeps overhead umbras. Follow target is player XZ **and terrain Y**. Terrain painterly umbra is `mix(unlit, lit, (N·L)×sunVis)` in `terrainStylizeLightingTsl.ts` (one splat `uShadowFloor`). Play terrain casts from the visible CPU-baked mesh. Main/far sun map feeds cloud mesh receive + ground beyond near. Soft cloud-cast umbras are a separate map (`cloudCastShadow.ts`). Cloud cast follow runs in `gameTick.ts` when `sun.intensity > 0`. At night the sun is off; ambient uses `lightingCurve.nightDaylightFloor` plus `VISUAL.sky.worldLightness` (orb-absorbed lift). Local fill is the player point light.
- **Map props:** GLB instancing in `world/mapProps/` with distance-banded mesh LOD (`mapPropLod.ts`, `VISUAL.props.lod`; bake emits `_lod1`/`_lod2` via `npm run bake:play-props`). Wrap/hemi foliage lighting in `mapProps/tsl/mapPropShadingTsl.ts`. Small foliage (plants, flowers, mushrooms) casts sun shadows when `VISUAL.props.shadowCast.foliage` is true — same opaque depth pass as tree leaves. **Ground contact** darkens/tints bases via chisel Y (`mapProps/tsl/propGroundContactTsl.ts`); tunables `VISUAL.props.groundContact`; DEV **Shadows → Ground contact** + **Prop LOD**.
- **Clouds:** Mesh-cluster soft spheres (`VISUAL.clouds` → `rendering/clouds/MeshCloudSystem.ts`; wind/sort/lifecycle in sibling helpers) plus optional Preetham `SkyMesh` dome layer (`VISUAL.sky.static` cloudCoverage; wind synced from mesh). Palette stops (night / golden / lowSun / midday) mix from `goldenHourT` plus a short night fade above cycle sunrise — not a separate −2/1/6/20° color clock. DEV: **Procedural clouds** + **Sky → Clouds (SkyMesh)**.
- **Terrain:** Biome splat + path/meadow overlay TSL — see **Terrain subsystem** above. Paint maps required at material creation (no placeholder fallbacks).
- **Grass:** CPU RG8 weight/clump bake (`grass/data/grassDataTexture.ts`) → GPU compaction (`grass/compute/*Ssbo.ts`) → indirect draw (`grass/render/*RingField.ts`). Draw shaders sample chisel Y via splat `macroHeight` (`createTerrainSurfaceHeightTsl`) and SSBO-packed height.
- **Guide line / sparkles / orbs:** Path ribbon + player/energy-orb HDR motes + shared organic orb volume — see **Sparkles + guide line** above.
- **Profiling:** See **Profiling checklist** below (ordered disable list in dev panel).

## Render loop (per frame)

Owner: `src/core/gameTick.ts` (`createFrameTick` → `render`). All pixels go through `postFX.render()` — do not call `renderer.render(scene, camera)` in gameplay. `WorldReveal` has **no per-frame `update`**; it listens to `energy:changed`. Player sparkle follow runs inside `player.applyRenderPosition` (before this list).

1. `dayCycle.update` → after energy cap: one-shot `revealSunrise` (then looping `dayDurationSec` arc, left→right)
2. `player.updateIllumination` + `syncWorldLighting` → night point light (from fixed-step `getDisplayEnergy` + sun) + terrain lighting uniforms
3. `cameraRig.update`
4. `grassSystem.update` (when grass enabled) — after the camera so compact uses this frame’s frustum; mark + compact submit before the draw
5. `guideLine.update` (ribbon + path sparkles)
6. `updatePropLod` (distance-band map prop InstancedMeshes into lod0/1/2)
7. `updateSunShadowTarget` + near cascade + `updateCloudCastShadowTarget` when `sun.intensity > 0`
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
| Runtime dev overrides | `devSettings` from `src/core/GameState.ts` | `renderDebug`, terrain `dirty`, live slider state (`GameState` itself is energy/phase only) |
| Sun position (play) | `src/core/reveal/sunRevealState.ts` | Elevation + azimuth from `DayCycle` / `sunCycle.ts` after energy cap |
| Night baseline + lighting curves | `VISUAL.sky.nightBaseline`, `VISUAL.sky.lightingCurve`, `VISUAL.sky.worldLightness`, `VISUAL.sky.cycle` | Below-horizon elev, sun/ambient/exposure vs elevation; orb-absorbed night lift |
| Reveal + static sky fallbacks | `rendering/sky/skyDefaults.ts` | `SKY_NIGHT` / `SKY_DAY`, `NIGHT_BASELINE_ELEVATION_DEG` |
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

```bash
npm run build          # tsc + vite build
npm run lint           # biome lint only
npm run check          # biome check (lint + format + imports)
npm run dead-code:report # GitNexus unused-symbol report
npm run sync-decoders  # copy Basis + Draco WASM from three → public/
npm run bake:night-exr # downscale night-sky.exr to 4096×2048
npm run bake:grass-ktx2 # PNG → KTX2 for grass wind atlas + flower sprite
npm run bake:play-props # public/models glTF → KTX2 GLB (strips PNG sidecars)
npm run bake:terrain-atlases # pack biome maps → color.ktx2 + ao.ktx2
```

## Browser support

Chrome 113+, Edge 113+, Safari 18+. Firefox WebGPU is still uneven — see README if the app does not start.

## Story / phase context

Current implementation target is **Phase 0 (God Particle)**: collect energy from orbs, sun reveal at energy cap, story fragments via `StoryLog`. Standing stones and named landmarks are deferred (design in `story-mechanics/`; runtime wiring TBD in editor). See `story-mechanics/OVERVIEW.md` and `story-mechanics/PHASE_0_GOD_PARTICLE.md` before changing win conditions or energy economy.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **pantheon** (14701 symbols, 39872 relationships, 954 execution flows).

> Index stale? Run `node .gitnexus/run.cjs analyze --index-only` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? Bootstrap with `npx`, `bunx`, or `pnpm dlx` — e.g. `bunx gitnexus@latest analyze` (npm 11 npx crash; #1939).

## Always Do

- **MUST run impact analysis before editing.** Use `impact({target: "symbolName", direction: "upstream"})` (MCP) or `node .gitnexus/run.cjs impact "symbolName" --direction upstream --repo .` (CLI fallback); report callers, processes, and risk. Never substitute grep for graph analysis.
- **MUST analyze graph changes before committing.** Use `detect_changes({scope: "all"})` (MCP) or `node .gitnexus/run.cjs detect-changes --scope all --repo .` (CLI fallback). `partial: true` or `truncated: true` is not a clean check — a zero means unseen, not unaffected; re-run it. For regression review: `detect_changes({scope: "compare", base_ref: "main"})` or `node .gitnexus/run.cjs detect-changes --scope compare --base-ref "main" --repo .`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- **MUST treat `risk: UNKNOWN` as unresolved, not as low.** An empty caller set is not evidence the symbol is unused — it can also mean the callers are not resolvable by the index (plain-object property access, dynamic dispatch, cross-language calls). `impact` pairs `UNKNOWN` with a `riskNote` saying so. Confirm with a text search before treating the symbol as safe to change or delete; do not proceed on the strength of a zero.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method before MCP/CLI impact analysis.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis, and never read `UNKNOWN` as an all-clear — it means the walk could not answer, which is the one verdict that requires confirming by other means.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit before MCP/CLI graph change analysis.

## Resources

| Resource | Use for |
| --- | --- |
| `gitnexus://repo/pantheon/context` | Codebase overview, check index freshness |
| `gitnexus://repo/pantheon/clusters` | All functional areas |
| `gitnexus://repo/pantheon/processes` | All execution flows |
| `gitnexus://repo/pantheon/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
| --- | --- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
