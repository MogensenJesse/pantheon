# Pantheon — Agent Guide

Phase 0 prototype: a divine remnant explores **authored maps** (Three.js WebGPU + Vite + TypeScript). Design intent and lore live in `story-mechanics/`; gameplay tunables in `src/config/phase0.ts`, visual look in `src/config/visualTuning.ts`.

## Stack (non-negotiable)

- **Renderer:** `WebGPURenderer` only — no WebGL fallback. Entry check: `src/rendering/webgpuCapability.ts`.
- **Shaders:** Prefer **TSL** (`three/tsl`, `Mesh*NodeMaterial`, `RenderPipeline`) over raw GLSL `ShaderMaterial`. Post-FX uses `three/addons/tsl/display/*` nodes.
- **Imports:** `import * as THREE from 'three/webgpu'` (or granular `three` + `three/webgpu` where the file already does).
- **Build:** Vite, `esnext` target. Do **not** start `npm run dev` — the user runs the dev server manually.

## Project layout

| Path | Purpose |
|------|---------|
| `src/main.ts` | Bootstrap: WebGPU check, map chooser, assets, world build, loop |
| `public/maps/` | Authored map JSON + `manifest.json` (play catalog) |
| `src/map/` | Map IO, validation, play selection (`playMapSelection.ts`) |
| `src/ui/MapSelectScreen.ts` | Startup map chooser when no map id in URL/session |
| `src/config/phase0.ts` | Phase 0 gameplay tunables (energy, orbs, reveal) |
| `src/config/visualTuning.ts` | **Visual look** — sky, bloom, god rays, water, clouds, terrain (production + dev panel) |
| `src/core/` | Game loop, input, camera, `GameState`, event bus |
| `src/world/` | Terrain, map props, GPU grass (`grass/`), journey path |
| `src/world/grass/` | Player-follow biome grass + optional flowers — see **Grass subsystem** below |
| `src/core/reveal/` | Energy-cap gate (`WorldReveal.ts`) + post-cap day cycle (`DayCycle.ts`) |
| `src/rendering/` | Scene, post-FX, camera rig, WebGPU helpers |
| `src/rendering/sky/` | `SkySystem`, reveal blend, `skyDefaults` |
| `src/rendering/sky/hdri/` | Night EXR load, HDRI weight, runtime tuning |
| `src/rendering/debug/` | DEV GPU / render / shadow debug logs |
| `src/rendering/loaders/` | Shared texture loaders |
| `src/rendering/postfx/` | Individual TSL post effects (bloom mask, god rays, vignette, etc.) |
| `src/world/water/` | Water mesh + `loadWaterNormals.ts` |
| `src/entities/` | Player, orbs, visuals |
| `src/ui/` | HUD, dev panel (`import.meta.env.DEV` only) |
| `src/dev/` | Render debug controller, lighting sync, GPU/post-FX debug |
| `public/models/` | Nature glTF pack at `models/glTF/` (see `src/assets/assetManifest.ts`) |
| `public/textures/` | `terrain/{biome}/`, `water/`, `environment/` (cloud, night HDRI) |
| `story-mechanics/` | GDD — vision, phases, ascension tree (read before large gameplay changes) |
| `editor.html` | DEV map editor entry (`src/editor/main-editor.ts`) |
| `src/editor/` | Terrain sculpt/paint, entity place mode, save/load UI |
| `vite/mapDevApiPlugin.ts` | DEV POST `/api/dev/maps/save` → `public/maps/` |

Use a **file path comment** on new modules (e.g. `// src/rendering/Foo.ts`) to match existing files.

## Grass subsystem (`src/world/grass/`)

Revo-inspired GPU grass: 3 LOD rings, SSBO compaction, indirect `InstancedMesh` draw. Optional edelweiss flower field shares the same compute patterns.

**Entry:** `grass/core/GrassSystem.ts` — `initGrassSystem()` / `GrassSystem` interface. Importers: `main.ts`, `WorldBuilder.ts`, `DevPanel.ts`, `devPanelGrass.ts`.

**Per-frame:** `grassSystem.update()` in the game loop; `await grassSystem.whenComputeReady()` before `postFX.render()` so compaction finishes first.

