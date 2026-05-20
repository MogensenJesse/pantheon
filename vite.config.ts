import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public',
  assetsInclude: ['**/*.glb', '**/*.gltf'],
});
