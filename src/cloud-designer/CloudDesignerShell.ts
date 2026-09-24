// src/cloud-designer/CloudDesignerShell.ts — genus profile chrome + Save/Load + preview layout

import { VISUAL } from '../config/visualTuning';
import type { CloudGenus } from '../rendering/clouds/cloudConfig';
import { setCloudDevOverride } from '../rendering/clouds/cloudDevState';
import {
  applyCloudGenusProfileSavedOverlay,
  CLOUD_GENUS_LIST,
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
import {
  DEFAULT_DESIGNER_PREVIEW_LAYOUT,
  previewCloudCountForDensity,
} from './buildDesignerPreviewBank';

/** Designer-only preview chrome (Phase 5). Not persisted in cloudGenusProfiles / Save JSON. */
export interface DesignerPreviewLayout {
  /**
   * 0–1 density for the preview deck. 0 = empty, 1 = packed to the generator's 40 m
   * spacing. Derived cloud count feeds generateCloudField layers.low.cloudCount.
   * particlesHint stays on the genus panel (per cloud).
   */
  density: number;
}

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
  /** Play-style wind drift. Off keeps the bank still for orbit inspection. */
  getAnimateClouds: () => boolean;
  dispose: () => void;
}

const SHELL_CSS = `
.cloud-designer-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: system-ui, sans-serif;
  color: #c8bfb0;
  background: #1a2228;
}
.cloud-designer-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #2a343c;
  background: #151b20;
}
.cloud-designer-header h1 {
  margin: 0;
  font-family: Georgia, serif;
  font-size: 1.15rem;
  font-weight: normal;
  font-style: italic;
}
.cloud-designer-header label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}
.cloud-designer-header select,
.cloud-designer-header button {
  background: #1a2228;
  color: #c8bfb0;
  border: 1px solid #3a454e;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  font: inherit;
  cursor: pointer;
}
.cloud-designer-header button:hover {
  background: #2a343c;
}
.cloud-designer-header .cd-io {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}
.cloud-designer-body {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  position: relative;
}
.cloud-designer-scene-host {
  flex: 1;
  min-height: 240px;
  background: #0e1317;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cloud-designer-scene-stub {
  opacity: 0.55;
  font-family: Georgia, serif;
  font-style: italic;
  text-align: center;
  padding: 2rem;
  pointer-events: none;
}
.cloud-designer-profile {
  width: 300px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 0.75rem 1rem 1rem;
  border-left: 1px solid #2a343c;
  background: #151b20;
  font-size: 0.8rem;
}
.cloud-designer-profile h2 {
  margin: 0 0 0.75rem;
  font-family: Georgia, serif;
  font-size: 0.95rem;
  font-weight: normal;
  font-style: italic;
  color: #c8bfb0;
}
.cloud-designer-profile h3 {
  margin: 1rem 0 0.5rem;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #8a8278;
}
.cloud-designer-profile .cd-preview-note {
  margin: 0 0 0.6rem;
  font-size: 0.72rem;
  color: #6a9080;
  line-height: 1.35;
}
.cloud-designer-profile .cd-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin-bottom: 0.75rem;
}
.cloud-designer-profile .cd-field-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
}
.cloud-designer-profile .cd-field label {
  color: #a89f92;
}
.cloud-designer-profile .cd-field .cd-val {
  font-variant-numeric: tabular-nums;
  color: #c8bfb0;
}
.cloud-designer-profile input[type="range"] {
  width: 100%;
  accent-color: #7a8f9e;
}
.cloud-designer-profile .cd-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.cloud-designer-profile .cd-actions button {
  flex: 1;
  min-width: 5.5rem;
  padding: 0.3rem 0.45rem;
  border: 1px solid #3a454e;
  border-radius: 4px;
  background: #1a2228;
  color: #c8bfb0;
  cursor: pointer;
  font: inherit;
}
.cloud-designer-profile .cd-actions button:hover {
  background: #2a343c;
}
.cloud-designer-profile .cd-check {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}
.cloud-designer-profile .cd-check input {
  margin: 0;
}
.cloud-designer-profile .cd-notes {
  margin: 0.25rem 0 0;
  padding: 0.5rem 0.6rem;
  background: #1a2228;
  border: 1px solid #2a343c;
  border-radius: 4px;
  color: #8a8278;
  line-height: 1.35;
  white-space: pre-wrap;
}
.cloud-designer-status {
  padding: 0.5rem 1rem;
  font-size: 0.8rem;
  border-top: 1px solid #2a343c;
  color: #8a8278;
}
`;

