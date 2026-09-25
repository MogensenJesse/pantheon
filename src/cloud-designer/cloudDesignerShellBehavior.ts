// src/cloud-designer/cloudDesignerShellBehavior.ts — genus profile chrome behavior

import { VISUAL } from '../config/visualTuning';
import type { CloudGenus } from '../rendering/clouds/cloudConfig';
import { setCloudDevOverride } from '../rendering/clouds/cloudDevState';
import {
  applyCloudGenusProfileSavedOverlay,
  CLOUD_GENUS_PROFILE_SAVED_FILENAME,
  CLOUD_GENUS_PROFILE_SAVED_REPO_PATH,
  CLOUD_GENUS_PROFILES,
  downloadCloudGenusProfilesSaved,
  getCloudGenusProfile,
  reloadSavedCloudGenusProfiles,
  resetAllCloudGenusProfiles,
  resetCloudGenusProfile,
  updateCloudGenusProfile,
} from '../rendering/clouds/cloudGenusProfiles';
import { genusUsesCondensationClip } from '../rendering/clouds/cloudProfiles';
import { sunPositionFromCyclePhase } from '../rendering/sky/sunCycle';
import { dominantTodStop } from '../rendering/tod/todBlend';
import {
  clampDesignerPreviewLayout,
  DEFAULT_DESIGNER_PREVIEW_LAYOUT,
  type DesignerPreviewLayout,
} from './buildDesignerPreviewBank';
import {
  CLOUD_DESIGNER_SLIDERS,
  type CloudDesignerSliderSpec,
  renderCloudDesignerShellMarkup,
} from './cloudDesignerShellMarkup';
import { CLOUD_DESIGNER_SHELL_CSS } from './cloudDesignerShellStyles';

export type { DesignerPreviewLayout } from './buildDesignerPreviewBank';

const PREVIEW_FIELD_KEYS = [
  'density',
  'deckMinY',
  'deckMaxY',
  'spread',
  'coverage',
] as const satisfies readonly (keyof DesignerPreviewLayout)[];

export interface CloudDesignerShellSlots {
  root: HTMLElement;
  header: HTMLElement;
  genusSelect: HTMLSelectElement;
  /** Host for Engine scene / MeshCloud preview. */
  sceneHost: HTMLElement;
  status: HTMLElement;
  /** Genus profile controls panel (active genus). */
  profilePanel: HTMLElement;
}

