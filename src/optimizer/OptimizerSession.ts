// src/optimizer/OptimizerSession.ts — import, optimize, preview, export, save
import { Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createKtx2Loader } from '../assets/createKtx2Loader';
import { DRACO_DECODER_PATH } from '../assets/decoderPaths';
import { setEditorToastParent, showEditorToast } from '../editor/ui/editorToast';
import { buildPreservePreview, buildRebuildPreview, exportOptimizedGlb } from './io/exportGlb';
import { type ImportedAsset, importLocalFiles, importProjectGlb } from './io/importAsset';
import { fetchCapabilities, fetchLibrary, type LibraryEntry } from './io/libraryClient';
import { downloadGlb, saveOptimizedToProject } from './io/saveClient';
import { bakePbrMaps, sourceHasVertexColor, transferVertexColor } from './pipeline/bakePbr';
import { collectStaticPrimitives, primitiveToGeometry } from './pipeline/prepareStaticSource';
import { countGeometry, formatBytes, reductionPct } from './pipeline/stats';
import {
  DEFAULT_OPTIMIZER_SETTINGS,
  type OptimizerSettings,
  type StaticValidation,
} from './pipeline/types';
import { rebuildBlockReason, validateStaticAsset } from './pipeline/validateStaticAsset';
import { attachSplitDrag, renderSplitViews } from './scene/splitViewport';
import { createStudioScene } from './scene/studioScene';
import { createOptimizerShell } from './ui/OptimizerShell';
import { mountOptimizerSidebar, type SidebarApi } from './ui/optimizerSidebar';
import { createGeometryClient } from './workers/geometryClient';

export type OptimizerSession = {
  dispose: () => void;
};

