import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { mapDevApiPlugin } from './vite/mapDevApiPlugin';

export default defineConfig({
  publicDir: 'public',
  assetsInclude: ['**/*.glb', '**/*.gltf'],
  plugins: [mapDevApiPlugin()],
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