```
grass/
  core/       GrassSystem.ts, grassFieldManager.ts, grassComputeQueue.ts
  compute/    grassSsbo.ts, flowerSsbo.ts, *SsboPack.ts
    shared/   vegetationIndirectTsl.ts, vegetationVisibilityTsl.ts, vegetationWrapTsl.ts
  render/     grassMaterial.ts, flowerMaterial.ts, grassGeometry.ts, *RingField.ts
  tsl/        grassWindTsl.ts, grassFrustumVisibilityTsl.ts, grassNightLightingTsl.ts; shared wrap/hemi in `rendering/tsl/foliageWrapHemisphereTsl.ts`
  config/     grassConfig.ts, grassFieldMetrics.ts, flowerConfig.ts, grassUniforms.ts, applyGrassDevUniforms.ts
  data/       grassDataTexture.ts, applyMapGrassSettings.ts, loadGrassWindAtlas.ts, loadFlowerSprite.ts
```

| Concern | Where |
|---------|--------|
| Shipped tunables | `VISUAL.grass` in `visualTuning.ts` → `grass/config/grassConfig.ts` → `grassFieldMetrics.ts` |
| Shared GPU uniforms | `grass/config/grassUniforms.ts` (`grassSharedUniforms`) |
| Map biome densities | `grass/data/applyMapGrassSettings.ts` |
| DEV sliders | `ui/dev/devPanelGrass.ts` → `grass/config/applyGrassDevUniforms.ts` |
| Ring create/rebuild/dispose | `grass/core/grassFieldManager.ts` |
| Compute queue + rebuild serialization | `grass/core/grassComputeQueue.ts` |

Full page reload after `visualTuning.ts` grass changes or terrain/material edits that re-seed grass data.

## Terrain subsystem (`src/world/terrain/`)

Biome-splat terrain: Poly Haven glTF packs → canvas atlases → TSL `MeshBasicNodeMaterial` with manual sun/ambient/shadow lighting. Mesh build stays in `src/world/MapTerrainBuilder.ts`.

**Play mode** uses a **fine player-follow center patch** (1024-ref vertex step) plus a **world-fixed coarse macro base** (`meshSegments / farStepMul`), both using the **same splat shader** with complementary alpha cutouts at `detailRadiusM`. Detail disp atlas samples are skipped outside the ring via TSL `If`. **Editor** keeps a denser flat `PlaneGeometry` with no radial fade.

**Entry:** `terrain/index.ts` — `loadTerrainTextures`, `createTerrainSplatMaterial`, `syncTerrainSplatLighting`, `applyTerrainDevUniforms`, `createTerrainLodBoundsDebug`. Importers: `main.ts`, `MapTerrainBuilder.ts`, `worldLighting.ts`, `devPanelTerrain.ts`.

```
terrain/
  config/     terrainBiomeTuning.ts, terrainTextureManifest.ts
  loaders/    loadTerrainTextures.ts, loadBiomeMapsFromGltfPack.ts, terrainDisplacement.ts, …
  atlas/      atlasConstants.ts, terrainMapAtlas.ts
  material/   createBiomeSplatMaterial.ts, syncTerrainSplatLighting.ts, biomeSplatUniforms.ts,
              biomeSplatDisplacement.ts, biomeSplatShading.ts, applyTerrainDevUniforms.ts
  tsl/        biomeAtlasUv.ts, biomeSplatWeights.ts, terrainMacroHeightTsl.ts, terrainClipmapOpacityTsl.ts
  lod/        terrainLodRings.ts, terrainLodDebug.ts, terrainLodStats.ts
  shadow/     terrainShadowCast.ts
```

