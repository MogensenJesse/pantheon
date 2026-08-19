import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { gradeLutManifestPlugin } from './vite/gradeLutManifestPlugin.ts';
import { mapDevApiPlugin } from './vite/mapDevApiPlugin.ts';

export default defineConfig({
  publicDir: 'public',
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.hdr', '**/*.exr', '**/*.ktx2', '**/*.r8'],
  resolve: {
    // Avoid duplicate three/tsl copies (breaks PMREMGenerator If() stack).
    dedupe: ['three'],
  },
  plugins: [mapDevApiPlugin(), gradeLutManifestPlugin()],
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        editor: resolve(import.meta.dirname, 'editor.html'),
      },
    },
  },
});