interface SliderSpec {
  key:
    | 'deckPlaneYBiasM'
    | 'puffLayoutRadiusScale'
    | 'puffLayoutHeightScale'
    | 'particlesHint'
    | 'deckBaseFraction';
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

const SLIDERS: readonly SliderSpec[] = [
  {
    key: 'deckPlaneYBiasM',
    label: 'Deck Y bias (m)',
    min: -40,
    max: 80,
    step: 0.5,
    format: (v) => v.toFixed(1),
  },
  {
    key: 'puffLayoutRadiusScale',
    label: 'Radius scale',
    min: 0.2,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'puffLayoutHeightScale',
    label: 'Height scale',
    min: 0.1,
    max: 3,
    step: 0.05,
    format: (v) => v.toFixed(2),
  },
  {
    key: 'particlesHint',
    label: 'Particles per cloud',
    min: 4,
    max: 48,
    step: 1,
    format: (v) => String(Math.round(v)),
  },
  {
    key: 'deckBaseFraction',
    label: 'Deck base fraction',
    min: 0,
    max: 1,
    step: 0.01,
    format: (v) => v.toFixed(2),
  },
];

export function createCloudDesignerShell(host: HTMLElement): CloudDesignerShellContext {
  host.className = 'cloud-designer-app';
  host.hidden = false;

  const style = document.createElement('style');
  style.textContent = SHELL_CSS;
  document.head.appendChild(style);

  const options = CLOUD_GENUS_LIST.map((g) => {
    const p = CLOUD_GENUS_PROFILES[g];
    return `<option value="${g}">${p.label}</option>`;
  }).join('');

  const sliderHtml = SLIDERS.map((s) => {
    return `
      <div class="cd-field" data-field="${s.key}">
        <div class="cd-field-row">
          <label for="cd-${s.key}">${s.label}</label>
          <span class="cd-val" data-val="${s.key}">—</span>
        </div>
        <input type="range" id="cd-${s.key}" data-key="${s.key}"
          min="${s.min}" max="${s.max}" step="${s.step}" />
      </div>`;
  }).join('');

  host.innerHTML = `
    <header class="cloud-designer-header" data-slot="header">
      <h1>Cloud Designer</h1>
      <label>
        <span>Genus</span>
        <select id="cloud-designer-genus" aria-label="Cloud genus">
          ${options}
        </select>
      </label>
      <div class="cd-io" aria-label="Profile save and load">
        <button type="button" id="cd-save">Save</button>
        <button type="button" id="cd-load">Load</button>
        <input type="file" id="cd-load-file" accept="application/json,.json" hidden />
      </div>
    </header>
    <div class="cloud-designer-body">
      <div class="cloud-designer-scene-host" data-slot="scene-host" id="cloud-designer-scene-host">
        <div class="cloud-designer-scene-stub">Engine wires scene here</div>
      </div>
      <aside class="cloud-designer-profile" data-slot="profile-panel" aria-label="Genus profile">
        <h2>Genus profile</h2>
        ${sliderHtml}
        <div class="cd-field cd-actions" aria-label="Profile resets">
          <button type="button" id="cd-reset-genus">Reset genus</button>
          <button type="button" id="cd-reset-all">Reset all</button>
          <button type="button" id="cd-reload-saved">Reload saved</button>
        </div>
        <div class="cd-field">
          <div class="cd-field-row"><label>Notes</label></div>
          <p class="cd-notes" data-slot="notes"></p>
        </div>
        <h3>Preview layout</h3>
        <p class="cd-preview-note">Designer preview only - not written by Save / Load. Density = clouds on this deck. Cotton, corner radius, and turbulence are the puff look (not saved).</p>
        <div class="cd-field" data-field="density">
          <div class="cd-field-row">
            <label for="cd-density">Density</label>
            <span class="cd-val" data-val="density"></span>
          </div>
          <input type="range" id="cd-density" min="0" max="1" step="0.001" value="${DEFAULT_DESIGNER_PREVIEW_LAYOUT.density}" />
        </div>
        <div class="cd-field" data-field="cotton">
          <div class="cd-field-row">
            <label for="cd-cotton">Cotton</label>
            <span class="cd-val" data-val="cotton">${VISUAL.clouds.wispStrength.toFixed(2)}</span>
          </div>
          <input type="range" id="cd-cotton" min="0" max="1" step="0.01" value="${VISUAL.clouds.wispStrength}" />
        </div>
        <div class="cd-field" data-field="cornerRadius">
          <div class="cd-field-row">
            <label for="cd-corner">Corner radius</label>
            <span class="cd-val" data-val="cornerRadius">${VISUAL.clouds.cornerRadius.toFixed(2)}</span>
          </div>
          <input type="range" id="cd-corner" min="0" max="1" step="0.01" value="${VISUAL.clouds.cornerRadius}" />
        </div>
        <div class="cd-field" data-field="turbulence">
          <div class="cd-field-row">
            <label for="cd-turbulence">Turbulence</label>
            <span class="cd-val" data-val="turbulence">${VISUAL.clouds.turbulence.toFixed(2)}</span>
          </div>
          <input type="range" id="cd-turbulence" min="0" max="1" step="0.01" value="${VISUAL.clouds.turbulence}" />
        </div>
        <label class="cd-field cd-check" for="cd-animate">
          <input type="checkbox" id="cd-animate" />
          Animate clouds
        </label>
      </aside>
    </div>
    <footer class="cloud-designer-status" data-slot="status"></footer>
  `;

  const header = host.querySelector<HTMLElement>('[data-slot="header"]');
  const genusSelect = host.querySelector<HTMLSelectElement>('#cloud-designer-genus');
  const sceneHost = host.querySelector<HTMLElement>('[data-slot="scene-host"]');
  const status = host.querySelector<HTMLElement>('[data-slot="status"]');
  const profilePanel = host.querySelector<HTMLElement>('[data-slot="profile-panel"]');
  const notesEl = host.querySelector<HTMLElement>('[data-slot="notes"]');
  const resetGenusButton = host.querySelector<HTMLButtonElement>('#cd-reset-genus');
  const resetAllButton = host.querySelector<HTMLButtonElement>('#cd-reset-all');
  const reloadSavedButton = host.querySelector<HTMLButtonElement>('#cd-reload-saved');
  const saveButton = host.querySelector<HTMLButtonElement>('#cd-save');
  const loadButton = host.querySelector<HTMLButtonElement>('#cd-load');
  const loadFileInput = host.querySelector<HTMLInputElement>('#cd-load-file');
  const densityInput = host.querySelector<HTMLInputElement>('#cd-density');
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
    !resetGenusButton ||
    !resetAllButton ||
    !reloadSavedButton ||
    !saveButton ||
    !loadButton ||
    !loadFileInput ||
    !densityInput ||
    !cottonInput ||
    !cornerInput ||
    !turbulenceInput ||
    !animateInput
  ) {
    throw new Error('CloudDesignerShell: missing slots');
  }