| Concern | Where |
|---------|--------|
| Shipped visual tunables | `VISUAL.terrain` in `visualTuning.ts` → `config/terrainBiomeTuning.ts` |
| Play mesh layout | `lod/terrainLodRings.ts` — fine center patch + coarse macro; `createPlayTerrainLodMesh` |
| Detail disp ring | `tsl/terrainClipmapOpacityTsl.ts` — radial fade + complementary mesh cutouts (`terrainMeshLayer`) |
| Play terrain | Always on in play (`WorldBuilder` → `buildMapTerrain({ lod: true })`); editor passes `lod: false` |
| GPU macro height | `map/MapGrids.ts` (`createHeightTexture`) → `uHeightTex` in `biomeSplatUniforms.ts` |
| Vertex displacement | `material/biomeSplatDisplacement.ts` — macro Y always; detail disp inside ring only (`If` skips atlas samples outside `detailRadiusM`) |
| Per-frame detail origin | `MapTerrainBuilder.updateLod` ← `main.ts` — snaps fine patch + `uDetailPatchOrigin` to finest grid |
| Texture manifest / glTF paths | `config/terrainTextureManifest.ts` |
| Fail-fast pack load | `loaders/loadBiomeMapsFromGltfPack.ts` (throws `TerrainPackLoadError`) |
| Atlas pack + init | `atlas/terrainMapAtlas.ts` — `buildTerrainBiomeAtlases`, `initTerrainAtlases` |
| Material composer | `material/createBiomeSplatMaterial.ts` |
| Per-frame lighting sync | `material/syncTerrainSplatLighting.ts` ← `worldLighting.ts` |
| Shared biome weights (TSL) | `tsl/biomeSplatWeights.ts` — height/paint/snow weights for disp + shading |
| Plateau shimmer fix | `material/biomeSplatShading.ts` — `plateauFlatness` blend on `nWorldLit` |
| DEV sliders | `ui/dev/devPanelTerrain.ts` → `material/applyTerrainDevUniforms.ts` |
| DEV detail-ring debug | `lod/terrainLodDebug.ts` — detail circles + fine mesh square bounds |
| Macro shadow caster | Dedicated CPU-baked mesh (`shadowMeshSegments`), decoupled from visible play mesh |

Full page reload after `visualTuning.ts` terrain changes, atlas re-pack, or paint-map upload.

## 3D assets (`public/models/` and `public/textures/`)

- Add assets directly under **`public/`** — the game loads from there only (see `src/assets/assetManifest.ts`, `collectAllAssetPaths()`).
- **3D layout:** `public/models/glTF/` — glTF + co-located `.bin` / `.png` textures (trees, rocks, plants, flowers, etc.). Catalog keys in `src/assets/assetManifest.ts`; shadow casters in `src/world/mapProps/propShadowKeys.ts`.
- **Terrain textures:** `public/textures/terrain/{biome}/` — Poly Haven 2K glTF packs (`{pack}_2k.gltf` + `textures/*.jpg`); `mountain/` for rock splat; `snow/` for height-based peak blend.
- **Environment textures:** `public/textures/environment/` (`night-sky.exr`).
- **Grass textures:** `public/textures/grass/` (`noise-atlas.png` wind/bake atlas, `edelweiss.png` flower sprite).
- One-time legacy restructure: `scripts/migrate-public-assets.ps1` (targets `public/` only).

## Map editor (DEV)

- **Entry:** `editor.html` → `createEditorSession()` in `src/editor/EditorSession.ts` (WebGPU, same stack as play mode).
- **Tools:** Sculpt (height grid), Paint (biome grid, including Path), Place (entities from asset sidebar + gizmo). Place has **Single** (drag-drop, select, gizmo) and **Brush** sub-modes (`src/editor/tools/PropBrushTool.ts`): shift+click props in the asset sidebar to build a mix, LMB scatter, Shift+LMB erase; options in the asset sidebar panel.
- **Save:** Toolbar Save or Ctrl+S; first save prompts for map id. Writes via `MapIO.saveMapToProject` / `vite/mapDevApiPlugin.ts`. Restart dev server after plugin changes.
- **Validation:** Shared `src/map/validateMapPayload.ts` (client + save API). Entities: `mapEntityCatalog.isValidMapEntity`.
- **New maps:** `createEmptyMapGrids()` — flat height, Shore biome; no procedural bake.
- **Reload:** Full page reload after changing grid size / `phase0` world segments. Map switch reloads grids in-session via `EditorPlaceMode.rebind`.
- **Docs:** `story-mechanics/MAPS.md` for authored map schema and play catalog.

