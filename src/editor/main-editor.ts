// src/editor/main-editor.ts — DEV-only map editor bootstrap
import './ui/editor.css';

import { disposeAssetRegistry, loadAllAssets } from '../assets/AssetLoader';
import type { AssetRegistry } from '../assets/assetManifest';
import { initPerformanceSuite } from '../dev/profiling';
import { disposeSceneSetup, initSceneSetup } from '../rendering/SceneSetup';
import { checkWebGPUSupport, getWebGPUErrorMessage } from '../rendering/webgpuCapability';
import { initTerrainAtlases, loadTerrainTextures } from '../world/terrain';
import { createEditorSession } from './core/EditorSession';
import { disposeAssetThumbnails } from './ui/EditorAssetThumbnails';
import { createEditorShell } from './ui/shell/EditorShell';

if (!import.meta.env.DEV) {
  document.body.innerHTML =
    '<p style="color:#c8bfb0;font-family:Georgia,serif;padding:2em">Map editor is only available in development builds.</p>';
  throw new Error('Editor requires DEV mode');
}

let session: ReturnType<typeof createEditorSession> | null = null;
let assets: AssetRegistry | null = null;
let resourcesDisposed = false;

function disposeBootstrapResources(): void {
  if (resourcesDisposed) return;
  resourcesDisposed = true;
  session?.dispose();
  session = null;
  if (assets) {
    disposeAssetRegistry(assets);
    assets = null;
  }
  disposeAssetThumbnails();
  disposeSceneSetup();
}

window.addEventListener('beforeunload', (event) => {
  if (!session?.hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = '';
});

window.addEventListener('pagehide', () => {
  disposeBootstrapResources();
});

async function main(): Promise<void> {
  if (!(await checkWebGPUSupport())) {
    document.body.appendChild(getWebGPUErrorMessage());
    throw new Error('WebGPU not supported');
  }

  const host = document.getElementById('editor-app');
  if (!host) {
    throw new Error('Missing #editor-app');
  }

  const shell = createEditorShell(host);
  const loadingEl = document.getElementById('loading');
  const setup = await initSceneSetup(shell.slots.canvas, { fitCanvas: true });
  if (import.meta.env.DEV) initPerformanceSuite(setup.renderer);
  const [textures, loadedAssets] = await Promise.all([
    loadTerrainTextures({ colorOnly: true, renderer: setup.renderer }),
    loadAllAssets(setup.renderer),
  ]);
  assets = loadedAssets;
  initTerrainAtlases(setup.renderer, textures.atlases, 1);

  session = createEditorSession({
    canvas: shell.slots.canvas,
    shell,
    setup,
    textures,
    assets,
    loadingEl,
  });

  try {
    await session.run();
  } catch (err) {
    console.error(err);
    disposeBootstrapResources();
    if (loadingEl) {
      loadingEl.textContent = 'Editor failed to start — see console.';
      loadingEl.classList.remove('hidden');
    }
  }
}

main().catch((err) => {
  console.error(err);
  const loadingEl = document.getElementById('loading');
  if (loadingEl) {
    loadingEl.textContent = 'Editor failed to start — see console.';
    loadingEl.classList.remove('hidden');
  }
});
