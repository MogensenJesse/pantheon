import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { mapDevApiPlugin } from './vite/mapDevApiPlugin';
import { gradeLutManifestPlugin } from './vite/gradeLutManifestPlugin';

export default defineConfig({
  publicDir: 'public',
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.hdr', '**/*.exr'],
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
