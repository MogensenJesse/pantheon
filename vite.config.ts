import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { gradeLutManifestPlugin } from './vite/gradeLutManifestPlugin.ts';
import { mapDevApiPlugin } from './vite/mapDevApiPlugin.ts';
import { optimizerDevApiPlugin } from './vite/optimizerDevApiPlugin.ts';

export default defineConfig({
  publicDir: 'public',
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.exr', '**/*.ktx2', '**/*.wasm'],
  resolve: {
    // Avoid duplicate three/tsl copies (breaks PMREMGenerator If() stack).
    dedupe: ['three'],
  },
  plugins: [mapDevApiPlugin(), optimizerDevApiPlugin(), gradeLutManifestPlugin()],
  optimizeDeps: {
    exclude: ['watlas'],
    // `build.rollupOptions.input` below omits optimizer.html, and Vite crawls that instead of every
    // html file. Without this, the optimizer's deps (three-mesh-bvh, fflate, meshoptimizer/simplifier)
    // are found at first visit, the re-bundle outdates the page's hashed URLs and they load with an
    // empty MIME type until a hard reload.
    entries: ['index.html', 'editor.html', 'optimizer.html'],
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
