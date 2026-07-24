# Play models

Shipped props are self-contained **`.glb`** files with **`KHR_texture_basisu`** (ETC1S albedo, UASTC normals/ORM). No PNG/JPEG sidecars.

Rebuild after replacing source glTFs:

```bash
# restore sources from git if needed, then:
npm run bake:play-props
```

Manifest paths: `src/assets/assetManifest.ts` (`.glb`). Runtime: `GLTFLoader` + self-hosted `KTX2Loader` (`npm run sync-decoders`).

LOD lab tool (not play): `scripts/optimize-assets.cjs`.
