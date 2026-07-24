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

Requires `toktx` (KTX-Software) and `sharp`. Editor still canvas-packs color-only from the Poly Haven folders below.

---

Poly Haven **2K glTF material packs** — one per biome folder. These are **bake sources** (and editor color load). The bake script parses each pack's `.gltf` JSON and packs JPG maps into the atlases above.

## Layout (`public/textures/terrain/`)

Each biome folder contains:

| File | Purpose |
|------|---------|
| `{pack}_2k.gltf` | Material manifest — register filename in `TERRAIN_GLTF_PACKS` (`src/world/terrain/terrainTextureManifest.ts`) |
| `{pack}.bin` | Preview mesh only — **not loaded at runtime** (safe to delete) |
| `textures/*.jpg` | Diffuse, normal, rough/MR/ARM maps referenced by the glTF |
| `textures/*_disp_2k.*` | **Optional** displacement height map — separate Poly Haven download (not in glTF) |

**Biome splat folders:** `shore`, `forest`, `hills`, `mountain`, `path`, `meadow`

**Height blend only:** `snow/` — blended onto high-elevation mountain surfaces in the shader (not a paint biome).

## ORM packing

The engine packs Poly Haven maps into one ORM texture (R = roughness, G = AO, B = metalness):

| Source | Remap |
|--------|-------|
| `*_rough_2k.jpg` | G → roughness; AO = 1; metal = 0 |
| `*_arm_2k.jpg` | Poly Haven R=AO, G=rough, B=metal → our ORM channels |

**Specular:** when a pack uses `KHR_materials_specular` (e.g. meadow `*_spec_2k.jpg`), the loader includes it in a spec atlas and modulates highlights in the splat shader.

## Per-biome tuning (dev panel)

Each atlas slot (`shore` … `snow`) has independent controls:

| Control | Effect |
|---------|--------|
| **Tile repeat** | World XZ UV scale for that biome's atlas samples |
| **Detail vertex disp.** | `(height - 0.5) * scale` along normal for that biome |
| **Normals** | Tangent normal strength multiplier |
| **Roughness** | Multiplier on ORM roughness (1 = as-authored) |

**Snow** also has height-based settings: snow start, snow end, snow spread.

Defaults live in `VISUAL.terrain.biomes` and `VISUAL.terrain.snow` (`src/config/visualTuning.ts`).

## Displacement

Poly Haven glTF packs do **not** include displacement. Download separately (EXR, JPG, or PNG).

**Recommended:** pre-downsample offline to **1024² (1K)** and ship as:

```
textures/{material_prefix}_disp_1k.jpg
```

The loader probes `*_disp_1k.*` before `*_disp_2k.*`. Atlases pack displacement at **source resolution** (no runtime downsample). Splat maps stay **2K** via each biome's glTF pack.

Meadow has no displacement (grass-covered). In DEV, JPG is preferred by default. Override with `?dispFmt=exr`.

JPEG displacement is passed through raw; EXR is clamped to 0–1 and lightly re-centered when the mean drifts.

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

1. Drop a Poly Haven 2K glTF pack into `public/textures/terrain/{biome}/`
2. Optionally add a matching `*_disp_2k.*` displacement file to `textures/`
3. Set the glTF filename in `TERRAIN_GLTF_PACKS` in code
4. Remove any legacy flat `color.jpg` / `normal.jpg` files from that folder

## VRAM

Five atlases: 2K color/normal/ORM/spec + 1K R8 detail displacement (3072² atlas) across seven biome slots.
