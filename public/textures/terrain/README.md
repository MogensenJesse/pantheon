# Terrain ground textures

Poly Haven **2K glTF material packs** — one per biome folder. The game parses each pack's `.gltf` JSON (no mesh load) and loads JPG maps from the nested `textures/` folder.

## Layout (`public/textures/terrain/`)

Each biome folder contains:

| File | Purpose |
|------|---------|
| `{pack}_2k.gltf` | Material manifest — register filename in `TERRAIN_GLTF_PACKS` (`src/world/terrain/terrainTextureManifest.ts`) |
| `{pack}.bin` | Preview mesh only — **not loaded at runtime** (safe to delete) |
| `textures/*.jpg` | Diffuse, normal, rough/MR/ARM maps referenced by the glTF |

**Biome splat folders:** `shore`, `forest`, `hills`, `mountain`, `path`, `meadow`

**Height blend only:** `snow/` — blended onto high-elevation mountain surfaces in the shader (not a paint biome).

## ORM packing

The engine packs Poly Haven maps into one ORM texture (R = roughness, G = AO, B = metalness):

| Source | Remap |
|--------|-------|
| `*_rough_2k.jpg` | G → roughness; AO = 1; metal = 0 |
| `*_arm_2k.jpg` | Poly Haven R=AO, G=rough, B=metal → our ORM channels |

Displacement is not used in current packs — a neutral 1×1 fallback is used.

## Adding / replacing a biome

1. Drop a Poly Haven 2K glTF pack into `public/textures/terrain/{biome}/`
2. Set the glTF filename in `TERRAIN_GLTF_PACKS` in code
3. Remove any legacy flat `color.jpg` / `normal.jpg` files from that folder

## VRAM

Seven texture sets at 2K use significant GPU memory. Downscale to 1K later if needed.