export interface CloudDesignerShellContext {
  slots: CloudDesignerShellSlots;
  getGenus: () => CloudGenus;
  setGenus: (genus: CloudGenus) => void;
  /**
   * Engine session assigns this so profile slider edits trigger clouds.rebuild().
   * Fired after in-memory updateCloudGenusProfile; genus argument is the active genus.
   * Phase 4 Load: mutate CLOUD_GENUS_PROFILES then sync shell then fire with active genus
   * (no separate Engine load hook).
   */
  onProfileChange: ((genus: CloudGenus) => void) | null;
  /**
   * Engine session assigns this so preview density chrome rebuilds the preview.
   * World: setPreviewLayout(...) then fire — knobs are designer-only, not genus profile fields.
   */
  onPreviewLayoutChange: (() => void) | null;
  getPreviewLayout: () => DesignerPreviewLayout;
  /** Mutate designer-only preview layout; does not rebuild — fire onPreviewLayoutChange after. */
  setPreviewLayout: (partial: Partial<DesignerPreviewLayout>) => void;
  /**
   * Placed cluster count from MeshCloudSystem.getFieldStats after the last rebuild.
   * Coverage can place fewer clouds than the density request.
   */
  setPlacedClusterCount: (count: number) => void;
  /** Wind-clock drift. Off freezes wrap travel. Cotton and turbulence still use the shader clock. */
  getAnimateClouds: () => boolean;
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
    wispStrength: VISUAL.clouds.wispStrength,
    cornerRadius: VISUAL.clouds.cornerRadius,
    turbulence: VISUAL.clouds.turbulence,
  });

  const header = host.querySelector<HTMLElement>('[data-slot="header"]');
  const genusSelect = host.querySelector<HTMLSelectElement>('#cloud-designer-genus');
  const sceneHost = host.querySelector<HTMLElement>('[data-slot="scene-host"]');
  const status = host.querySelector<HTMLElement>('[data-slot="status"]');
  const profilePanel = host.querySelector<HTMLElement>('[data-slot="profile-panel"]');
  const notesEl = host.querySelector<HTMLElement>('[data-slot="notes"]');
  const clipUnusedNote = host.querySelector<HTMLElement>('[data-slot="clip-unused"]');
  const resetGenusButton = host.querySelector<HTMLButtonElement>('#cd-reset-genus');
  const resetAllButton = host.querySelector<HTMLButtonElement>('#cd-reset-all');
  const reloadSavedButton = host.querySelector<HTMLButtonElement>('#cd-reload-saved');
  const saveButton = host.querySelector<HTMLButtonElement>('#cd-save');
  const loadButton = host.querySelector<HTMLButtonElement>('#cd-load');
  const loadFileInput = host.querySelector<HTMLInputElement>('#cd-load-file');
  const previewInputs = [...host.querySelectorAll<HTMLInputElement>('[data-preview]')];
  const cottonInput = host.querySelector<HTMLInputElement>('#cd-cotton');
  const cornerInput = host.querySelector<HTMLInputElement>('#cd-corner');
  const turbulenceInput = host.querySelector<HTMLInputElement>('#cd-turbulence');
  const animateInput = host.querySelector<HTMLInputElement>('#cd-animate');
  if (
    !header ||
    !genusSelect ||
    !sceneHost ||
    !status ||
    !profilePanel ||
    !notesEl ||
    !clipUnusedNote ||
    !resetGenusButton ||
    !resetAllButton ||
    !reloadSavedButton ||
    !saveButton ||
    !loadButton ||
    !loadFileInput ||
    previewInputs.length === 0 ||
    !cottonInput ||
    !cornerInput ||
    !turbulenceInput ||
    !animateInput
  ) {
    throw new Error('CloudDesignerShell: missing slots');
  }

  const previewLayout: DesignerPreviewLayout = { ...DEFAULT_DESIGNER_PREVIEW_LAYOUT };
  let placedClusterCount: number | null = null;
  let statusOverride: string | null = null;

  const formatSunReadout = (phase: number): string => {
    const pos = sunPositionFromCyclePhase(phase);
    const stop = dominantTodStop(pos.elevationDeg);
    const label = stop === 'goldenHour' ? 'golden' : stop;
    return `${phase.toFixed(2)} · ${pos.elevationDeg.toFixed(0)}° · ${label}`;
  };

  const formatPreviewValue = (key: keyof DesignerPreviewLayout, value: number): string => {
    if (key === 'sunPhase') return formatSunReadout(value);
    if (key === 'density' || key === 'coverage') return value.toFixed(3);
    if (key === 'windSpeed' || key === 'edgeFadeM') return value.toFixed(1);
    return value.toFixed(0);
  };

  const syncStatus = (): void => {
    if (statusOverride) {
      status.textContent = statusOverride;
      return;
    }
    const genus = genusSelect.value as CloudGenus;
    const profile = getCloudGenusProfile(genus);
    const placed = placedClusterCount === null ? '…' : `${placedClusterCount} placed`;
    const clipBits = genusUsesCondensationClip(genus)
      ? ` — deckY bias ${profile.deckPlaneYBiasM.toFixed(1)} m — deckBase ${profile.deckBaseFraction.toFixed(2)}`
      : '';
    status.textContent =
      `${profile.label} — radius x${profile.puffLayoutRadiusScale.toFixed(2)}` +
      ` — height x${profile.puffLayoutHeightScale.toFixed(2)}` +
      ` — particles/cloud ${Math.round(profile.particlesHint)} (preview)` +
      clipBits +
      ` — deck ${previewLayout.deckMinY.toFixed(0)}–${previewLayout.deckMaxY.toFixed(0)} m` +
      ` — density ${previewLayout.density.toFixed(3)} · ${placed}` +
      ` — sun ${formatSunReadout(previewLayout.sunPhase)}` +
      ` — wind ${previewLayout.windSpeed.toFixed(1)}` +
      ' (preview field; soft MeshCloud unchanged)';
  };

  const setStatusMessage = (message: string, stickyMs = 6000): void => {
    statusOverride = message;
    syncStatus();
    window.setTimeout(() => {
      if (statusOverride === message) {
        statusOverride = null;
        syncStatus();
      }
    }, stickyMs);
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

  const syncFromProfile = (): void => {
    const genus = genusSelect.value as CloudGenus;
    const profile = getCloudGenusProfile(genus);
    const clip = genusUsesCondensationClip(genus);
    for (const spec of CLOUD_DESIGNER_SLIDERS) {
      const field = host.querySelector<HTMLElement>(`[data-field="${spec.key}"]`);
      const input = host.querySelector<HTMLInputElement>(`#cd-${spec.key}`);
      const valEl = host.querySelector<HTMLElement>(`[data-val="${spec.key}"]`);
      if (field) field.hidden = spec.requiresCondensationClip === true && !clip;
      if (!input || !valEl) continue;
      const raw = profile[spec.key];
      input.value = String(raw);
      valEl.textContent = spec.format(raw);
    }
    clipUnusedNote.hidden = clip;
    notesEl.textContent = profile.notes;
    syncPreviewLayoutChrome();
    syncStatus();
  };

  const ctx: CloudDesignerShellContext = {
    slots: { root: host, header, genusSelect, sceneHost, status, profilePanel },
    getGenus: () => genusSelect.value as CloudGenus,
    setGenus: (genus) => {
      genusSelect.value = genus;
      syncFromProfile();
    },
    onProfileChange: null,
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
    dispose: () => {
      genusSelect.removeEventListener('change', onGenusChange);
      for (const input of sliderInputs) {
        input.removeEventListener('input', onSliderInput);
      }
      resetGenusButton.removeEventListener('click', onResetGenus);
      resetAllButton.removeEventListener('click', onResetAll);
      reloadSavedButton.removeEventListener('click', onReloadSaved);
      saveButton.removeEventListener('click', onSave);
      loadButton.removeEventListener('click', onLoadClick);
      loadFileInput.removeEventListener('change', onLoadFile);
      for (const input of previewInputs) {
        input.removeEventListener('input', onPreviewLayoutInput);
      }
      cottonInput.removeEventListener('input', onCottonInput);
      cornerInput.removeEventListener('input', onCornerInput);
      turbulenceInput.removeEventListener('input', onTurbulenceInput);
      style.remove();
      host.replaceChildren();
    },
  };

  const sliderInputs = CLOUD_DESIGNER_SLIDERS.map((s) => {
    const el = host.querySelector<HTMLInputElement>(`#cd-${s.key}`);
    if (!el) throw new Error(`CloudDesignerShell: missing slider ${s.key}`);
    return el;
  });

  const onSliderInput = (ev: Event): void => {
    const input = ev.currentTarget as HTMLInputElement;
    const key = input.dataset.key as CloudDesignerSliderSpec['key'] | undefined;
    if (!key) return;
    const spec = CLOUD_DESIGNER_SLIDERS.find((s) => s.key === key);
    if (!spec) return;
    const numeric = Number(input.value);
    const genus = genusSelect.value as CloudGenus;
    if (key === 'particlesHint') {
      updateCloudGenusProfile(genus, { particlesHint: Math.round(numeric) });
    } else {
      updateCloudGenusProfile(genus, { [key]: numeric });
    }
    const valEl = host.querySelector<HTMLElement>(`[data-val="${key}"]`);
    if (valEl) valEl.textContent = spec.format(numeric);
    statusOverride = null;
    syncStatus();
    ctx.onProfileChange?.(genus);
  };

  const onGenusChange = (): void => {
    statusOverride = null;
    syncFromProfile();
  };

  const onResetGenus = (): void => {
    const genus = genusSelect.value as CloudGenus;
    resetCloudGenusProfile(genus);
    statusOverride = null;
    syncFromProfile();
    ctx.onProfileChange?.(genus);
    setStatusMessage(
      `Reset ${genus} to code DEFAULTS (not last Save). Use Reload saved for shipped overlay.`,
    );
  };

  const onResetAll = (): void => {
    const active = genusSelect.value as CloudGenus;
    resetAllCloudGenusProfiles();
    statusOverride = null;
    syncFromProfile();
    ctx.onProfileChange?.(active);
    setStatusMessage(
      'Reset all genera to code DEFAULTS (not last Save). Use Reload saved for shipped overlay.',
    );
  };

  const onReloadSaved = (): void => {
    const active = genusSelect.value as CloudGenus;
    reloadSavedCloudGenusProfiles();
    statusOverride = null;
    syncFromProfile();
    ctx.onProfileChange?.(active);
    setStatusMessage(
      `Reloaded shipped ${CLOUD_GENUS_PROFILE_SAVED_FILENAME} overlay onto live profiles.`,
    );
  };

  const onSave = (): void => {
    downloadCloudGenusProfilesSaved();
    setStatusMessage(
      `Downloaded ${CLOUD_GENUS_PROFILE_SAVED_FILENAME} — drop into ${CLOUD_GENUS_PROFILE_SAVED_REPO_PATH} (replace), then reload play/designer.`,
      12000,
    );
  };

  const onLoadClick = (): void => {
    loadFileInput.value = '';
    loadFileInput.click();
  };

  const onLoadFile = (): void => {
    const file = loadFileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const parsed: unknown = JSON.parse(text);
        const active = genusSelect.value as CloudGenus;
        const touched = applyCloudGenusProfileSavedOverlay(parsed, CLOUD_GENUS_PROFILES);
        if (touched.length === 0) {
          setStatusMessage(`Load: no profile fields applied from ${file.name}.`);
          return;
        }
        statusOverride = null;
        syncFromProfile();
        ctx.onProfileChange?.(active);
        setStatusMessage(
          `Loaded ${file.name} — applied ${touched.join(', ')} (in-session; Save + drop into repo for play).`,
          10000,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatusMessage(`Load failed: ${message}`);
      }
    };
    reader.onerror = () => {
      setStatusMessage(`Load failed reading ${file.name}.`);
    };
    reader.readAsText(file, 'utf-8');
  };

  const onCornerInput = (): void => {
    const cornerRadius = Math.max(0, Math.min(1, Number(cornerInput.value)));
    setCloudDevOverride('cornerRadius', cornerRadius);
    const cornerVal = host.querySelector<HTMLElement>('[data-val="cornerRadius"]');
    if (cornerVal) cornerVal.textContent = cornerRadius.toFixed(2);
  };

  const onTurbulenceInput = (): void => {
    const turbulence = Math.max(0, Math.min(1, Number(turbulenceInput.value)));
    setCloudDevOverride('turbulence', turbulence);
    const turbulenceVal = host.querySelector<HTMLElement>('[data-val="turbulence"]');
    if (turbulenceVal) turbulenceVal.textContent = turbulence.toFixed(2);
  };

  const onCottonInput = (): void => {
    const cotton = Math.max(0, Math.min(1, Number(cottonInput.value)));
    setCloudDevOverride('wispStrength', cotton);
    const cottonVal = host.querySelector<HTMLElement>('[data-val="cotton"]');
    if (cottonVal) cottonVal.textContent = cotton.toFixed(2);
  };

  const onPreviewLayoutInput = (ev: Event): void => {
    const input = ev.currentTarget as HTMLInputElement;
    const key = input.dataset.preview as keyof DesignerPreviewLayout | undefined;
    if (!key) return;
    ctx.setPreviewLayout({ [key]: Number(input.value) });
    syncPreviewLayoutChrome();
    statusOverride = null;
    syncStatus();
    if ((PREVIEW_FIELD_KEYS as readonly string[]).includes(key)) {
      ctx.onPreviewLayoutChange?.();
    }
  };

  for (const input of sliderInputs) {
    input.addEventListener('input', onSliderInput);
  }
  genusSelect.value = 'cumulus';
  genusSelect.addEventListener('change', onGenusChange);
  resetGenusButton.addEventListener('click', onResetGenus);
  resetAllButton.addEventListener('click', onResetAll);
  reloadSavedButton.addEventListener('click', onReloadSaved);
  saveButton.addEventListener('click', onSave);
  loadButton.addEventListener('click', onLoadClick);
  loadFileInput.addEventListener('change', onLoadFile);
  for (const input of previewInputs) {
    input.addEventListener('input', onPreviewLayoutInput);
  }
  cottonInput.addEventListener('input', onCottonInput);
  cornerInput.addEventListener('input', onCornerInput);
  turbulenceInput.addEventListener('input', onTurbulenceInput);
  setCloudDevOverride('wispStrength', VISUAL.clouds.wispStrength);
  setCloudDevOverride('cornerRadius', VISUAL.clouds.cornerRadius);
  setCloudDevOverride('turbulence', VISUAL.clouds.turbulence);
  syncFromProfile();

  return ctx;
}