## Workflow rules

1. **Full page reload** after changing the play map, `phase0.ts`, `visualTuning.ts`, or anything that re-seeds map prop instancing / height samples. HMR is not enough for map terrain regeneration.
2. **Play maps:** Runtime always loads `public/maps/{id}.json` from manifest (or `?map=id`). No procedural play island. Editor new maps start blank (`createEmptyMapGrids`: flat height, Shore biome). Future multi-region travel: `story-mechanics/MAPS.md`.
3. **Shader warmup:** `compileAsync` runs after the world is built — expect first-frame cost if you add many new materials; keep dev meshes in-scene when profiling.
4. **DEV-only code** must stay behind `import.meta.env.DEV` (dev panel, GPU logs, shadow debug).
5. **Minimize scope** — match surrounding patterns; avoid unrelated refactors.
6. **Commits** — only when the user explicitly asks.

## Rendering notes

- **Bloom:** Single scene pass; emissive/glow via HDR `colorNode` — no MRT (Chrome-safe). Sky bloom attenuation: `postfx/bloomSkyMask.ts`, tunables in `PHASE0.BLOOM`.
- **God rays:** `GodraysNode` + mask in `postfx/godraysMask.ts` / `godraysComposite.ts`. DEV sliders: **Light shafts / god rays** (defaults in `visualTuning.ts` → `VISUAL.godrays`).
- **Depth of field:** `DepthOfFieldNode` in `postfx/createPostFxPipeline.ts` (after bloom/god rays composite, before FXAA). Auto-focus on player; bokeh scales with energy (8 at 0% → 3 at 100%, `postfx/dofReveal.ts`). DEV: **Depth of field** + Render debug **Disable DoF**.
- **Sky:** Night EXR from `VISUAL.sky.nightHdri.path` (`rendering/sky/hdri/`); fades on sun elevation (`nightHdriBlend.ts`). Preetham `SkyMesh` in `rendering/sky/SkySystem.ts` with independent `uSkyExposure`. All lighting signals from `rendering/sky/lightingCurves.ts` keyed on `sunRevealState.elevationDeg`. Post-reveal looping midnight→midnight cycle in `core/reveal/DayCycle.ts` + `rendering/sky/sunCycle.ts` (elevation + azimuth). Sun direction from `sunSpherical.ts` (`sunRevealState.azimuthDeg`).
- **Shadows:** Terrain/tree shadows gated on sun reveal (`core/reveal/WorldReveal` — sun intensity > 0). Night uses player glow only.
- **Clouds:** Preetham `SkyMesh` procedural clouds (`cloudCoverage`, `cloudDensity`, `cloudElevation` in `VISUAL.sky`).
- **Terrain:** Biome splat + path/meadow overlay TSL — see **Terrain subsystem** above. Paint maps required at material creation (no placeholder fallbacks).
- **Grass:** CPU height/biome bake (`grass/data/grassDataTexture.ts`) → GPU compaction (`grass/compute/*Ssbo.ts`) → indirect draw (`grass/render/*RingField.ts`). Draw shaders use SSBO-packed height (grass and flowers).
- **Profiling:** See **Profiling checklist** below (ordered disable list in dev panel).
- **PostFX depth blend:** `postfx/depthAwareBlend.js` is a vendored copy of Three’s helper with an optional `maskFn` for god-ray sky masking until upstream supports it.

## Render loop (per frame)

All pixels go through `postFX.render()` — do not call `renderer.render(scene, camera)` in gameplay.

1. `worldReveal.update` → energy-cap vignette / story trigger (cycle gated on `isSunRevealDone`)
2. `dayCycle.update` → looping sun cycle after 100% energy (left→right arc, south at noon)
3. `syncWorldLighting` → terrain lighting uniforms
4. `cameraRig.update`
5. `terrain.updateLod` (play — fine center patch snap + `uDetailPatchOrigin` on both layers)
6. `updateSunShadowTarget`
7. `nightHdriWeightForGameState` → `skySystem.setNightHdriWeight`
8. `applySkyForReveal(elevationDeg)` — atmosphere + dual exposure from `lightingCurves`
9. `skySystem.update`
10. `syncPantheonWater` (sun elevation, daylight, azimuth)
11. `postFX.setGodraysFromSun`
12. `postFX.setDofFocus` + `postFX.setDofBokehScale` (energy → bokeh)
13. `grassSystem.whenComputeReady()` (when grass enabled)
14. `postFX.render()`

