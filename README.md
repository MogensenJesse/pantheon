# Pantheon

Phase 0 prototype — divine remnant exploring a procedural island (Three.js + Vite).

## Requirements

Pantheon renders with **WebGPU** via `WebGPURenderer` (Three.js r176). A WebGPU-capable browser is required:

- Chrome 113+ or Edge 113+
- Safari 18+ (macOS / iOS)
- Firefox: WebGPU support is still rolling out; use Chrome/Edge/Safari if the game does not start

If WebGPU is unavailable, the app shows Three.js’s standard capability message and does not fall back to WebGL.

## Scripts

- `npm run dev` — local development (start manually when needed)
- `npm run build` — typecheck and production bundle
- `npm run lint` — ESLint on `src/`

## Development notes

- **Scatter / terrain tuning:** Changes to `src/config/phase0.ts`, `AssetScatterer`, or terrain generation often require a **full page reload** (not only HMR) to regenerate instanced placements and height samples.
- **Phase 0 tunables** live in `src/config/phase0.ts` (orb count, grass density, dwell radii, landmark energy).
- **Dev panel** (DEV builds only): energy cheats, post-FX sliders, bloom quality preset, GPU debug toggles (hide terrain/clouds, log `renderer.info`).

## WebGPU performance notes

- **Bloom:** Single scene pass; glow meshes write HDR-bright `colorNode` values, post extracts bloom via luminance threshold (no MRT — Chrome-safe).
- **Sky:** Dome scale is `SKY_SCALE` (450) with `camera.far` 2000 in [`skyConstants.ts`](src/rendering/skyConstants.ts); sky/cloud shells use far-plane depth (`z = w`).
- **Terrain:** Custom TSL lighting does not sample shadow maps (unchanged from WebGL); tree/rock shadows appear only after the sun reveal at 100% energy.
- **Terrain:** Path distance runs in the vertex shader; `vPathW` is reused in the fragment shader. Path segment loop length follows `uPathSegCount` (not a fixed 48 iterations).
- **Clouds:** Shell uses 3 FBM octaves; frustum culling disabled (camera is inside the shell).
- **Shader warmup:** `compileAsync` runs after scatter, landmarks, and orb/player meshes are in the scene to avoid post-load hitches.
- **Profiling:** In DEV, use **Hide terrain** / **Hide clouds** and **Log GPU info** in the dev panel to isolate cost.
