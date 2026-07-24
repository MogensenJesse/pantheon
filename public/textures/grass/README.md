# Grass textures

Shipped runtime assets are **KTX2 only** (no PNG fallback):

| File | Role |
|------|------|
| `noise-atlas.ktx2` | Linear RGBA wind / init noise (repeat) |
| `edelweiss.ktx2` | sRGB edelweiss billboard (alpha cutout) |

Rebuild from PNG sources (restore from git if deleted from `public/textures/grass/`):

```bash
git restore -- public/textures/grass/noise-atlas.png public/textures/grass/edelweiss.png
npm run bake:grass-ktx2
# then remove PNGs again so play has no dual format
```

Requires [KTX-Software](https://github.com/KhronosGroup/KTX-Software) `toktx` on PATH. Attribution: MIT Revo Realms noise/flower textures.
