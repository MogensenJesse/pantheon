import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { gradeLutManifestPlugin } from './vite/gradeLutManifestPlugin';
import { mapDevApiPlugin } from './vite/mapDevApiPlugin';

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
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
      },
    },
  },
});
