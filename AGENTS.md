# Pantheon — Agent Guide

Phase 0 prototype: a divine remnant explores a procedural island (Three.js WebGPU + Vite + TypeScript). Design intent and lore live in `story-mechanics/`; runtime tunables live in `src/config/phase0.ts`.

## Stack (non-negotiable)

- **Renderer:** `WebGPURenderer` only — no WebGL fallback. Entry check: `src/rendering/webgpuCapability.ts`.
- **Shaders:** Prefer **TSL** (`three/tsl`, `Mesh*NodeMaterial`, `RenderPipeline`) over raw GLSL `ShaderMaterial`. Post-FX uses `three/addons/tsl/display/*` nodes.
- **Imports:** `import * as THREE from 'three/webgpu'` (or granular `three` + `three/webgpu` where the file already does).
- **Build:** Vite, `esnext` target. Do **not** start `npm run dev` — the user runs the dev server manually.

## Project layout

| Path | Purpose |
|------|---------|
| `src/main.ts` | Bootstrap: WebGPU check, assets, world build, loop |
| `src/config/phase0.ts` | Phase 0 gameplay tunables (scatter, landmarks, energy) |
| `src/config/visualTuning.ts` | **Visual look** — sky, bloom, god rays, water, grass, clouds, terrain (production + dev panel) |
| `src/core/` | Game loop, input, camera, `GameState`, event bus |
| `src/world/` | Terrain, scatter, grass, clouds, landmarks, journey path |
| `src/core/reveal/` | Energy-cap sun reveal (`WorldReveal.ts`) |
| `src/rendering/` | Scene, post-FX, camera rig, WebGPU helpers |
| `src/rendering/sky/` | `SkySystem`, `CloudSystem`, reveal blend, `skyDefaults` |
| `src/rendering/sky/hdri/` | Night EXR load, HDRI weight, runtime tuning |
| `src/rendering/debug/` | DEV GPU / render / shadow debug logs |
| `src/rendering/loaders/` | Shared texture loaders (e.g. cloud puff) |
| `src/rendering/postfx/` | Individual TSL post effects (bloom mask, god rays, vignette, etc.) |
| `src/world/water/` | Water mesh + `loadWaterNormals.ts` |
| `src/entities/` | Player, orbs, visuals |
| `src/ui/` | HUD, dev panel (`import.meta.env.DEV` only) |
| `src/dev/` | Render debug controller, lighting sync, GPU/post-FX debug |
| `public/textures/` | Terrain, grass, cloud assets |
| `story-mechanics/` | GDD — vision, phases, ascension tree (read before large gameplay changes) |

Use a **file path comment** on new modules (e.g. `// src/rendering/Foo.ts`) to match existing files.

## Workflow rules

1. **Full page reload** after changes to `phase0.ts`, `visualTuning.ts`, `AssetScatterer`, `TerrainGenerator`, or anything that re-seeds instanced placements / height samples. HMR is not enough for scatter or terrain regeneration.
2. **Shader warmup:** `compileAsync` runs after the world is built — expect first-frame cost if you add many new materials; keep dev meshes in-scene when profiling.
3. **DEV-only code** must stay behind `import.meta.env.DEV` (dev panel, GPU logs, shadow debug).
4. **Minimize scope** — match surrounding patterns; avoid unrelated refactors.
5. **Commits** — only when the user explicitly asks.

## Rendering notes

