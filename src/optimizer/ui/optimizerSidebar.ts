// src/optimizer/ui/optimizerSidebar.ts — numbered Needle-like controls
import { bindEditorCheckbox } from '../../editor/ui/controls/editorCheckbox';
import { bindEditorRange } from '../../editor/ui/controls/editorRange';
import type { LibraryEntry } from '../io/libraryClient';
import type { OptimizerIssue, OptimizerSaveFields, OptimizerSettings } from '../pipeline/types';

export interface SidebarApi {
  settings: () => OptimizerSaveFields;
  setIssues: (issues: OptimizerIssue[]) => void;
  setChecklist: (
    items: { id: string; label: string; state: 'idle' | 'run' | 'done' | 'err' }[],
  ) => void;
  setLibrary: (entries: LibraryEntry[]) => void;
  setCaps: (text: string) => void;
  setStats: (text: string) => void;
  dispose: () => void;
}

export function mountOptimizerSidebar(
  host: HTMLElement,
  opts: {
    settings: OptimizerSettings;
    onSettings: (next: OptimizerSettings) => void;
    onOpenFiles: (files: FileList) => void;
    onPickLibrary: (entry: LibraryEntry) => void;
    onOptimize: () => void;
    onCancel: () => void;
    onSave: () => void;
    onDownload: () => void;
  },
): SidebarApi {
  const s = { ...opts.settings };
  host.innerHTML = `
    <details class="editor-panel-section" open>
      <summary>1. Source</summary>
      <div class="editor-panel-section-body">
        <div class="optimizer-drop" id="opt-drop">Drop GLB / ZIP / glTF / OBJ / FBX / PLY</div>
        <input class="optimizer-file" id="opt-file" type="file" accept=".glb,.gltf,.zip,.obj,.fbx,.ply,.mtl,.bin,.png,.jpg,.jpeg,.webp" multiple />
        <button type="button" id="opt-browse">Browse…</button>
        <p class="editor-hint-copy">Or pick a project lod0 GLB:</p>
        <div class="optimizer-library" id="opt-library"></div>
      </div>
    </details>
    <details class="editor-panel-section" open>
      <summary>2. Geometry / bake</summary>
      <div class="editor-panel-section-body">
        <label class="editor-range">
          <span>Triangles</span>
          <input id="opt-tris" type="range" min="500" max="80000" step="100" value="${s.targetTriangles}" />
          <output id="opt-tris-out"></output>
        </label>
        <label class="editor-range">
          <span>Topology</span>
          <select id="opt-topo">
            <option value="preserveUv">Preserve UVs</option>
            <option value="rebuild">Voxel remesh</option>
          </select>
          <span></span>
        </label>
        <label class="editor-range">
          <span>Texture</span>
          <select id="opt-tex">
            <option value="512">512</option>
            <option value="1024">1024</option>
            <option value="2048">2048</option>
          </select>
          <span></span>
        </label>
        <label class="editor-check"><input id="opt-preview" type="checkbox" /> Interactive geometry preview</label>
        <label class="editor-check"><input id="opt-holes" type="checkbox" /> Keep cage misses as alpha holes</label>
        <label class="editor-check"><input id="opt-shell" type="checkbox" /> Remesh: Shell</label>
        <label class="editor-check"><input id="opt-solve" type="checkbox" /> Remesh: Solve</label>
        <label class="editor-check"><input id="opt-lod" type="checkbox" /> Emit lod0 + lod1 + lod2 on save</label>
        <label class="editor-check"><input id="opt-lit" type="checkbox" /> Lit shading</label>
        <label class="editor-check"><input id="opt-wire" type="checkbox" /> Wireframe</label>
        <p class="editor-hint-copy" id="opt-material-mode">Preserve UVs keeps authored maps. Voxel remesh bakes a PBR atlas.</p>
        <p class="editor-hint-copy" id="opt-caps"></p>
        <p class="editor-hint-copy" id="opt-stats"></p>
      </div>
    </details>
    <details class="editor-panel-section" open>
      <summary>3. Optimize</summary>
      <div class="editor-panel-section-body">
        <div class="editor-prop-tabs">
          <button type="button" id="opt-run">Optimize</button>
          <button type="button" id="opt-cancel">Cancel</button>
        </div>
        <ol class="optimizer-checklist" id="opt-check"></ol>
        <div class="optimizer-issues" id="opt-issues"></div>
      </div>
    </details>
    <details class="editor-panel-section" open>
      <summary>4. Save / download</summary>
      <div class="editor-panel-section-body">
        <label class="editor-range"><span>Family</span><input id="opt-family" type="text" value="optimized" /><span></span></label>
        <label class="editor-range"><span>Name</span><input id="opt-name" type="text" value="Asset" /><span></span></label>
        <label class="editor-check"><input id="opt-overwrite" type="checkbox" /> Overwrite existing</label>
        <div class="editor-prop-tabs">
          <button type="button" id="opt-save">Save to public/models</button>
          <button type="button" id="opt-download">Download GLB</button>
        </div>
        <p class="editor-hint-copy">Download is uncompressed preview. Project save writes KTX2 lod0/1/2. New assets still need a manual assetManifest entry.</p>
      </div>
    </details>
  `;

  const drop = host.querySelector<HTMLElement>('#opt-drop')!;
  const file = host.querySelector<HTMLInputElement>('#opt-file')!;
  const topo = host.querySelector<HTMLSelectElement>('#opt-topo')!;
  const tex = host.querySelector<HTMLSelectElement>('#opt-tex')!;
  topo.value = s.topology;
  tex.value = String(s.textureSize);

  const emit = () => opts.onSettings({ ...s });
  const unbind: Array<() => void> = [];
  unbind.push(
    bindEditorRange(host, 'opt-tris', (v) => `${Math.round(v)}`, {
      onInput: (v) => {
        s.targetTriangles = Math.round(v);
        emit();
      },
    }),
  );
  unbind.push(
    bindEditorCheckbox(
      host,
      'opt-preview',
      () => s.interactivePreview,
      (v) => {
        s.interactivePreview = v;
        emit();
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
        emit();
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
        emit();
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
        emit();
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
        emit();
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
        emit();
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
        emit();
      },
    ),
  );

  const onTopo = () => {
    s.topology = topo.value as OptimizerSettings['topology'];
    const mode = host.querySelector('#opt-material-mode');
    if (mode) {
      mode.textContent =
        s.topology === 'rebuild'
          ? 'Voxel remesh bakes a PBR atlas (opaque/default class only).'
          : 'Preserve UVs keeps authored maps, materials, and mesh order.';
    }
    emit();
  };
  const onTex = () => {
    s.textureSize = Number(tex.value) as OptimizerSettings['textureSize'];
    emit();
  };
  topo.addEventListener('change', onTopo);
  tex.addEventListener('change', onTex);

  const onBrowse = () => file.click();
  host.querySelector('#opt-browse')!.addEventListener('click', onBrowse);
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

  host.querySelector('#opt-run')!.addEventListener('click', opts.onOptimize);
  host.querySelector('#opt-cancel')!.addEventListener('click', opts.onCancel);
  host.querySelector('#opt-save')!.addEventListener('click', opts.onSave);
  host.querySelector('#opt-download')!.addEventListener('click', opts.onDownload);

  const issuesEl = host.querySelector('#opt-issues')!;
  const checkEl = host.querySelector('#opt-check')!;
  const libEl = host.querySelector('#opt-library')!;
  const capsEl = host.querySelector('#opt-caps')!;
  const statsEl = host.querySelector('#opt-stats')!;

  return {
    settings: () => ({
      ...s,
      family: (host.querySelector('#opt-family') as HTMLInputElement).value.trim(),
      name: (host.querySelector('#opt-name') as HTMLInputElement).value.trim(),
      overwrite: (host.querySelector('#opt-overwrite') as HTMLInputElement).checked,
    }),
    setIssues(issues) {
      issuesEl.innerHTML = issues
        .map(
          (i) =>
            `<div class="${i.severity === 'block' ? 'is-block' : i.severity === 'warn' ? 'is-warn' : ''}">${i.message}</div>`,
        )
        .join('');
    },
    setChecklist(items) {
      checkEl.innerHTML = items
        .map(
          (i) =>
            `<li class="${i.state === 'done' ? 'is-done' : i.state === 'err' ? 'is-err' : ''}">${i.label}</li>`,
        )
        .join('');
    },
    setLibrary(entries) {
      libEl.replaceChildren();
      for (const entry of entries) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = `${entry.family}/${entry.name}${entry.embeddedLod ? ' (embedded LOD)' : ''}`;
        btn.addEventListener('click', () => opts.onPickLibrary(entry));
        libEl.appendChild(btn);
      }
    },
    setCaps(text) {
      capsEl.textContent = text;
    },
    setStats(text) {
      statsEl.textContent = text;
    },
    dispose() {
      for (const u of unbind) u();
      topo.removeEventListener('change', onTopo);
      tex.removeEventListener('change', onTex);
    },
  };
}
