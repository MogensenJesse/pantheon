// src/ui/dev/devPanelRenderDebug.ts
import { devSettings } from '../../core/GameState';
import type { PostFXContext } from '../../rendering/PostFX';
import { setFpsCounterEnabled } from '../FpsCounter';

export function initDevPanelRenderDebug(
  panel: HTMLDivElement,
  postFX: PostFXContext,
  onLogRenderDebug?: () => void,
): void {
  const showFpsCheck = panel.querySelector('#dev-show-fps') as HTMLInputElement;

  const bindCheck = (id: string, key: keyof typeof devSettings.renderDebug) => {
    const el = panel.querySelector(`#${id}`) as HTMLInputElement | null;
    if (!el) return;
    const val = devSettings.renderDebug[key];
    el.checked = typeof val === 'boolean' ? val : false;
    el.addEventListener('change', () => {
      (devSettings.renderDebug[key] as boolean) = el.checked;
    });
  };

  bindCheck('dev-hide-terrain', 'hideTerrain');
  bindCheck('dev-hide-water', 'hideWater');
  bindCheck('dev-hide-scatter', 'hideScatter');
  bindCheck('dev-hide-sky', 'hideSky');
  bindCheck('dev-hide-clouds', 'hideClouds');
  bindCheck('dev-disable-bloom', 'disableBloom');
  bindCheck('dev-disable-shadows', 'disableShadows');
  bindCheck('dev-disable-edge-aa', 'disableEdgeAa');
  bindCheck('dev-log-gpu-periodic', 'logGpuPeriodic');

  showFpsCheck.checked = devSettings.showFpsCounter;
  showFpsCheck.addEventListener('change', () => {
    setFpsCounterEnabled(showFpsCheck.checked);
  });

  panel.querySelector('#dev-gpu-info')?.addEventListener('click', () => postFX.logGpuInfo());
  panel.querySelector('#dev-render-debug')?.addEventListener('click', () => {
    onLogRenderDebug?.();
    console.info('[RenderDebug] manual log (see frame + sky entries above)');
  });
}
