# Terrain ground textures

## Play mode (baked atlases)

Play loads pre-baked atlases from `atlases/` — **not** the per-biome JPGs at runtime:

| File | Format |
|------|--------|
| `atlases/color.ktx2` | ETC1S sRGB + mips |
| `atlases/ao.ktx2` | ETC1S linear R + mips (play samples `.r`) |

Rebuild after changing biome packs:

```bash
npm run bake:terrain-atlases
```

Requires `toktx` (KTX-Software) and `sharp`. Editor prefers play `color.ktx2`; if the bake is missing it canvas-packs **color only** at 1024 tiles from the biome folders below (live folder scan in DEV).

---

Each biome folder is one material. Drop **Poly Haven**, **ambientCG**, or other sets with standard map names — no rename required. The bake script and editor scan for:

| Role | Names recognized |
|------|------------------|
| Color | `Color`, `diff` / `diffuse`, `albedo`, `basecolor` — **required** |
| Roughness | `Roughness`, `rough`, or packed `arm` / `orm` — **required** for bake |
| AO | `AmbientOcclusion`, `ao` (or ARM R / ORM G) |
| Normal | `NormalGL`, `nor_gl` (optional leftover; play does not bake a normal atlas) |
| Specular | `spec` / `specular` (optional leftover; not baked) |
| Displacement | `Displacement`, `disp`, `height` (optional leftover; not baked) |

Keep **one material per biome folder**. If two complete sets are present, the one with more maps wins (so a leftover Poly Haven pack can lose to a fuller ambientCG unzip).

## Layout (`public/textures/terrain/`)

Each biome folder contains some mix of:

| File | Purpose |
|------|---------|
| `*.jpg` / `*.png` (root or `textures/`) | PBR maps — discovered by filename |
| `{pack}_2k.gltf` (optional) | Legacy Poly Haven manifest; fills roles when image names are generic (`texture_0.jpg`) |
| `{pack}.bin` | Preview mesh only — **not loaded at runtime** (safe to delete) |

**Biome splat folders:** `shore`, `forest`, `hills`, `mountain`, `path`, `meadow`, `rock`

**Height blend only:** `snow/` — blended onto high-elevation mountain surfaces in the shader (not a paint biome).

**Slope overlay:** `rock/` — steep faces (`worldNormal.y` below the slope-rock threshold) mix toward this slot instead of reusing mountain. Not a paint biome.

## AO packing

`npm run bake:terrain-atlases` extracts ambient occlusion into a single-channel atlas. Play loads `atlases/ao.ktx2` and samples `.r`; it does not pack at runtime.

| Source | AO channel |
|--------|------------|
| `*_arm_*` | R (Poly Haven ARM) |
| `*_orm_*` | G (packed ORM) |
| Separate `AmbientOcclusion` / `ao` | R |
| Roughness only (no AO map) | fill 255 (open) |

## Per-biome tuning (dev panel)

Each atlas slot (`shore` … `rock`) has independent **tile repeat** (world XZ UV scale). Snow also has height-based settings: snow start, snow end, snow spread. Stylize (hue-split mix, palettes) and chisel `edgeSoft` live on the same terrain panel.

Defaults live in `VISUAL.terrain.biomes`, `VISUAL.terrain.snow`, and `VISUAL.terrain.chisel` (`src/config/visualTuning.ts`).

Mesh vertex Y uses 8 m chisel facets (`VISUAL.terrain.chisel.stepM`) on the 2048 m world (256 segments). The authored height grid is 2049² (`WORLD.SEGMENTS`). Full page reload after changing either.

## Adding / replacing a biome

1. Unzip or copy maps into `public/textures/terrain/{biome}/` (2K color/rough preferred; 1K is upscaled). Remove the previous material if you don't want the scanner to pick it.
2. Register a **new** biome folder in `TERRAIN_ATLAS_BIOME_INDEX` only when adding a slot (not when swapping forest/hills/etc.).
3. Add `VISUAL.terrain.biomes.{biome}` tunables (and a paint `BiomeId` if it should be brushable) — only for new slots.
4. Restart the Vite dev server **once** after this ingest landed (new `/api/dev/terrain-biome-maps`). Later drops only need an editor reload.
5. Run `npm run bake:terrain-atlases` and full-page-reload **play**. Editor color uses the baked atlas when present.

The 3×3 atlas has nine slots; snow is height-blended (not painted). `rock` is the steep-slope overlay (slot 7).

## VRAM

Two atlases: 2K color + AO (6144² slots, eight of nine biome slots). AO is a single channel.
