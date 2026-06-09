# Moss — moss_01 (Poly Haven, CC0)

https://polyhaven.com/a/moss_01

## Runtime files (this folder)

| File | Purpose |
|------|---------|
| `moss_01_4k.gltf` + `moss_01.bin` | Instanced clump variants (see manifest mesh names) |
| `textures/moss_01_diff_4k.jpg` | Diffuse |
| `textures/moss_01_nor_gl_4k.jpg` | Normal (required for glTF load) |
| `textures/moss_01_arm_4k.jpg` | AO / rough / metal packed |
| `textures/moss_01_alpha_4k.png` | Opacity cutout (loaded at runtime — required to avoid black cards) |

Download **Opacity** from [Poly Haven moss_01](https://polyhaven.com/a/moss_01) if you re-export the pack. The foliage shader uses diffuse + ARM + this PNG (not the JPEG diffuse alpha).

When you update the pack in gitignored `models/moss/`, copy the full folder (including `textures/`) to `public/models/foliage/moss/`.
