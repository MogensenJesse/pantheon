// src/cloud-designer/cloudDesignerShellBehavior.ts — cumulus deck chrome

import type { CloudGenus } from '../rendering/clouds/cloudConfig';
import { CUMULUS_DECK_SLIDERS } from '../rendering/clouds/cumulusDeckSliders';
import { sunPositionFromCyclePhase } from '../rendering/sky/sunCycle';
import { dominantTodStop } from '../rendering/tod/todBlend';
import {
  clampDesignerPreviewLayout,
  DEFAULT_DESIGNER_PREVIEW_LAYOUT,
  type DesignerPreviewLayout,
} from './buildDesignerPreviewBank';
import { renderCloudDesignerShellMarkup } from './cloudDesignerShellMarkup';
import { CLOUD_DESIGNER_SHELL_CSS } from './cloudDesignerShellStyles';

export type { DesignerPreviewLayout } from './buildDesignerPreviewBank';

const PREVIEW_FIELD_KEYS = CUMULUS_DECK_SLIDERS.filter((spec) => spec.group !== 'time').map(
  (spec) => spec.key,
);

export interface CloudDesignerShellSlots {
  root: HTMLElement;
  header: HTMLElement;
  /** Host for Engine scene / MeshCloud preview. */
  sceneHost: HTMLElement;
  status: HTMLElement;
  /** Deck controls. */
  profilePanel: HTMLElement;
}

export interface CloudDesignerShellContext {
  slots: CloudDesignerShellSlots;
  getGenus: () => CloudGenus;
  setGenus: (genus: CloudGenus) => void;
  /**
   * Engine session assigns this so deck sliders rebuild the preview.
   */
  onPreviewLayoutChange: (() => void) | null;
  getPreviewLayout: () => DesignerPreviewLayout;
  /** Mutate the preview layout; does not rebuild — fire onPreviewLayoutChange after. */
  setPreviewLayout: (partial: Partial<DesignerPreviewLayout>) => void;
  /**
   * Placed cluster count from MeshCloudSystem.getFieldStats after the last rebuild.
   * Coverage can place fewer clouds than the density request.
   */
  setPlacedClusterCount: (count: number) => void;
  /** Wind-clock drift. Off freezes wrap travel. Cotton still uses the shader clock. */
  getAnimateClouds: () => boolean;
  /** Debug map toggles. Off by default. */
  getDebugViews: () => { coverage: boolean; clusters: boolean };
  /** Fired when a debug toggle changes. Does not rebuild the cloud field. */
  onDebugViewChange: (() => void) | null;
  dispose: () => void;
}

