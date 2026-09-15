// src/optimizer/ui/optimizerSidebar.ts — numbered Needle-like controls
import { bindEditorCheckbox } from '../../editor/ui/controls/editorCheckbox';
import { bindEditorRange } from '../../editor/ui/controls/editorRange';
import {
  availableLibraryLods,
  type LibraryEntry,
  type LibraryLodLevel,
  libraryLodLabel,
} from '../io/libraryClient';
import type { OptimizerIssue, OptimizerSaveFields, OptimizerSettings } from '../pipeline/types';

export type OptimizerViewMode = 'optimize' | 'lod';

export type ProgressPhaseState = 'idle' | 'active' | 'done' | 'error';

export interface OptimizerProgress {
  status: string;
  percent: number | null;
  phases: Array<{ id: string; label: string; state: ProgressPhaseState; hidden?: boolean }>;
}

export interface LodPreviewState {
  available: LibraryLodLevel[];
  left: LibraryLodLevel;
  right: LibraryLodLevel;
  viewMode: OptimizerViewMode;
  hint: string;
}

export interface SidebarApi {
  settings: () => OptimizerSaveFields;
  setIssues: (issues: OptimizerIssue[]) => void;
  setProgress: (progress: OptimizerProgress) => void;
  setExportReady: (ready: boolean) => void;
  setLibrary: (entries: LibraryEntry[]) => void;
  setSelectedLibrary: (key: string | null) => void;
  setLodPreview: (state: LodPreviewState) => void;
  setCaps: (text: string) => void;
  setStats: (text: string) => void;
  setRebuildGate: (allowed: boolean, reason: string | null) => void;
  setCanOptimize: (can: boolean) => void;
  setSaveFields: (family: string, name: string) => void;
  focusLibrary: () => void;
  dispose: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function libraryKey(entry: LibraryEntry): string {
  return `${entry.family}/${entry.name}`;
}

function renderLodTabs(
  host: HTMLElement,
  available: LibraryLodLevel[],
  active: LibraryLodLevel,
  disabled: boolean,
  onPick: (level: LibraryLodLevel) => void,
): void {
  host.replaceChildren();
  for (const level of [0, 1, 2] as LibraryLodLevel[]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `editor-prop-tab${active === level ? ' is-active' : ''}`;
    btn.textContent = `lod${level}`;
    btn.disabled = disabled || !available.includes(level);
    btn.addEventListener('click', () => onPick(level));
    host.appendChild(btn);
  }
}

export function mountOptimizerSidebar(
  host: HTMLElement,
  opts: {
    settings: OptimizerSettings;
    onSettings: (next: OptimizerSettings, changed: (keyof OptimizerSettings)[]) => void;
    onOpenFiles: (files: FileList) => void;
    onPickLibrary: (entry: LibraryEntry) => void;
    onViewMode: (mode: OptimizerViewMode) => void;
    onLodPane: (pane: 'left' | 'right', level: LibraryLodLevel) => void;
    onOptimize: () => void;
    onCancel: () => void;
    onSave: () => void;
    onDownload: () => void;
    onFitCamera?: () => void;
    onHelp?: () => void;
  },
): SidebarApi {
  const s = { ...opts.settings, remeshFlags: [...opts.settings.remeshFlags] };
  host.innerHTML = `
    <div class="optimizer-sidebar-header">
      <div>
        <strong class="optimizer-doc-title">Pantheon Asset Optimizer</strong>
        <span class="editor-hint-copy">DEV only - static props</span>
      </div>
      <button type="button" class="optimizer-help-btn" id="opt-help" title="Workflow help" aria-label="Workflow help">?</button>
    </div>
    <details class="editor-panel-section" id="opt-source-section" open>
      <summary>1. Source</summary>
      <div class="editor-panel-section-body">
        <div class="optimizer-drop" id="opt-drop" role="button" tabindex="0" title="Click or drop files">
          Drop GLB / ZIP / glTF / OBJ / FBX / PLY<br /><span class="optimizer-drop-sub">or click to browse</span>
        </div>
        <input class="optimizer-file" id="opt-file" type="file" accept=".glb,.gltf,.zip,.obj,.fbx,.ply,.mtl,.bin,.png,.jpg,.jpeg,.webp" multiple />
        <p class="editor-hint-copy">Or pick a project lod0 GLB:</p>
        <input class="editor-search" id="opt-lib-filter" type="search" placeholder="Filter family / name…" />
        <div class="optimizer-library" id="opt-library" tabindex="-1"></div>
      </div>
    </details>
    <details class="editor-panel-section" id="opt-optimize-section">
      <summary>2. Optimize</summary>
      <div class="editor-panel-section-body">
        <label class="optimizer-field">
          <span>Topology</span>
          <select id="opt-topo">
            <option value="preserveUv">Preserve UVs</option>
            <option value="rebuild">Voxel remesh</option>
          </select>
        </label>
        <label class="editor-range">
          <span>Target tris</span>
          <input id="opt-tris" type="range" min="500" max="80000" step="100" value="${s.targetTriangles}" />
          <output id="opt-tris-out"></output>
        </label>
        <div class="optimizer-rebuild-only" id="opt-rebuild-group" hidden>
          <label class="optimizer-field">
            <span>Texture</span>
            <select id="opt-tex">
              <option value="512">512</option>
              <option value="1024">1024</option>
              <option value="2048">2048</option>
            </select>
          </label>
          <label class="editor-check" title="On full Optimize, uncovered cage samples stay transparent instead of being filled.">
            <input id="opt-holes" type="checkbox" /> Keep cage misses as alpha holes
          </label>
          <p class="editor-hint-copy optimizer-hint-tight" id="opt-holes-hint" hidden>Alpha holes apply on full Optimize (bake), not interactive preview.</p>
          <label class="editor-check" title="Preserve a thin outer shell during voxel remesh (default).">
            <input id="opt-shell" type="checkbox" /> Remesh: Shell
          </label>
          <label class="editor-check" title="Extra remesh solve pass for smoother topology (slower).">
            <input id="opt-solve" type="checkbox" /> Remesh: Solve
          </label>
        </div>
        <p class="editor-hint-copy" id="opt-material-mode">Preserve UVs keeps authored maps, materials, and mesh order.</p>
        <p class="editor-hint-copy" id="opt-stats"></p>
      </div>
      <div class="optimizer-optimize-body">
        <label class="editor-check" title="Live-updates the right pane while you tune settings. Preview alone cannot be saved — click Optimize to commit.">
          <input id="opt-preview" type="checkbox" /> Interactive geometry preview
        </label>
        <div class="optimizer-actions">
          <button type="button" class="editor-primary-btn" id="opt-run" disabled>Optimize</button>
          <button type="button" class="editor-secondary-btn" id="opt-cancel" disabled>Cancel</button>
        </div>
        <p class="editor-hint-copy">Preview updates geometry only. Optimize bakes/reloads a GLB so Save and Download work.</p>
      </div>
    </details>
    <details class="editor-panel-section" id="opt-viewport-section">
      <summary>3. Viewport</summary>
      <div class="editor-panel-section-body">
        <label class="editor-check"><input id="opt-lit" type="checkbox" /> Lit shading</label>
        <label class="editor-check"><input id="opt-wire" type="checkbox" /> Wireframe</label>
        <button type="button" class="editor-secondary-btn" id="opt-fit">Fit camera</button>
      </div>
    </details>
    <details class="editor-panel-section" id="opt-save-section">
      <summary>4. Save / download</summary>
      <div class="editor-panel-section-body">
        <label class="optimizer-field"><span>Family</span><input id="opt-family" type="text" value="optimized" autocomplete="off" /></label>
        <label class="optimizer-field"><span>Name</span><input id="opt-name" type="text" value="Asset" autocomplete="off" /></label>
        <label class="editor-check"><input id="opt-overwrite" type="checkbox" /> Overwrite existing</label>
        <label class="editor-check" title="Writes Name.glb plus Name_lod1.glb / Name_lod2.glb via the DEV save API.">
          <input id="opt-lod" type="checkbox" /> Emit lod0 + lod1 + lod2 on save
        </label>
        <div class="optimizer-actions">
          <button type="button" class="editor-primary-btn" id="opt-save" disabled>Save to public/models</button>
          <button type="button" class="editor-secondary-btn" id="opt-download" disabled>Download GLB</button>
        </div>
        <p class="editor-hint-copy">Requires a full Optimize first. Project save writes KTX2; Download is an uncompressed GLB. New assets still need a manual assetManifest entry.</p>
        <p class="editor-hint-copy" id="opt-caps"></p>
      </div>
    </details>
    <details class="editor-panel-section" id="opt-lod-section">
      <summary>5. LOD compare</summary>
      <div class="editor-panel-section-body">
        <div class="editor-prop-tabs optimizer-view-mode" id="opt-view-mode">
          <button type="button" class="editor-prop-tab is-active" id="opt-view-optimize" data-mode="optimize">Optimize view</button>
          <button type="button" class="editor-prop-tab" id="opt-view-lod" data-mode="lod">LOD compare</button>
        </div>
        <p class="editor-hint-copy" id="opt-lod-hint">Pick a project prop with *_lod1 / *_lod2 siblings to compare bands.</p>
        <div class="optimizer-lod-panes" id="opt-lod-panes" hidden>
          <div>
            <span class="editor-hint-copy">Left pane (viewport)</span>
            <div class="editor-prop-tabs" id="opt-lod-left"></div>
          </div>
          <div>
            <span class="editor-hint-copy">Right pane (viewport)</span>
            <div class="editor-prop-tabs" id="opt-lod-right"></div>
          </div>
        </div>
      </div>
    </details>
    <div class="optimizer-progress" aria-live="polite">
      <div class="optimizer-progress-head"><strong id="opt-progress-status">Ready to preview</strong><span id="opt-progress-percent"></span></div>
      <progress id="opt-progress-bar" max="100" value="0"></progress>
      <div class="optimizer-progress-phases" id="opt-progress-phases"></div>
    </div>
  `;

  const drop = host.querySelector<HTMLElement>('#opt-drop')!;
  const file = host.querySelector<HTMLInputElement>('#opt-file')!;
  const topo = host.querySelector<HTMLSelectElement>('#opt-topo')!;
  const tex = host.querySelector<HTMLSelectElement>('#opt-tex')!;
  const rebuildGroup = host.querySelector<HTMLElement>('#opt-rebuild-group')!;
  const holesHint = host.querySelector<HTMLElement>('#opt-holes-hint')!;
  const materialMode = host.querySelector<HTMLElement>('#opt-material-mode')!;
  const lodHint = host.querySelector<HTMLElement>('#opt-lod-hint')!;
  const lodLeft = host.querySelector<HTMLElement>('#opt-lod-left')!;
  const lodRight = host.querySelector<HTMLElement>('#opt-lod-right')!;
  const lodPanes = host.querySelector<HTMLElement>('#opt-lod-panes')!;
  const viewOptimize = host.querySelector<HTMLButtonElement>('#opt-view-optimize')!;
  const viewLod = host.querySelector<HTMLButtonElement>('#opt-view-lod')!;
  const runBtn = host.querySelector<HTMLButtonElement>('#opt-run')!;
  const cancelBtn = host.querySelector<HTMLButtonElement>('#opt-cancel')!;
  const saveBtn = host.querySelector<HTMLButtonElement>('#opt-save')!;
  const downloadBtn = host.querySelector<HTMLButtonElement>('#opt-download')!;
  const progressStatus = host.querySelector<HTMLElement>('#opt-progress-status')!;
  const progressPercent = host.querySelector<HTMLElement>('#opt-progress-percent')!;
  const progressBar = host.querySelector<HTMLProgressElement>('#opt-progress-bar')!;
  const progressPhases = host.querySelector<HTMLElement>('#opt-progress-phases')!;
  const libFilter = host.querySelector<HTMLInputElement>('#opt-lib-filter')!;
  const rebuildOption = topo.querySelector<HTMLOptionElement>('option[value="rebuild"]')!;

  topo.value = s.topology;
  tex.value = String(s.textureSize);

  let lodState: LodPreviewState = {
    available: [0],
    left: 0,
    right: 0,
    viewMode: 'optimize',
    hint: 'Pick a project prop with *_lod1 / *_lod2 siblings to compare bands.',
  };
  let libraryEntries: LibraryEntry[] = [];
  let selectedLibraryKey: string | null = null;
  let rebuildAllowed = true;
  let rebuildReason: string | null = null;
  let canOptimize = false;
  let exportReady = false;
  let busy = false;

  const syncRebuildUi = () => {
    const isRebuild = s.topology === 'rebuild';
    rebuildGroup.hidden = !isRebuild;
    holesHint.hidden = !(isRebuild && s.interactivePreview);
    rebuildOption.disabled = !rebuildAllowed;
    if (!rebuildAllowed && s.topology === 'rebuild') {
      s.topology = 'preserveUv';
      topo.value = 'preserveUv';
      rebuildGroup.hidden = true;
    }
    materialMode.textContent = isRebuild
      ? 'Voxel remesh bakes a PBR atlas (opaque/default class only).'
      : 'Preserve UVs keeps authored maps, materials, and mesh order.';
    if (!rebuildAllowed && rebuildReason) {
      materialMode.textContent = `${materialMode.textContent} Rebuild blocked: ${rebuildReason}`;
    }
  };

  const syncActionButtons = () => {
    runBtn.disabled = !canOptimize || busy;
    cancelBtn.disabled = !busy;
    saveBtn.disabled = !exportReady || busy;
    downloadBtn.disabled = !exportReady || busy;
  };

  const syncLodUi = () => {
    lodHint.textContent = lodState.hint;
    viewOptimize.classList.toggle('is-active', lodState.viewMode === 'optimize');
    viewLod.classList.toggle('is-active', lodState.viewMode === 'lod');
    viewLod.disabled = lodState.available.length < 2;
    const inLod = lodState.viewMode === 'lod';
    lodPanes.hidden = !inLod;
    const lodDisabled = !inLod || lodState.available.length < 2;
    renderLodTabs(lodLeft, lodState.available, lodState.left, lodDisabled, (level) =>
      opts.onLodPane('left', level),
    );
    renderLodTabs(lodRight, lodState.available, lodState.right, lodDisabled, (level) =>
      opts.onLodPane('right', level),
    );
  };

  const renderLibrary = () => {
    const libEl = host.querySelector('#opt-library')!;
    libEl.replaceChildren();
    const q = libFilter.value.trim().toLowerCase();
    for (const entry of libraryEntries) {
      const key = libraryKey(entry);
      if (q && !key.toLowerCase().includes(q)) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `optimizer-library-item${selectedLibraryKey === key ? ' is-selected' : ''}`;
      btn.dataset.key = key;
      const lodNote = entry.embeddedLod ? 'embedded LOD' : libraryLodLabel(entry);
      btn.textContent = `${key} (${lodNote})`;
      btn.title =
        availableLibraryLods(entry).length > 1
          ? 'Has sibling LOD files — open then use LOD compare'
          : entry.embeddedLod
            ? 'Embedded extractLod pack (sibling LOD compare unavailable)'
            : 'lod0 only';
      btn.addEventListener('click', () => opts.onPickLibrary(entry));
      libEl.appendChild(btn);
    }
  };

  syncRebuildUi();
  syncLodUi();
  host
    .querySelector<HTMLButtonElement>('#opt-help')
    ?.addEventListener('click', () => opts.onHelp?.());
  progressStatus.textContent = 'Ready to preview';

  viewOptimize.addEventListener('click', () => opts.onViewMode('optimize'));
  viewLod.addEventListener('click', () => {
    if (lodState.available.length < 2) return;
    opts.onViewMode('lod');
  });

  const emit = (changed: (keyof OptimizerSettings)[]) => {
    opts.onSettings({ ...s, remeshFlags: [...s.remeshFlags] }, changed);
  };
  const unbind: Array<() => void> = [];
  unbind.push(
    bindEditorRange(host, 'opt-tris', (v) => `${Math.round(v).toLocaleString()}`, {
      emitInitial: false,
      onInput: (v) => {
        s.targetTriangles = Math.round(v);
        emit(['targetTriangles']);
      },
    }),
  );
  // Sync initial output without emitting a settings change.
  const trisOut = host.querySelector('#opt-tris-out');
  if (trisOut) trisOut.textContent = s.targetTriangles.toLocaleString();

  unbind.push(
    bindEditorCheckbox(
      host,
      'opt-preview',
      () => s.interactivePreview,
      (v) => {
        s.interactivePreview = v;
        syncRebuildUi();
        emit(['interactivePreview']);
      },
    ),
  );
  unbind.push(
    bindEditorCheckbox(
      host,
      'opt-holes',
      () => s.alphaHoles,
      (v) => {
        s.alphaHoles = v;
        emit(['alphaHoles']);
      },
    ),
  );
  unbind.push(
    bindEditorCheckbox(
      host,
      'opt-lod',
      () => s.emitLodChain,
      (v) => {
        s.emitLodChain = v;
        emit(['emitLodChain']);
      },
    ),
  );
  unbind.push(
    bindEditorCheckbox(
      host,
      'opt-lit',
      () => s.lit,
      (v) => {
        s.lit = v;
        emit(['lit']);
      },
    ),
  );
  unbind.push(
    bindEditorCheckbox(
      host,
      'opt-wire',
      () => s.wireframe,
      (v) => {
        s.wireframe = v;
        emit(['wireframe']);
      },
    ),
  );
  unbind.push(
    bindEditorCheckbox(
      host,
      'opt-shell',
      () => s.remeshFlags.includes('Shell'),
      (v) => {
        s.remeshFlags = v
          ? [...new Set([...s.remeshFlags, 'Shell' as const])]
          : s.remeshFlags.filter((f) => f !== 'Shell');
        emit(['remeshFlags']);
      },
    ),
  );
  unbind.push(
    bindEditorCheckbox(
      host,
      'opt-solve',
      () => s.remeshFlags.includes('Solve'),
      (v) => {
        s.remeshFlags = v
          ? [...new Set([...s.remeshFlags, 'Solve' as const])]
          : s.remeshFlags.filter((f) => f !== 'Solve');
        emit(['remeshFlags']);
      },
    ),
  );

  const onTopo = () => {
    if (topo.value === 'rebuild' && !rebuildAllowed) {
      topo.value = 'preserveUv';
      return;
    }
    s.topology = topo.value as OptimizerSettings['topology'];
    syncRebuildUi();
    emit(['topology']);
  };
  const onTex = () => {
    s.textureSize = Number(tex.value) as OptimizerSettings['textureSize'];
    emit(['textureSize']);
  };
  topo.addEventListener('change', onTopo);
  tex.addEventListener('change', onTex);
  libFilter.addEventListener('input', renderLibrary);

  const onBrowse = () => file.click();
  drop.addEventListener('click', onBrowse);
  drop.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onBrowse();
    }
  });
  file.addEventListener('change', () => {
    if (file.files && file.files.length > 0) opts.onOpenFiles(file.files);
  });
  const onDrag = (event: DragEvent) => {
    event.preventDefault();
    drop.classList.toggle('is-hot', event.type !== 'dragleave');
  };
  drop.addEventListener('dragover', onDrag);
  drop.addEventListener('dragleave', onDrag);
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('is-hot');
    if (event.dataTransfer?.files?.length) opts.onOpenFiles(event.dataTransfer.files);
  });

  runBtn.addEventListener('click', opts.onOptimize);
  cancelBtn.addEventListener('click', opts.onCancel);
  saveBtn.addEventListener('click', opts.onSave);
  downloadBtn.addEventListener('click', opts.onDownload);
  host.querySelector('#opt-fit')!.addEventListener('click', () => opts.onFitCamera?.());

  const issuesEl = document.createElement('div');
  issuesEl.className = 'optimizer-issues';
  issuesEl.id = 'opt-issues';
  issuesEl.hidden = true;
  host.appendChild(issuesEl);
  const sourceSection = host.querySelector<HTMLDetailsElement>('#opt-source-section')!;
  const optimizeSection = host.querySelector<HTMLDetailsElement>('#opt-optimize-section')!;
  const viewportSection = host.querySelector<HTMLDetailsElement>('#opt-viewport-section')!;
  const saveSection = host.querySelector<HTMLDetailsElement>('#opt-save-section')!;
  const lodSection = host.querySelector<HTMLDetailsElement>('#opt-lod-section')!;
  const capsEl = host.querySelector('#opt-caps')!;
  const statsEl = host.querySelector('#opt-stats')!;
  const libEl = host.querySelector<HTMLElement>('#opt-library')!;

  return {
    settings: () => ({
      ...s,
      remeshFlags: [...s.remeshFlags],
      family: (host.querySelector('#opt-family') as HTMLInputElement).value.trim(),
      name: (host.querySelector('#opt-name') as HTMLInputElement).value.trim(),
      overwrite: (host.querySelector('#opt-overwrite') as HTMLInputElement).checked,
    }),
    setIssues(issues) {
      sourceSection.open = false;
      optimizeSection.open = true;
      viewportSection.open = false;
      saveSection.open = false;
      lodSection.open = false;
      if (issues.length === 0) {
        issuesEl.hidden = true;
        issuesEl.innerHTML = '';
        return;
      }
      issuesEl.hidden = false;
      issuesEl.innerHTML = issues
        .map(
          (i) =>
            `<div class="${i.severity === 'block' ? 'is-block' : i.severity === 'warn' ? 'is-warn' : ''}">${escapeHtml(i.message)}</div>`,
        )
        .join('');
    },
    setProgress(progress) {
      progressStatus.textContent = progress.status;
      progressBar.value = progress.percent ?? 0;
      progressBar.classList.toggle('is-indeterminate', progress.percent === null);
      progressPercent.textContent =
        progress.percent === null ? '' : `${Math.round(progress.percent)}%`;
      progressPhases.innerHTML = progress.phases
        .filter((phase) => !phase.hidden)
        .map(
          (phase) =>
            `<span class="optimizer-phase is-${phase.state}">${escapeHtml(phase.label)}</span>`,
        )
        .join('');
    },
    setExportReady(ready) {
      exportReady = ready;
      syncActionButtons();
    },
    setLibrary(entries) {
      libraryEntries = entries;
      renderLibrary();
    },
    setSelectedLibrary(key) {
      selectedLibraryKey = key;
      renderLibrary();
    },
    setLodPreview(state) {
      lodState = state;
      syncLodUi();
    },
    setCaps(text) {
      capsEl.textContent = text;
    },
    setStats(text) {
      statsEl.textContent = text;
    },
    setRebuildGate(allowed, reason) {
      rebuildAllowed = allowed;
      rebuildReason = reason;
      syncRebuildUi();
    },
    setCanOptimize(can) {
      canOptimize = can;
      syncActionButtons();
    },
    setSaveFields(family, name) {
      const familyInput = host.querySelector('#opt-family') as HTMLInputElement;
      const nameInput = host.querySelector('#opt-name') as HTMLInputElement;
      familyInput.value = family;
      nameInput.value = name;
    },
    focusLibrary() {
      libEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      libFilter.focus();
      libEl.classList.add('is-focus-flash');
      window.setTimeout(() => libEl.classList.remove('is-focus-flash'), 900);
    },
    dispose() {
      for (const u of unbind) u();
      topo.removeEventListener('change', onTopo);
      tex.removeEventListener('change', onTex);
    },
  };
}