- **Bloom:** Single scene pass; emissive/glow via HDR `colorNode` — no MRT (Chrome-safe). Sky bloom attenuation: `postfx/bloomSkyMask.ts`, tunables in `PHASE0.BLOOM`.
- **God rays:** `GodraysNode` + mask in `postfx/godraysMask.ts` / `godraysComposite.ts`. DEV sliders: **Light shafts / god rays** (defaults in `visualTuning.ts` → `VISUAL.godrays`).
- **Depth of field:** `DepthOfFieldNode` in `postfx/createPostFxPipeline.ts` (after bloom/god rays composite, before FXAA). Auto-focus on player; bokeh scales with energy (8 at 0% → 3 at 100%, `postfx/dofReveal.ts`). DEV: **Depth of field** + Render debug **Disable DoF**.
- **Sky:** Night EXR from `VISUAL.sky.nightHdri.path` (`rendering/sky/hdri/`); fades on sun elevation (`nightHdriBlend.ts`). Preetham `SkyMesh` in `rendering/sky/SkySystem.ts`. Sun direction from `sunSpherical.ts` / `sunDevState.ts`.
- **Shadows:** Terrain/tree shadows gated on sun reveal (`core/reveal/WorldReveal` — sun intensity > 0). Night uses player glow only.
- **Clouds:** Preetham `SkyMesh` clouds plus horizon rings when `USE_HORIZON_CLOUDS = true` in `rendering/sky/skyDefaults.ts` (`CloudSystem.ts`). Set the flag to `false` to drop the rings.
- **Terrain:** Biome splat + path blend TSL (`world/terrain/`). Path segment count is uniform-driven, not a fixed loop.
- **Profiling:** See **Profiling checklist** below (ordered disable list in dev panel).
- **PostFX depth blend:** `postfx/depthAwareBlend.js` is a vendored copy of Three’s helper with an optional `maskFn` for god-ray sky masking until upstream supports it.

## Render loop (per frame)

All pixels go through `postFX.render()` — do not call `renderer.render(scene, camera)` in gameplay.

1. `worldReveal.update` → sun elevation / reveal progress
2. `syncWorldLighting` → terrain + grass lighting uniforms
3. `scatterer.updateGrassCull`
4. `cameraRig.update`
5. `updateSunShadowTarget`
6. `nightHdriWeightForGameState` → `skySystem.setNightHdriWeight`
7. `applySkyForReveal` (during / after reveal)
8. `skySystem.update`
9. `syncPantheonWater` (sun elevation, daylight, azimuth)
10. `postFX.setGodraysFromSun`
11. `postFX.setDofFocus` + `postFX.setDofBokehScale` (energy → bokeh)
12. `postFX.render()`

## Configuration

| Layer | File | Role |
|-------|------|------|
| Shipped visual look | `src/config/visualTuning.ts` (`VISUAL`) | Bloom, god rays, sky, HDRI, water, grass, clouds, terrain |
| Legacy / gameplay re-exports | `src/config/phase0.ts` (`PHASE0`) | Scatter, landmarks, energy; `PHASE0.BLOOM` etc. from `VISUAL` |
| Runtime dev overrides | `GameState.devSettings` | `renderDebug`, grass/terrain `dirty`, live slider state |
| Reveal + static sky fallbacks | `rendering/sky/skyDefaults.ts` | `SKY_NIGHT` / `SKY_DAY`, `USE_HORIZON_CLOUDS`, `SUN_REVEAL` |
| Dev-only sky merge | `rendering/sky/skyDevOverrides.ts` | Merged into `applySkyForReveal` |

- **Gameplay / scatter / landmarks:** `src/config/phase0.ts`
- **Sun azimuth (DEV):** `sunDevState.ts`; sky elevation is reveal-driven (`WorldReveal` in `core/reveal/`)

When adding a **visual** tunable, add it to `VISUAL` first, then wire the dev panel if artists need live sliders. Gameplay tunables stay in `PHASE0`. Prefer `VISUAL` over new `PHASE0.*` literals in new rendering code.

## Profiling checklist (DEV)

Use dev panel **Render debug** in this order to isolate cost:

1. Hide water / terrain / scatter / clouds / sky
2. Disable god rays → DoF → bloom → shadows → AA
3. Log GPU info / periodic `renderer.info`

Full page reload after `visualTuning.ts` or material/scatter changes.

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
npm run lint    # eslint src
```

## Browser support

Chrome 113+, Edge 113+, Safari 18+. Firefox WebGPU is still uneven — see README if the app does not start.

## Story / phase context

Current implementation target is **Phase 0 (God Particle)**: collect energy, discover standing stones, world reveal tied to sun/lighting. See `story-mechanics/OVERVIEW.md` and `story-mechanics/PHASE_0_GOD_PARTICLE.md` before changing win conditions, energy economy, or landmark behavior.
