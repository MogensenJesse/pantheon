# Pantheon

Phase 0 prototype — divine remnant exploring authored maps (Three.js + Vite + WebGPU).

## Maps

Play mode loads JSON maps from `public/maps/` (listed in `public/maps/manifest.json`). On first visit, pick a map from the startup chooser, or use `?map=your-map-id`. Author maps in the DEV map editor (`/editor.html`). See [`story-mechanics/MAPS.md`](story-mechanics/MAPS.md).

## Requirements

Pantheon renders with **WebGPU** via `WebGPURenderer` (Three.js r176). A WebGPU-capable browser is required:

- Chrome 113+ or Edge 113+
- Safari 18+ (macOS / iOS)
- Firefox: WebGPU support is still rolling out; use Chrome/Edge/Safari if the game does not start

If WebGPU is unavailable, the app shows Three.js’s standard capability message and does not fall back to WebGL.

## Scripts

- `npm run dev` — local development (start manually when needed)
- `npm run build` — typecheck and production bundle
- `npm run lint` — Biome linter only (no formatting)
- `npm run lint:fix` — apply safe lint fixes (no formatting)
- `npm run format` — format with Biome
- `npm run format:check` — check formatting without writing
- `npm run check` — lint + format + import sort (full Biome check)
- `npm run check:fix` — apply all safe Biome fixes

## Development notes

- **Maps / world build:** Changing the active map, `phase0.ts`, or `visualTuning.ts` usually requires a **full page reload** (not only HMR) to rebuild terrain and map-authored props.
- **Phase 0 tunables** live in `src/config/phase0.ts` (energy cap, orb absorb, reveal).
- **Dev panel** (DEV builds only): energy cheats, post-FX sliders, bloom quality preset, GPU debug toggles (hide terrain/clouds, log `renderer.info`).

## WebGPU performance notes

- **Bloom:** Single scene pass; glow meshes write HDR-bright `colorNode` values, post extracts bloom via luminance threshold (no MRT — Chrome-safe).
- **Sky:** Preetham `SkyMesh` atmosphere + night HDRI in [`SkySystem.ts`](src/rendering/sky/SkySystem.ts); dome scale follows `CAMERA_FAR` from [`sceneConstants.ts`](src/rendering/sceneConstants.ts).
- **Shadows:** Tree/rock shadow maps and terrain `shadow(sun)` darkening only run after the sun reveal at 100% energy (`sun.intensity > 0`). At night, only the player glow lights the ground.
- **Terrain:** Biome splat blends shore/forest/hills/rock textures; **Path** and **Meadow** are painted overlay biomes with dedicated textures under `public/textures/terrain/path/` and `meadow/`.
- **Clouds:** Mesh-cluster soft spheres (`VISUAL.clouds`) plus Preetham dome layer (`VISUAL.sky.static`); dome wind follows mesh wind.
- **Shader warmup:** `compileAsync` runs after map props and orb/player meshes are in the scene to avoid post-load hitches.
- **Profiling:** In DEV, use **Hide terrain** / **Hide clouds** and **Log GPU info** in the dev panel to isolate cost.
