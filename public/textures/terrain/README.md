# Terrain ground textures

## Play mode (baked atlases)

Play loads pre-baked atlases from `atlases/` — **not** the per-biome JPGs at runtime:

| File | Format |
|------|--------|
| `atlases/color.ktx2` | ETC1S sRGB + mips |
| `atlases/normal.ktx2` | UASTC linear + mips |
| `atlases/orm.ktx2` | UASTC linear + mips |
| `atlases/spec.ktx2` | UASTC linear + mips |
| `atlases/detailDisplacement.r8` | Raw R8 (CPU + GPU; uncompressed for CPU sampling) |

Rebuild after changing biome packs:

```bash
npm run bake:terrain-atlases
```

Requires `toktx` (KTX-Software) and `sharp`. Editor canvas-packs **color only** from the biome folders below (live folder scan in DEV).

---

Each biome folder is one PBR material. Drop **Poly Haven**, **ambientCG**, or other sets with standard map names — no rename required. The bake script and editor scan for:

| Role | Names recognized |
|------|------------------|
| Color | `Color`, `diff` / `diffuse`, `albedo`, `basecolor` |
| Normal | `NormalGL`, `nor_gl` (OpenGL; prefer this over DirectX) |
| Roughness | `Roughness`, `rough`, or packed `arm` / `orm` |
| AO | `AmbientOcclusion`, `ao` (composed into ORM when not using ARM) |
| Specular | `spec` / `specular` (optional; missing → white) |
| Displacement | `Displacement`, `disp`, `height` (optional) |

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

## ORM packing

`npm run bake:terrain-atlases` packs maps into one ORM atlas (R = roughness, G = AO, B = metalness). Play loads `atlases/orm.ktx2`; it does not pack at runtime.

| Source | Remap |
|--------|-------|
| `Roughness` / `*_rough_*` | G → roughness; AO from a separate AO map or 1; metal from Metalness or 0 |
| `*_arm_*` | Poly Haven R=AO, G=rough, B=metal → our ORM channels |
| `*_orm_*` | Already R=rough, G=AO, B=metal — copied through |

**Specular:** included when a `spec` / `specular` map is found (or `KHR_materials_specular` on a glTF). Otherwise the spec atlas tile is white.

## Per-biome tuning (dev panel)

Each atlas slot (`shore` … `rock`) has independent controls:

| Control | Effect |
|---------|--------|
| **Tile repeat** | World XZ UV scale for that biome's atlas samples |
| **Detail vertex disp.** | `(height - 0.5) * scale` along normal for that biome |
| **Normals** | Tangent normal strength multiplier |
| **Roughness** | Multiplier on ORM roughness (1 = as-authored) |

**Snow** also has height-based settings: snow start, snow end, snow spread.

Defaults live in `VISUAL.terrain.biomes` and `VISUAL.terrain.snow` (`src/config/visualTuning.ts`).

## Displacement

Displacement is optional. ambientCG ZIPs usually include it; Poly Haven glTF packs do not (download `*_disp_*` separately).

**Recommended:** **1024² (1K)** JPG/PNG. The scanner prefers 1K over 2K for disp. 2K/4K sources are resized to the 1K atlas tile.

```
textures/{name}_disp_1k.jpg
Ground037_2K-JPG_Displacement.jpg
```

Meadow has no displacement (grass-covered). JPEG displacement is passed through raw.

### Land vs overlay blending

| Source | Displacement | Albedo / normals |
|--------|--------------|------------------|
| Height / biomeMap (4 land weights) | **Dominant** biome | Weighted splat |
| pathMap (brush) | **mix** path disp | Weighted path overlay |
| meadowMap (brush) | *(none — grass)* | Weighted meadow overlay |
| Snow (height-based) | **mix** snow disp | Weighted snow overlay |

Vertex displacement uses a **1K R8 detail atlas** (3072², single-channel) per biome slot, sampled at each biome's tile repeat.

### Nyquist / mesh density

Target **~8–16 texels per vertex** at each biome's tile period:

```
tilePeriodM = 1 / tileRepeat
vertexSpacingM = worldSize / meshSegments
texelsPerVertex ≈ (1024 / tilePeriodM) * vertexSpacingM
```

`meshSegments` requires a full page reload. The 128×128 sculpt grid is unchanged.

## Adding / replacing a biome

1. Unzip or copy maps into `public/textures/terrain/{biome}/` (2K color/normal/rough preferred; 1K is upscaled). Remove the previous material if you don't want the scanner to pick it.
2. Register a **new** biome folder in `TERRAIN_ATLAS_BIOME_INDEX` only when adding a slot (not when swapping forest/hills/etc.).
3. Add `VISUAL.terrain.biomes.{biome}` tunables (and a paint `BiomeId` if it should be brushable) — only for new slots.
4. Restart the Vite dev server **once** after this ingest landed (new `/api/dev/terrain-biome-maps`). Later drops only need an editor reload.
5. Run `npm run bake:terrain-atlases` and full-page-reload **play**. Editor color updates without a bake; play does not.

The 3×3 atlas has nine slots; snow is height-blended (not painted). `rock` is the steep-slope overlay (slot 7).

## VRAM

Five atlases: 2K color/normal/ORM/spec + 1K R8 detail displacement (3072² atlas) across eight of nine biome slots.
