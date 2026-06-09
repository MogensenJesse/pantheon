# Grass — grass_medium_01 (Poly Haven, CC0)

https://polyhaven.com/a/grass_medium_01

## Runtime files (this folder)

| File | Purpose |
|------|---------|
| `grass_medium_01_4k.gltf` + `grass_medium_01.bin` | Instanced clump variants (see manifest mesh names) |
| `textures/grass_medium_01_diff_4k.jpg` | Diffuse (embedded in glTF) |
| `textures/grass_medium_01_nor_gl_4k.jpg` | Normal (embedded; not used in shader yet) |
| `textures/grass_medium_01_arm_4k.jpg` | AO / rough / metal packed |
| `textures/grass_medium_01_alpha_4k.png` | Opacity cutout (loaded at runtime) |

When you update the pack in gitignored `models/foliage/grass-medium-01/`, copy the whole folder to `public/models/foliage/grass-medium-01/`.

## Blender export (5.x)

1. Delete or hide the `grass_medium_01_geometry_nodes` collection (~1.8M verts).
2. Export glTF 2.0 (separate `.gltf` + `.bin` + textures) into `models/foliage/grass-medium-01/`.
3. Download **Opacity** PNG from Poly Haven into `textures/grass_medium_01_alpha_4k.png`.
4. Copy this folder to `public/models/foliage/grass-medium-01/`.
