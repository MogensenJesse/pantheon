import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { gradeLutManifestPlugin } from './vite/gradeLutManifestPlugin.ts';
import { mapDevApiPlugin } from './vite/mapDevApiPlugin.ts';
import { optimizerDevApiPlugin } from './vite/optimizerDevApiPlugin.ts';
import { terrainBiomeMapsPlugin } from './vite/terrainBiomeMapsPlugin.ts';

export default defineConfig({
  publicDir: 'public',
  assetsInclude: [
    '**/*.glb',
    '**/*.gltf',
    '**/*.hdr',
    '**/*.exr',
    '**/*.ktx2',
    '**/*.r8',
    '**/*.wasm',
  ],
  resolve: {
    // Avoid duplicate three/tsl copies (breaks PMREMGenerator If() stack).
    dedupe: ['three'],
  },
  plugins: [
    mapDevApiPlugin(),
    optimizerDevApiPlugin(),
    gradeLutManifestPlugin(),
    terrainBiomeMapsPlugin(),
  ],
  optimizeDeps: {
    exclude: ['watlas'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        editor: resolve(import.meta.dirname, 'editor.html'),
        // optimizer.html is DEV-only (`/optimizer.html`); omit from production Rollup.
      },
    },
  },
});
