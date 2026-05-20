# Pantheon

Phase 0 prototype — divine remnant exploring a procedural island (Three.js + Vite).

## Scripts

- `npm run dev` — local development (start manually when needed)
- `npm run build` — typecheck and production bundle
- `npm run lint` — ESLint on `src/`

## Development notes

- **Scatter / terrain tuning:** Changes to `src/config/phase0.ts`, `AssetScatterer`, or terrain generation often require a **full page reload** (not only HMR) to regenerate instanced placements and height samples.
- **Phase 0 tunables** live in `src/config/phase0.ts` (orb count, grass density, dwell radii, landmark energy).
- **Dev panel** (DEV builds only): energy cheats, post-FX sliders, bloom quality preset.
