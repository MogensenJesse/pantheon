# Environment textures

## `night-sky.exr`

Equirectangular night HDRI used for:

- PMREM environment map (`loadNightHdri.ts`)
- Sky background TSL (`nightHdriBackgroundTsl.ts`)

**Shipped resolution:** 4096×2048 (ZIP OpenEXR). Path: `/textures/environment/night-sky.exr` (`VISUAL.sky.nightHdri.path`).

Source masters are often 8K; re-bake after replacing the file:

```bash
npm run bake:night-exr
# optional: npm run bake:night-exr -- --width 2048
```

Script: `scripts/downscale-night-exr.mjs` (requires `hdrify` devDependency). Do not leave a second full-res copy under `public/`.
