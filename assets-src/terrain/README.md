# Terrain ground textures (sources)

These are the **source** PBR sets for the terrain atlas. They live outside `public/` on purpose: nothing here is
loaded at runtime or shipped. `npm run bake:terrain-atlases` packs them into the baked files that play and the
editor load.

## What gets baked

| Output | Format | Used by |
|--------|--------|---------|
| `public/textures/terrain/atlases/color.ktx2` | ETC1S sRGB + mips | play and editor |
| `public/textures/terrain/atlases/ao.ktx2` | ETC1S linear R + mips (sampled `.r`) | play (the editor uses a 1×1 stub) |
| `public/textures/terrain/thumbs/{biome}.jpg` | 128 px JPEG | editor biome browser |

Rebuild after changing any biome folder (needs `toktx` from KTX-Software and `sharp`):

```bash
npm run bake:terrain-atlases
```

The baked files are committed, so a fresh clone runs without baking. The editor has no fallback packer: if
`color.ktx2` is missing it fails with "run npm run bake:terrain-atlases".

## Biome folders

Each biome folder is one material. Drop **Poly Haven**, **ambientCG**, or other sets with standard map names, no
rename needed. The scanner recognizes:

| Role | Names recognized | Needed |
|------|------------------|--------|
| Color | `Color`, `diff` / `diffuse`, `albedo`, `basecolor` | **required** |
| AO | `AmbientOcclusion`, `ao`, or the R channel of a packed `arm` / `orm` | optional (open ground, 255, when absent) |
| Roughness, normal, specular, displacement | `Roughness`, `rough`, `NormalGL`, `spec`, `Displacement`, `height`... | ignored (not baked; safe to leave out) |

Packed maps: ARM (Poly Haven) and ORM both keep occlusion in **R**, roughness in G, metalness in B.

Keep **one material per biome folder**. If two complete sets are present, the one with more maps wins.

| Folder | Role |
|--------|------|
| `shore`, `forest`, `hills`, `mountain` | land splat (painted + blurred weights) |
| `path`, `meadow`, `water` | painted overlay biomes; `water` is the seabed under the water plane |
| `rock` | steep-slope overlay (`worldNormal.y` below the slope-rock threshold), not a paint biome |
| `snow` | height-blended onto high mountain surfaces, not a paint biome |

The atlas is 3×3 with nine slots, one per folder, in `TERRAIN_ATLAS_BIOME_INDEX` order
(`src/world/terrain/atlas/atlasConstants.ts`). Each slot is 2048² plus an 8 px gutter, so the baked atlas is
6192² (about 5.7 MB color + 2.6 MB AO as KTX2); 1K sources are upscaled.

## Per-biome tuning (dev panel)

Each slot has an independent **tile repeat** (world XZ UV scale). Snow also has height-based settings: snow start,
snow end, snow spread. Stylize (hue-split mix, palettes) and chisel `edgeSoft` live on the same terrain panel.
Defaults are `VISUAL.terrain` in `src/config/visual/terrain.ts`.

Mesh vertex Y uses 8 m chisel facets (`VISUAL.terrain.chisel.stepM`) on the 2048 m world (256 segments). The
authored height grid is 2049² (`WORLD.SEGMENTS`). Full page reload after changing either.

## Adding / replacing a biome

1. Unzip or copy maps into `assets-src/terrain/{biome}/`. Remove the previous material if you don't want the scanner
   to pick it.
2. Register a **new** biome folder in `TERRAIN_ATLAS_BIOME_INDEX` only when adding a slot (not when swapping
   forest/hills/etc.).
3. Add `VISUAL.terrain.biomes.{biome}` and a stylize palette (and a paint `BiomeId` if it should be brushable) only for
   new slots.
4. Run `npm run bake:terrain-atlases` and full-page-reload play and the editor.