export async function createOptimizerSession(host: HTMLElement): Promise<OptimizerSession> {
  const shell = createOptimizerShell(host);
  setEditorToastParent(host);
  shell.documentBar.innerHTML = `
    <span class="optimizer-doc-title">Pantheon Asset Optimizer</span>
    <span class="editor-hint-copy">DEV only · static props</span>
    <div class="optimizer-doc-actions">
      <button type="button" id="opt-doc-open">Open from project</button>
      <button type="button" id="opt-doc-save">Save to public/models</button>
      <button type="button" id="opt-doc-download">Download GLB</button>
    </div>
  `;

  const studio = await createStudioScene(shell.canvas);
  let settings: OptimizerSettings = { ...DEFAULT_OPTIMIZER_SETTINGS };
  let imported: ImportedAsset | null = null;
  let validation: StaticValidation | null = null;
  let optimizedRoot: Object3D | null = null;
  let previewGlb: ArrayBuffer | null = null;
  let split = 0.5;
  let generation = 0;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let sidebar!: SidebarApi;
  let saveAbort: AbortController | null = null;
  let renderLoop: (() => void) | null = null;

  const withPausedPreview = async <T>(fn: () => Promise<T>): Promise<T> => {
    studio.renderer.setAnimationLoop(null);
    try {
      return await fn();
    } finally {
      if (renderLoop) studio.renderer.setAnimationLoop(renderLoop);
    }
  };

  const checklist = (
    items: { id: string; label: string; state: 'idle' | 'run' | 'done' | 'err' }[],
  ) => sidebar.setChecklist(items);

  const client = createGeometryClient((phase, message) => {
    showEditorToast(message, 'info', 1600);
    checklist([{ id: phase, label: message, state: 'run' }]);
  });

  const applyStudioFlags = () => {
    studio.setLit(settings.lit);
    studio.setWireframe(settings.wireframe);
  };

  const updateLabels = () => {
    const src = imported ? countGeometry(imported.root) : null;
    const dst = optimizedRoot ? countGeometry(optimizedRoot) : null;
    shell.labelLeft.textContent = src
      ? `Original · ${src.triangles.toLocaleString()} tris`
      : 'Original';
    shell.labelRight.textContent =
      dst && src
        ? `Optimized · ${dst.triangles.toLocaleString()} tris (${reductionPct(src.triangles, dst.triangles)}%)`
        : 'Optimized';
    if (src) {
      const dstLine = dst
        ? ` · result ${dst.triangles.toLocaleString()} tris / ${dst.vertices.toLocaleString()} verts / ${dst.meshes} meshes`
        : '';
      const srcBytes = imported ? ` · source ${formatBytes(imported.sourceBytes)}` : '';
      const dstBytes = previewGlb ? ` · preview GLB ${formatBytes(previewGlb.byteLength)}` : '';
      sidebar.setStats(
        `${src.triangles.toLocaleString()} tris · ${src.vertices.toLocaleString()} verts · ${src.meshes} meshes · ${src.materials} mats · ~${formatBytes(src.textureBytesEst)}${srcBytes}${dstLine}${dstBytes}`,
      );
    }
  };

  const setOptimized = (obj: Object3D | null) => {
    optimizedRoot = obj;
    studio.setOptimized(obj);
    updateLabels();
  };

  const reloadGlb = async (buffer: ArrayBuffer): Promise<Object3D> => {
    const loader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath(DRACO_DECODER_PATH);
    loader.setDRACOLoader(draco);
    loader.setKTX2Loader(createKtx2Loader(studio.renderer));
    const copy = buffer.slice(0);
    const gltf = await loader.parseAsync(copy, `optimizer-reload://${Date.now()}/`);
    draco.dispose();
    return gltf.scene;
  };

  const runOptimize = async (interactive: boolean) => {
    if (!imported || !validation?.ok) {
      showEditorToast('Import a valid static asset first', 'error');
      return;
    }
    const gen = ++generation;
    const s = settings;
    try {
      const primitives = collectStaticPrimitives(imported.root);
      if (s.topology === 'rebuild') {
        const block = rebuildBlockReason(validation);
        if (block) {
          showEditorToast(block, 'error');
          return;
        }
        checklist([{ id: 'remesh', label: 'Remesh + atlas', state: 'run' }]);
        const geom = await client.rebuild(
          primitives,
          s.targetTriangles,
          s.remeshFlags,
          s.textureSize,
        );
        if (gen !== generation) return;
        const prim = geom.primitives[0];
        if (!prim) throw new Error('Rebuild produced no mesh');
        const geo = primitiveToGeometry(prim);
        if (interactive) {
          const preview = new Group();
          preview.add(
            new Mesh(
              geo,
              new MeshStandardMaterial({
                color: 0xc8c0b4,
                name: prim.materialName,
                wireframe: settings.wireframe,
              }),
            ),
          );
          setOptimized(preview);
          previewGlb = null;
          checklist([
            { id: 'remesh', label: `Remesh preview (${geom.stats.triangles} tris)`, state: 'done' },
          ]);
          return;
        }
        checklist([{ id: 'bake', label: 'WebGPU PBR bake', state: 'run' }]);
        const sourceRoot = imported.root;
        const { glb, reloaded } = await withPausedPreview(async () => {
          const baked = await bakePbrMaps({
            renderer: studio.renderer,
            sourceRoot,
            lowGeometry: geo,
            textureSize: s.textureSize,
            alphaHoles: s.alphaHoles,
            onProgress: (_p, msg) => checklist([{ id: 'bake', label: msg, state: 'run' }]),
          });
          if (sourceHasVertexColor(sourceRoot)) {
            transferVertexColor(sourceRoot, baked.geometry);
          }
          const preview = buildRebuildPreview(baked.geometry, baked, prim.materialName);
          const buffer = await exportOptimizedGlb(studio.renderer, preview);
          return { glb: buffer, reloaded: await reloadGlb(buffer) };
        });
        if (gen !== generation) return;
        previewGlb = glb;
        setOptimized(reloaded);
        checklist([{ id: 'bake', label: 'Bake + reload OK', state: 'done' }]);
        showEditorToast('Rebuild complete', 'success');
        return;
      }

      checklist([{ id: 'simp', label: 'Simplify (Preserve UVs)', state: 'run' }]);
      const geom = await client.simplify(primitives, s.targetTriangles);
      if (gen !== generation) return;
      const preview = buildPreservePreview(geom.primitives, imported.root);
      if (interactive) {
        setOptimized(preview);
        previewGlb = null;
        checklist([{ id: 'simp', label: `Preview ${geom.stats.triangles} tris`, state: 'done' }]);
        for (const w of geom.warnings) showEditorToast(w, 'info', 5000);
        return;
      }
      const { glb, reloaded } = await withPausedPreview(async () => {
        const buffer = await exportOptimizedGlb(studio.renderer, preview);
        return { glb: buffer, reloaded: await reloadGlb(buffer) };
      });
      if (gen !== generation) return;
      previewGlb = glb;
      setOptimized(reloaded);
      for (const w of geom.warnings) showEditorToast(w, 'info', 5000);
      checklist([{ id: 'simp', label: 'Simplify + reload OK', state: 'done' }]);
      showEditorToast('Preserve UVs complete', 'success');
    } catch (err) {
      if ((err as Error).message === 'cancelled') return;
      checklist([{ id: 'err', label: (err as Error).message, state: 'err' }]);
      showEditorToast((err as Error).message, 'error');
    }
  };

  const schedulePreview = () => {
    if (!settings.interactivePreview || !imported) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(
      () => {
        void runOptimize(true);
      },
      settings.topology === 'rebuild' ? 450 : 120,
    );
  };

  sidebar = mountOptimizerSidebar(shell.sidebar, {
    settings,
    onSettings(next) {
      const topoChanged = next.topology !== settings.topology;
      settings = next;
      applyStudioFlags();
      if (topoChanged || next.interactivePreview) schedulePreview();
    },
    onOpenFiles: (files) => {
      void openFiles(files);
    },
    onPickLibrary: (entry) => {
      void openLibrary(entry);
    },
    onOptimize: () => {
      void runOptimize(false);
    },
    onCancel: () => {
      generation += 1;
      client.cancel();
      saveAbort?.abort();
      showEditorToast('Cancelled', 'info');
    },
    onSave: () => {
      void saveProject();
    },
    onDownload: () => {
      if (!previewGlb) {
        showEditorToast(
          'Run Optimize (not just preview) so the GLB can be reloaded first',
          'error',
        );
        return;
      }
      downloadGlb(previewGlb, `${sidebar.settings().name || 'optimized'}.glb`);
    },
  });

  const openFiles = async (files: FileList | File[]) => {
    const list = [...files];
    if (list.length === 0) return;
    imported?.dispose();
    imported = await importLocalFiles(studio.renderer, list);
    afterImport(list[0].name.replace(/\.[^.]+$/, ''), false);
  };

  const openLibrary = async (entry: LibraryEntry) => {
    imported?.dispose();
    imported = await importProjectGlb(studio.renderer, entry.url, `${entry.family}/${entry.name}`);
    afterImport(entry.name, entry.embeddedLod);
    const familyInput = shell.sidebar.querySelector('#opt-family') as HTMLInputElement | null;
    const nameInput = shell.sidebar.querySelector('#opt-name') as HTMLInputElement | null;
    if (familyInput) familyInput.value = entry.family;
    if (nameInput) nameInput.value = entry.name;
  };

  const afterImport = (name: string, embeddedLod: boolean) => {
    if (!imported) return;
    validation = validateStaticAsset(imported.root, imported.clips, {
      sourceBytes: imported.sourceBytes,
      embeddedLod,
    });
    sidebar.setIssues(validation.issues);
    studio.setOriginal(imported.root.clone(true));
    setOptimized(null);
    previewGlb = null;
    studio.fit();
    updateLabels();
    if (!validation.ok)
      showEditorToast(
        validation.issues.find((i) => i.severity === 'block')?.message ?? 'Import blocked',
        'error',
      );
    else showEditorToast(`Loaded ${name} (${formatBytes(imported.sourceBytes)})`, 'success');
    schedulePreview();
  };

  const saveProject = async () => {
    if (!previewGlb) {
      showEditorToast('Run Optimize and wait for reload before project save', 'error');
      return;
    }
    if (validation?.embeddedLod) {
      showEditorToast(
        'Embedded-LOD catalog assets cannot be overwritten with sibling files. Save to a new family/name.',
        'error',
      );
      return;
    }
    const fields = sidebar.settings();
    saveAbort?.abort();
    saveAbort = new AbortController();
    try {
      const result = await saveOptimizedToProject({
        glb: previewGlb,
        family: fields.family,
        name: fields.name,
        overwrite: fields.overwrite,
        emitLodChain: fields.emitLodChain,
        signal: saveAbort.signal,
        onProgress: (ev) =>
          checklist([
            { id: ev.phase, label: ev.message, state: ev.phase === 'error' ? 'err' : 'run' },
          ]),
      });
      showEditorToast(result.message || 'Saved', 'success');
    } catch (err) {
      if ((err as Error).name === 'AbortError' || (err as Error).message === 'Save cancelled') {
        showEditorToast('Save cancelled', 'info');
        return;
      }
      showEditorToast((err as Error).message, 'error');
    }
  };

  shell.documentBar.querySelector('#opt-doc-open')?.addEventListener('click', () => {
    shell.sidebar.querySelector<HTMLInputElement>('#opt-file')?.click();
  });
  shell.documentBar.querySelector('#opt-doc-save')?.addEventListener('click', () => {
    void saveProject();
  });
  shell.documentBar.querySelector('#opt-doc-download')?.addEventListener('click', () => {
    if (!previewGlb) {
      showEditorToast('Run Optimize (not just preview) so the GLB can be reloaded first', 'error');
      return;
    }
    downloadGlb(previewGlb, `${sidebar.settings().name || 'optimized'}.glb`);
  });

  const onResize = () => {
    const rect = shell.viewport.getBoundingClientRect();
    studio.renderer.setSize(rect.width, rect.height, false);
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(shell.viewport);
  onResize();

  const detachSplit = attachSplitDrag(
    shell.splitHandle,
    shell.viewport,
    () => split,
    (v) => {
      split = Math.min(0.9, Math.max(0.1, v));
      shell.splitHandle.style.left = `${split * 100}%`;
    },
  );
  shell.splitHandle.style.left = '50%';

  renderLoop = () => {
    studio.controls.update();
    const rect = shell.viewport.getBoundingClientRect();
    renderSplitViews(studio, split, rect.width, rect.height);
  };
  studio.renderer.setAnimationLoop(renderLoop);

  try {
    const [caps, entries] = await Promise.all([fetchCapabilities(), fetchLibrary()]);
    sidebar.setLibrary(entries);
    const enc = caps.canEncode ? `${caps.encoder}` : 'missing toktx';
    sidebar.setCaps(
      `Save tools: ${enc}; glTF-Transform ${caps.gltfTransform ? 'ok' : 'missing'}; validator ${caps.validator ? 'ok' : 'no'}`,
    );
    if (!caps.canEncode) {
      showEditorToast(
        'toktx is not on PATH (required for KTX2 project save). ktx is used for validation only.',
        'error',
      );
    }
  } catch {
    sidebar.setCaps('DEV API unavailable — start Vite (`npm run dev`) to save into the project.');
  }

  applyStudioFlags();

  return {
    dispose() {
      generation += 1;
      if (debounce) clearTimeout(debounce);
      client.dispose();
      sidebar.dispose();
      detachSplit();
      ro.disconnect();
      studio.renderer.setAnimationLoop(null);
      studio.dispose();
      imported?.dispose();
      setEditorToastParent(null);
    },
  };
}
