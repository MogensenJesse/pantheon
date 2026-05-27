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
| `src/config/phase0.ts` | Phase 0 gameplay + render tunables (scatter counts, bloom, god rays, landmarks) |
| `src/core/` | Game loop, input, camera, `GameState`, event bus |
| `src/world/` | Terrain, scatter, grass, clouds, landmarks, journey path |
| `src/rendering/` | Scene, sky, post-FX, camera rig, WebGPU helpers |
| `src/rendering/postfx/` | Individual TSL post effects (bloom mask, god rays, vignette, etc.) |
| `src/entities/` | Player, orbs, visuals |
| `src/ui/` | HUD, dev panel (`import.meta.env.DEV` only) |
| `src/dev/` | Render debug controller, lighting sync, GPU/post-FX debug |
| `public/textures/` | Terrain, grass, cloud assets |
| `story-mechanics/` | GDD — vision, phases, ascension tree (read before large gameplay changes) |

Use a **file path comment** on new modules (e.g. `// src/rendering/Foo.ts`) to match existing files.

## Workflow rules

1. **Full page reload** after changes to `phase0.ts`, `AssetScatterer`, `TerrainGenerator`, or anything that re-seeds instanced placements / height samples. HMR is not enough for scatter or terrain regeneration.
2. **Shader warmup:** `compileAsync` runs after the world is built — expect first-frame cost if you add many new materials; keep dev meshes in-scene when profiling.
3. **DEV-only code** must stay behind `import.meta.env.DEV` (dev panel, GPU logs, shadow debug).
4. **Minimize scope** — match surrounding patterns; avoid unrelated refactors.
5. **Commits** — only when the user explicitly asks.

## Rendering notes

- **Bloom:** Single scene pass; emissive/glow via HDR `colorNode` — no MRT (Chrome-safe). Sky bloom attenuation: `postfx/bloomSkyMask.ts`, tunables in `PHASE0.BLOOM`.
- **God rays:** `GodraysNode` + mask in `postfx/godraysMask.ts` / `godraysComposite.ts`.
- **Sky:** Large dome (`SKY_SCALE` in `sceneConstants.ts`); sun direction from `sunSpherical.ts` / `sunDevState.ts`.
- **Shadows:** Terrain/tree shadows gated on sun reveal (`WorldReveal` — sun intensity > 0). Night uses player glow only.
- **Clouds:** SkyMesh shader clouds only (`USE_HORIZON_CLOUDS = false` in `skyDefaults.ts`). Horizon billboard rings stay code-only until re-enabled; `CloudSystem.ts` still owns the rebuild path for when the flag flips. Billboard `InstancedMesh.frustumCulled = true` — the AGENTS-historical "camera inside shell" note referred to the now-gated rings.
- **Terrain:** Biome splat + path blend TSL (`world/terrain/`). Path segment count is uniform-driven, not a fixed loop.
- **Profiling:** Dev panel — hide terrain/clouds, disable bloom/god rays/shadows, log `renderer.info`.

## Configuration

- **Gameplay / scatter / post defaults:** `src/config/phase0.ts`
- **Runtime dev overrides:** `GameState.devSettings` in `src/core/GameState.ts` (cloud, grass, render debug)
- **Sun/sky dev sliders:** `sunDevState.ts`, dev panel `src/ui/dev/devPanelSky.ts`

When adding a tunable, prefer `PHASE0` for shipped defaults and wire the dev panel only if artists need live tweaking.

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