  const previewLayout: DesignerPreviewLayout = {
    density: DEFAULT_DESIGNER_PREVIEW_LAYOUT.density,
  };

  const formatDensityReadout = (density: number): string => {
    const count = previewCloudCountForDensity(density);
    return `${density.toFixed(3)} · ${count}`;
  };

  let statusOverride: string | null = null;

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
      if (partial.density !== undefined && Number.isFinite(partial.density)) {
        previewLayout.density = Math.max(0, Math.min(1, partial.density));
      }
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
      densityInput.removeEventListener('input', onPreviewLayoutInput);
      cottonInput.removeEventListener('input', onCottonInput);
      cornerInput.removeEventListener('input', onCornerInput);
      turbulenceInput.removeEventListener('input', onTurbulenceInput);
      style.remove();
      host.replaceChildren();
    },
  };

  const sliderInputs = SLIDERS.map((s) => {
    const el = host.querySelector<HTMLInputElement>(`#cd-${s.key}`);
    if (!el) throw new Error(`CloudDesignerShell: missing slider ${s.key}`);
    return el;
  });

  const syncStatus = (): void => {
    if (statusOverride) {
      status.textContent = statusOverride;
      return;
    }
    const profile = getCloudGenusProfile(genusSelect.value as CloudGenus);
    const layout = previewLayout;
    status.textContent =
      `${profile.label} — deckY bias ${profile.deckPlaneYBiasM.toFixed(1)} m` +
      ` — radius x${profile.puffLayoutRadiusScale.toFixed(2)}` +
      ` — height x${profile.puffLayoutHeightScale.toFixed(2)}` +
      ` — particles/cloud ${Math.round(profile.particlesHint)}` +
      ` — deckBase ${profile.deckBaseFraction.toFixed(2)}` +
      ` - preview density ${layout.density.toFixed(3)} (${previewCloudCountForDensity(layout.density)} clouds)` +
      ` (preview field; soft MeshCloud unchanged)`;
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
    densityInput.value = String(previewLayout.density);
    const densityVal = host.querySelector<HTMLElement>('[data-val="density"]');
    if (densityVal) densityVal.textContent = formatDensityReadout(previewLayout.density);
  };

  const syncFromProfile = (): void => {
    const profile = getCloudGenusProfile(genusSelect.value as CloudGenus);
    for (const spec of SLIDERS) {
      const input = host.querySelector<HTMLInputElement>(`#cd-${spec.key}`);
      const valEl = host.querySelector<HTMLElement>(`[data-val="${spec.key}"]`);
      if (!input || !valEl) continue;
      const raw = profile[spec.key];
      input.value = String(raw);
      valEl.textContent = spec.format(raw);
    }
    notesEl.textContent = profile.notes;
    syncPreviewLayoutChrome();
    syncStatus();
  };

  const onSliderInput = (ev: Event): void => {
    const input = ev.currentTarget as HTMLInputElement;
    const key = input.dataset.key as SliderSpec['key'] | undefined;
    if (!key) return;
    const spec = SLIDERS.find((s) => s.key === key);
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

  const onPreviewLayoutInput = (): void => {
    ctx.setPreviewLayout({
      density: Number(densityInput.value),
    });
    syncPreviewLayoutChrome();
    statusOverride = null;
    syncStatus();
    ctx.onPreviewLayoutChange?.();
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
  densityInput.addEventListener('input', onPreviewLayoutInput);
  cottonInput.addEventListener('input', onCottonInput);
  cornerInput.addEventListener('input', onCornerInput);
  turbulenceInput.addEventListener('input', onTurbulenceInput);
  setCloudDevOverride('wispStrength', VISUAL.clouds.wispStrength);
  setCloudDevOverride('cornerRadius', VISUAL.clouds.cornerRadius);
  setCloudDevOverride('turbulence', VISUAL.clouds.turbulence);
  syncFromProfile();

  return ctx;
}
