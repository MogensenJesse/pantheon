// src/ui/dev/devPanelPostFx.ts — DEV-only post-FX utilities (FPS counter)

import { devSettings } from '../../core/GameState';
import type { PostFXContext } from '../../rendering/PostFX';
import { setFpsCounterEnabled } from '../FpsCounter';
import { mountSection } from './bindRange';

export function initDevPanelPostFx(_panel: HTMLDivElement, _postFX: PostFXContext): () => void {
  const body = mountSection(_panel, {
    hostId: 'dev-section-postfx',
    title: 'Post FX',
    open: false,
    body: `
      <label class="dev-row dev-row-check">
        <span>Show FPS</span>
        <input type="checkbox" id="dev-show-fps" />
      </label>
    `,
  });
  if (!body) return () => {};

  const showFps = _panel.querySelector('#dev-show-fps') as HTMLInputElement | null;
  let onFpsChange: (() => void) | null = null;
  if (showFps) {
    showFps.checked = devSettings.showFpsCounter;
    onFpsChange = () => setFpsCounterEnabled(showFps.checked);
    showFps.addEventListener('change', onFpsChange);
  }

  return () => {
    if (showFps && onFpsChange) showFps.removeEventListener('change', onFpsChange);
  };
}