export function createCloudDesignerShell(host: HTMLElement): CloudDesignerShellContext {
  host.className = 'cloud-designer-app';
  host.hidden = false;

  const style = document.createElement('style');
  style.textContent = CLOUD_DESIGNER_SHELL_CSS;
  document.head.appendChild(style);

  host.innerHTML = renderCloudDesignerShellMarkup({
    layout: DEFAULT_DESIGNER_PREVIEW_LAYOUT,
  });

  const header = host.querySelector<HTMLElement>('[data-slot="header"]');
  const sceneHost = host.querySelector<HTMLElement>('[data-slot="scene-host"]');
  const status = host.querySelector<HTMLElement>('[data-slot="status"]');
  const profilePanel = host.querySelector<HTMLElement>('[data-slot="profile-panel"]');
  const previewInputs = [...host.querySelectorAll<HTMLInputElement>('[data-preview]')];
  const animateInput = host.querySelector<HTMLInputElement>('#cd-animate');
  const debugInputs = [...host.querySelectorAll<HTMLInputElement>('[data-debug]')];
  if (
    !header ||
    !sceneHost ||
    !status ||
    !profilePanel ||
    previewInputs.length === 0 ||
    !animateInput ||
    debugInputs.length !== 2
  ) {
    throw new Error('CloudDesignerShell: missing slots');
  }

  const previewLayout: DesignerPreviewLayout = { ...DEFAULT_DESIGNER_PREVIEW_LAYOUT };
  let placedClusterCount: number | null = null;

  const formatSunReadout = (phase: number): string => {
    const pos = sunPositionFromCyclePhase(phase);
    const stop = dominantTodStop(pos.elevationDeg);
    const label = stop === 'goldenHour' ? 'golden' : stop;
    return `${phase.toFixed(2)} · ${pos.elevationDeg.toFixed(0)}° · ${label}`;
  };

  const formatPreviewValue = (key: keyof DesignerPreviewLayout, value: number): string => {
    if (key === 'sunPhase') return formatSunReadout(value);
    if (key === 'density') return value.toFixed(3);
    if (key === 'coverage' || key === 'supercluster' || key === 'bankSoftness') {
      return value.toFixed(2);
    }
    if (key === 'windSpeed' || key === 'edgeFadeM' || key === 'deckYBiasM') return value.toFixed(1);
    return value.toFixed(0);
  };

  const syncStatus = (): void => {
    const placed = placedClusterCount === null ? '…' : `${placedClusterCount} placed`;
    status.textContent =
      `Cumulus — deckY bias ${previewLayout.deckYBiasM.toFixed(1)} m` +
      ` — deck ${previewLayout.deckMinY.toFixed(0)}–${previewLayout.deckMaxY.toFixed(0)} m` +
      ` — density ${previewLayout.density.toFixed(3)} · ${placed}` +
      ` — bank ${previewLayout.bankScaleM.toFixed(0)} m / soft ${previewLayout.bankSoftness.toFixed(2)}` +
      ` — sun ${formatSunReadout(previewLayout.sunPhase)}` +
      ` — wind ${previewLayout.windSpeed.toFixed(1)}` +
      ' (shared cumulus deck)';
  };

  const syncPreviewLayoutChrome = (): void => {
    for (const input of previewInputs) {
      const key = input.dataset.preview as keyof DesignerPreviewLayout | undefined;
      if (!key) continue;
      const value = previewLayout[key];
      input.value = String(value);
      const valEl = host.querySelector<HTMLElement>(`[data-val="${key}"]`);
      if (valEl) valEl.textContent = formatPreviewValue(key, value);
    }
  };

  const ctx: CloudDesignerShellContext = {
    slots: { root: host, header, sceneHost, status, profilePanel },
    getGenus: () => 'cumulus',
    setGenus: () => {},
    onPreviewLayoutChange: null,
    getPreviewLayout: () => ({ ...previewLayout }),
    setPreviewLayout: (partial) => {
      const next = clampDesignerPreviewLayout(previewLayout, partial);
      Object.assign(previewLayout, next);
    },
    setPlacedClusterCount: (count) => {
      if (!Number.isFinite(count)) return;
      placedClusterCount = Math.max(0, Math.round(count));
      syncStatus();
    },
    getAnimateClouds: () => animateInput.checked,
    getDebugViews: () => ({
      coverage: debugInputs.some((input) => input.dataset.debug === 'coverage' && input.checked),
      clusters: debugInputs.some((input) => input.dataset.debug === 'clusters' && input.checked),
    }),
    onDebugViewChange: null,
    dispose: () => {
      for (const input of previewInputs) {
        input.removeEventListener('input', onPreviewLayoutInput);
      }
      for (const input of debugInputs) {
        input.removeEventListener('change', onDebugToggle);
      }
      style.remove();
      host.replaceChildren();
    },
  };

  const onPreviewLayoutInput = (ev: Event): void => {
    const input = ev.currentTarget as HTMLInputElement;
    const key = input.dataset.preview as keyof DesignerPreviewLayout | undefined;
    if (!key) return;
    ctx.setPreviewLayout({ [key]: Number(input.value) });
    syncPreviewLayoutChrome();
    syncStatus();
    if ((PREVIEW_FIELD_KEYS as readonly string[]).includes(key)) {
      ctx.onPreviewLayoutChange?.();
    }
  };

  const onDebugToggle = (): void => {
    ctx.onDebugViewChange?.();
  };

  for (const input of previewInputs) {
    input.addEventListener('input', onPreviewLayoutInput);
  }
  for (const input of debugInputs) {
    input.addEventListener('change', onDebugToggle);
  }
  syncPreviewLayoutChrome();
  syncStatus();

  return ctx;
}
