// src/editor/main-editor.ts — DEV-only map editor bootstrap
import './ui/editor.css';

import { loadAllAssets } from '../assets/AssetLoader';
import { disposeSceneSetup, initSceneSetup } from '../rendering/SceneSetup';
import { checkWebGPUSupport, getWebGPUErrorMessage } from '../rendering/webgpuCapability';
import { initTerrainAtlases, loadTerrainTextures } from '../world/terrain';
import { createEditorSession } from './core/EditorSession';
import { disposeAssetThumbnails } from './ui/EditorAssetThumbnails';

if (!import.meta.env.DEV) {
  document.body.innerHTML =
    '<p style="color:#c8bfb0;font-family:Georgia,serif;padding:2em">Map editor is only available in development builds.</p>';
  throw new Error('Editor requires DEV mode');
}

let session: ReturnType<typeof createEditorSession> | null = null;

async function main(): Promise<void> {
  if (!(await checkWebGPUSupport())) {
    document.body.appendChild(getWebGPUErrorMessage());
    throw new Error('WebGPU not supported');
  }

  const canvas = document.getElementById('editor');
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Missing #editor canvas');
  }

  const loadingEl = document.getElementById('loading');
  const setup = await initSceneSetup(canvas);
  const [textures, assets] = await Promise.all([
    loadTerrainTextures({ colorOnly: true }),
    loadAllAssets(),
  ]);
  initTerrainAtlases(setup.renderer, textures.atlases, 1);

  session = createEditorSession({ canvas, setup, textures, assets, loadingEl });
  session.run();
}

main().catch((err) => {
  console.error(err);
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.textContent = 'Editor failed to start — see console.';
    loadingEl.classList.remove('hidden');
  }
});

window.addEventListener('beforeunload', () => {
  session?.dispose();
  disposeAssetThumbnails();
  disposeSceneSetup();
});
