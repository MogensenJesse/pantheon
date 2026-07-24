# Self-hosted Draco (glTF)

**Committed** under this folder (served by Vite). Refresh after upgrading `three`:

```bash
npm run sync-decoders
```

Source: `node_modules/three/examples/jsm/libs/draco/gltf/`

Runtime: `DRACOLoader.setDecoderPath('/draco/gltf/')` — see `src/assets/decoderPaths.ts`. No CDN.
