# Pantheon

A divine remnant wakes five landmarks on authored maps, then guides a village (Three.js + Vite + WebGPU).

## Maps

Play mode loads JSON maps from `public/maps/` (listed in `public/maps/manifest.json`). A production build starts on the default map; a DEV build shows a map chooser on first visit, or use `?map=your-map-id`. Author maps in the DEV map editor (`/editor.html`). See [`story-mechanics/MAPS.md`](story-mechanics/MAPS.md).

## Requirements

Pantheon renders with **WebGPU** via `WebGPURenderer` (Three.js r186). A WebGPU-capable browser is required:

- Chrome 113+ or Edge 113+
- Safari 18+ (macOS / iOS)
- Firefox: WebGPU support is still rolling out; use Chrome/Edge/Safari if the game does not start

If WebGPU is unavailable, the app shows Three.js’s standard capability message and does not fall back to WebGL.

## Scripts

`npm run dev` (start manually when needed), `build`, `lint`, `typecheck`, `check:fast` / `check:all` and the asset bakes are described in [`AGENTS.md`](AGENTS.md) → Scripts; `package.json` is the list.

## Development notes

- Changing the active map, `phase0.ts`, `visualTuning.ts`, or files under `public/` usually requires a **full page reload** (not only HMR).
- Gameplay tunables: `src/config/phase0.ts` (energy, orbs, landmarks) and `src/config/village.ts` (notes in `docs/village/`); the visual look is in `src/config/visual/`.
- **Dev panel** (DEV builds only): energy cheats, post-FX sliders, GPU debug toggles. Profiling steps: `AGENTS.md` → Profiling checklist.