## Configuration

| Layer | File | Role |
|-------|------|------|
| Shipped visual look | `src/config/visualTuning.ts` (`VISUAL`) | Bloom, god rays, sky, HDRI, water, clouds, terrain |
| Legacy / gameplay re-exports | `src/config/phase0.ts` (`PHASE0`) | Energy, orbs, reveal; `PHASE0.BLOOM` etc. from `VISUAL` |
| Runtime dev overrides | `GameState.devSettings` | `renderDebug`, terrain `dirty`, live slider state |
| Sun position (play) | `sunRevealState` in `WorldReveal.ts` | Elevation + azimuth from `DayCycle` / `sunCycle.ts` after energy cap |
| Night baseline + lighting curves | `VISUAL.sky.nightBaseline`, `VISUAL.sky.lightingCurve`, `VISUAL.sky.cycle` | Below-horizon elev, sun/ambient/exposure vs elevation |
| Reveal + static sky fallbacks | `rendering/sky/skyDefaults.ts` | `SKY_NIGHT` / `SKY_DAY`, `NIGHT_BASELINE_ELEVATION_DEG` |
| Dev-only sky merge | `rendering/sky/skyDevOverrides.ts` | Merged into `applySkyForReveal` |

- **Gameplay / energy:** `src/config/phase0.ts`
- **Sun azimuth (DEV scrub):** writes `sunRevealState.azimuthDeg`; `sunDevState.lightDistance` for shadow frustum only

When adding a **visual** tunable, add it to `VISUAL` first, then wire the dev panel if artists need live sliders. Gameplay tunables stay in `PHASE0`. Prefer `VISUAL` over new `PHASE0.*` literals in new rendering code.

## Profiling checklist (DEV)

Use dev panel **Render debug** in this order to isolate cost:

1. Hide water / terrain / map props / sky
2. Disable god rays → DoF → bloom → shadows → AA
3. Log GPU info / periodic `renderer.info`

Full page reload after `visualTuning.ts` or terrain/material changes.

## Installed agent skills

Project skills are in `.agents/skills/` (see `skills-lock.json`). Prefer these by task:

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
npm run build   # tsc + vite build
npm run lint    # biome lint only
npm run check   # biome check (lint + format + imports)
```

## Browser support

Chrome 113+, Edge 113+, Safari 18+. Firefox WebGPU is still uneven — see README if the app does not start.

## Story / phase context

Current implementation target is **Phase 0 (God Particle)**: collect energy from orbs, sun reveal at energy cap, story fragments via `StoryLog`. Standing stones and named landmarks are deferred (design in `story-mechanics/`; runtime wiring TBD in editor). See `story-mechanics/OVERVIEW.md` and `story-mechanics/PHASE_0_GOD_PARTICLE.md` before changing win conditions or energy economy.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **pantheon** (11055 symbols, 25942 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user. For unified PDG impact, add `mode: "pdg"` with optional `line: <N>` — it returns statement-level `affectedStatements` over CDG + REACHING_DEF and inter-procedural symbols in `interproceduralByDepth`/`byDepth`; no-layer/degraded PDG results are UNKNOWN-risk notes (`--pdg` layer).
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).
- For control/data dependence, `pdg_query({mode: "controls", target: "fileOrSymbol"})` answers "under what condition does X run?" (CDG, incl. guard clauses) and `pdg_query({mode: "flows", target, variable})` traces "where does variable Y flow?" (REACHING_DEF). `--pdg` layer.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/pantheon/context` | Codebase overview, check index freshness |
| `gitnexus://repo/pantheon/clusters` | All functional areas |
| `gitnexus://repo/pantheon/processes` | All execution flows |
| `gitnexus://repo/pantheon/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
