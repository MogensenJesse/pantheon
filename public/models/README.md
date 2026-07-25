# Play models

Shipped props are self-contained **`.glb`** files with **`KHR_texture_basisu`** (ETC1S albedo, UASTC normals/ORM). No PNG/JPEG sidecars.

Each baked prop is a LOD chain:

| File | Role |
|------|------|
| `Name.glb` / `scene.glb` | lod0 (full detail, textures ≤2048; manifest canonical path) |
| `Name_lod1.glb` / `scene_lod1.glb` | mid (simplify ~35% + textures ≤1024) |
| `Name_lod2.glb` / `scene_lod2.glb` | far (simplify ~10% + textures ≤512) |

Rebuild after replacing source glTFs:

```bash
# restore sources from git if needed, then:
npm run bake:play-props
# lod0 only: npm run bake:play-props -- --no-lod
# no .gltf sources (already baked): emit mid/far from existing lod0 GLBs:
npm run bake:play-props -- --from-glb
```

Manifest paths: `src/assets/assetManifest.ts` (`.glb` = lod0). Runtime: `GLTFLoader` + self-hosted `KTX2Loader` (`npm run sync-decoders`); play loads lod1/2 siblings by convention.
