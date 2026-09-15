// src/optimizer/OptimizerSession.ts — import, optimize, preview, export, save
import { Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createKtx2Loader } from '../assets/createKtx2Loader';
import { DRACO_DECODER_PATH } from '../assets/decoderPaths';
import { setEditorToastParent, showEditorToast } from '../editor/ui/editorToast';
import { buildPreservePreview, buildRebuildPreview, exportOptimizedGlb } from './io/exportGlb';
import { type ImportedAsset, importLocalFiles, importProjectGlb } from './io/importAsset';
import {
  availableLibraryLods,
  fetchCapabilities,
  fetchLibrary,
  type LibraryEntry,
  type LibraryLodLevel,
  libraryLodLabel,
} from './io/libraryClient';
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
import {
  mountOptimizerSidebar,
  type OptimizerViewMode,
  type SidebarApi,
} from './ui/optimizerSidebar';
import { createGeometryClient } from './workers/geometryClient';

export type OptimizerSession = {
  dispose: () => void;
};

const GEOMETRY_KEYS: ReadonlySet<keyof OptimizerSettings> = new Set([
  'topology',
  'targetTriangles',
  'textureSize',
  'remeshFlags',
  'alphaHoles',
  'interactivePreview',
]);

const DISPLAY_KEYS: ReadonlySet<keyof OptimizerSettings> = new Set(['lit', 'wireframe']);

function basenameStem(fileName: string): string {
  const base = fileName.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '');
  return base.replace(/_lod[012]$/i, '') || 'Asset';
}

export async function createOptimizerSession(host: HTMLElement): Promise<OptimizerSession> {
  const shell = createOptimizerShell(host);
  setEditorToastParent(host);

  const studio = await createStudioScene(shell.canvas);
  let settings: OptimizerSettings = { ...DEFAULT_OPTIMIZER_SETTINGS };
  let imported: ImportedAsset | null = null;
  let validation: StaticValidation | null = null;
  let optimizedRoot: Object3D | null = null;
  let previewGlb: ArrayBuffer | null = null;
  let libraryEntry: LibraryEntry | null = null;
  let libraryEntries: LibraryEntry[] = [];
  let viewMode: OptimizerViewMode = 'optimize';
  let leftLod: LibraryLodLevel = 0;
  let rightLod: LibraryLodLevel = 1;
  const lodCache = new Map<LibraryLodLevel, ImportedAsset>();
  let lodLoadGen = 0;
  let split = 0.5;
  let generation = 0;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let sidebar!: SidebarApi;
  let saveAbort: AbortController | null = null;
  let renderLoop: (() => void) | null = null;
  let jobBusy = false;

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
  ) => {
    const item = items[items.length - 1];
    if (!item) return;
    const phases: import('./ui/optimizerSidebar').OptimizerProgress['phases'] = [
      { id: 'import', label: 'Import', state: 'done' as const },
      {
        id: 'geometry',
        label: 'Geometry',
        state:
          item.id === 'simp' || item.id === 'remesh'
            ? item.state === 'err'
              ? 'error'
              : item.state === 'done'
                ? 'done'
                : 'active'
            : ('idle' as const),
      },
      {
        id: 'bake',
        label: 'Bake / texture',
        state:
          item.id === 'bake'
            ? item.state === 'err'
              ? 'error'
              : item.state === 'done'
                ? 'done'
                : 'active'
            : ('idle' as const),
        hidden: settings.topology !== 'rebuild',
      },
      {
        id: 'export',
        label: 'Export',
        state:
          item.id === 'export' || (item.id === 'bake' && item.state === 'done')
            ? item.state === 'err'
              ? 'error'
              : item.state === 'done'
                ? 'done'
                : 'active'
            : ('idle' as const),
      },
    ];
    sidebar.setProgress({
      status: item.state === 'err' ? item.label : item.label,
      percent: item.state === 'done' ? 100 : null,
      phases,
    });
  };

  const client = createGeometryClient((phase, message) => {
    showEditorToast(message, 'info', 1600);
    checklist([{ id: phase, label: message, state: 'run' }]);
  });

  const applyStudioFlags = () => {
    studio.setLit(settings.lit);
    studio.setWireframe(settings.wireframe);
  };

  const syncExportUi = () => {
    if (jobBusy) {
      sidebar.setExportReady(false);
      sidebar.setProgress({ status: 'Optimizing?', percent: null, phases: [] });
      return;
    }
    if (previewGlb) {
      sidebar.setExportReady(true);
      sidebar.setProgress({ status: 'Ready to save', percent: 100, phases: [] });
      return;
    }
    if (optimizedRoot) {
      sidebar.setExportReady(false);
      sidebar.setProgress({ status: 'Preview updated', percent: 100, phases: [] });
      return;
    }
    sidebar.setExportReady(false);
    sidebar.setProgress({
      status: imported ? 'Ready to preview' : 'Import an asset to begin',
      percent: imported ? 0 : null,
      phases: [],
    });
  };

  const setJobBusy = (busy: boolean) => {
    jobBusy = busy;
    syncExportUi();
  };

  const clearLodCache = () => {
    for (const asset of lodCache.values()) asset.dispose();
    lodCache.clear();
  };

  const lodHintFor = (entry: LibraryEntry | null): string => {
    if (!entry) {
      return 'Pick a project prop with *_lod1 / *_lod2 siblings to compare bands.';
    }
    if (entry.embeddedLod) {
      return `${entry.family}/${entry.name} uses embedded extractLod nodes — sibling LOD compare is unavailable.`;
    }
    const bands = availableLibraryLods(entry);
    if (bands.length < 2) {
      return `${entry.family}/${entry.name} is lod0 only. Save with “Emit lod0 + lod1 + lod2” to generate siblings.`;
    }
    return `${entry.family}/${entry.name} · ${libraryLodLabel(entry)}. Switch to LOD compare to inspect bands.`;
  };

  const syncLodPreviewUi = () => {
    const available = libraryEntry
      ? availableLibraryLods(libraryEntry)
      : ([0] as LibraryLodLevel[]);
    sidebar.setLodPreview({
      available,
      left: leftLod,
      right: rightLod,
      viewMode,
      hint: lodHintFor(libraryEntry),
    });
  };

  const updateLabels = () => {
    if (viewMode === 'lod') {
      const leftAsset = lodCache.get(leftLod);
      const rightAsset = lodCache.get(rightLod);
      const leftStats = leftAsset ? countGeometry(leftAsset.root) : null;
      const rightStats = rightAsset ? countGeometry(rightAsset.root) : null;
      shell.labelLeft.textContent = leftStats
        ? `lod${leftLod} · ${leftStats.triangles.toLocaleString()} tris`
        : `lod${leftLod}`;
      shell.labelRight.textContent =
        rightStats && leftStats
          ? `lod${rightLod} · ${rightStats.triangles.toLocaleString()} tris (${reductionPct(leftStats.triangles, rightStats.triangles)}%)`
          : `lod${rightLod}`;
      if (leftStats && rightStats) {
        sidebar.setStats(
          `LOD compare · lod${leftLod} ${leftStats.triangles.toLocaleString()} tris / ${formatBytes(leftAsset!.sourceBytes)} · lod${rightLod} ${rightStats.triangles.toLocaleString()} tris / ${formatBytes(rightAsset!.sourceBytes)}`,
        );
      }
      return;
    }
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

  const showOptimizeView = () => {
    viewMode = 'optimize';
    if (imported) studio.setOriginal(imported.root.clone(true));
    else studio.setOriginal(null);
    studio.setOptimized(optimizedRoot);
    applyStudioFlags();
    syncLodPreviewUi();
    updateLabels();
  };

  const ensureLodAsset = async (level: LibraryLodLevel): Promise<ImportedAsset> => {
    const cached = lodCache.get(level);
    if (cached) return cached;
    if (!libraryEntry) throw new Error('No library prop selected');
    const url = libraryEntry.lodUrls[level];
    if (!url) throw new Error(`lod${level} sibling missing for ${libraryEntry.name}`);
    if (level === 0 && imported) {
      lodCache.set(0, {
        root: imported.root,
        clips: imported.clips,
        sourceBytes: imported.sourceBytes,
        fileName: imported.fileName,
        dispose: () => {
          /* owned by `imported` */
        },
      });
      return lodCache.get(0)!;
    }
    const asset = await importProjectGlb(
      studio.renderer,
      url,
      `${libraryEntry.family}/${libraryEntry.name}_lod${level}`,
    );
    lodCache.set(level, asset);
    return asset;
  };

  const showLodView = async () => {
    if (!libraryEntry) {
      showEditorToast('Open a project prop first', 'error');
      return;
    }
    const available = availableLibraryLods(libraryEntry);
    if (available.length < 2) {
      showEditorToast('This prop has no sibling lod1/lod2 files yet', 'error');
      syncLodPreviewUi();
      return;
    }
    if (!available.includes(leftLod)) leftLod = available[0]!;
    if (!available.includes(rightLod)) {
      rightLod = available.find((l) => l !== leftLod) ?? available[0]!;
    }
    const gen = ++lodLoadGen;
    viewMode = 'lod';
    syncLodPreviewUi();
    try {
      const [leftAsset, rightAsset] = await Promise.all([
        ensureLodAsset(leftLod),
        ensureLodAsset(rightLod),
      ]);
      if (gen !== lodLoadGen) return;
      studio.setOriginal(leftAsset.root.clone(true));
      studio.setOptimized(rightAsset.root.clone(true));
      applyStudioFlags();
      updateLabels();
    } catch (err) {
      if (gen !== lodLoadGen) return;
      showEditorToast((err as Error).message, 'error');
      showOptimizeView();
    }
  };

  const setOptimized = (obj: Object3D | null) => {
    optimizedRoot = obj;
    if (viewMode === 'optimize') studio.setOptimized(obj);
    updateLabels();
    syncExportUi();
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
    if (viewMode !== 'optimize') showOptimizeView();
    if (debounce) {
      clearTimeout(debounce);
      debounce = null;
    }
    const gen = ++generation;
    const s = settings;
    if (!interactive) setJobBusy(true);
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
          previewGlb = null;
          setOptimized(preview);
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
        previewGlb = null;
        setOptimized(preview);
        checklist([{ id: 'simp', label: `Preview ${geom.stats.triangles} tris`, state: 'done' }]);
        for (const w of geom.warnings) showEditorToast(w, 'info', 5000);
        return;
      }
      checklist([{ id: 'export', label: 'Export + reload GLB', state: 'run' }]);
      const { glb, reloaded } = await withPausedPreview(async () => {
        const buffer = await exportOptimizedGlb(studio.renderer, preview);
        return { glb: buffer, reloaded: await reloadGlb(buffer) };
      });
      if (gen !== generation) return;
      previewGlb = glb;
      setOptimized(reloaded);
      for (const w of geom.warnings) showEditorToast(w, 'info', 5000);
      checklist([{ id: 'export', label: 'Simplify + reload OK', state: 'done' }]);
      showEditorToast('Preserve UVs complete', 'success');
    } catch (err) {
      if ((err as Error).message === 'cancelled') return;
      checklist([{ id: 'err', label: (err as Error).message, state: 'err' }]);
      showEditorToast((err as Error).message, 'error');
    } finally {
      if (!interactive && gen === generation) setJobBusy(false);
      else if (!interactive) syncExportUi();
    }
  };

  const schedulePreview = () => {
    if (!settings.interactivePreview || !imported || !validation?.ok || jobBusy) return;
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
    onSettings(next, changed) {
      const prev = settings;
      settings = next;
      const displayOnly = changed.length > 0 && changed.every((k) => DISPLAY_KEYS.has(k));
      if (changed.includes('lit') || changed.includes('wireframe') || displayOnly) {
        applyStudioFlags();
      }
      if (displayOnly) return;
      // emitLodChain / other non-geometry keys: no preview
      const geometryTouched =
        changed.length === 0 ||
        changed.some((k) => GEOMETRY_KEYS.has(k)) ||
        next.topology !== prev.topology;
      // alphaHoles only affects full bake — skip interactive re-run when that's the sole change
      const onlyAlphaHoles = changed.length === 1 && changed[0] === 'alphaHoles';
      if (onlyAlphaHoles) return;
      if (geometryTouched && (next.interactivePreview || next.topology !== prev.topology)) {
        schedulePreview();
      }
    },
    onOpenFiles: (files) => {
      void openFiles(files);
    },
    onPickLibrary: (entry) => {
      void openLibrary(entry);
    },
    onViewMode: (mode) => {
      if (mode === 'lod') void showLodView();
      else showOptimizeView();
    },
    onLodPane: (pane, level) => {
      if (viewMode !== 'lod') return;
      if (pane === 'left') leftLod = level;
      else rightLod = level;
      void showLodView();
    },
    onOptimize: () => {
      void runOptimize(false);
    },
    onCancel: () => {
      if (!jobBusy && !debounce) return;
      generation += 1;
      if (debounce) {
        clearTimeout(debounce);
        debounce = null;
      }
      client.cancel();
      saveAbort?.abort();
      setJobBusy(false);
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
    onFitCamera: () => studio.fit(),
    onHelp: () => {
      showEditorToast(
        'Preserve UVs = keep maps. Voxel remesh = new atlas (opaque only). Preview ≠ save — click Optimize. LOD compare needs sibling lod1/lod2. Project save needs toktx on PATH.',
        'info',
        8000,
      );
    },
  });
  syncLodPreviewUi();

  const openFiles = async (files: FileList | File[]) => {
    const list = [...files];
    if (list.length === 0) return;
    libraryEntry = null;
    sidebar.setSelectedLibrary(null);
    clearLodCache();
    leftLod = 0;
    rightLod = 0;
    viewMode = 'optimize';
    imported?.dispose();
    imported = await importLocalFiles(studio.renderer, list);
    const stem = basenameStem(list[0]!.name);
    sidebar.setSaveFields('optimized', stem);
    afterImport(stem, false);
  };

  const openLibrary = async (entry: LibraryEntry) => {
    libraryEntry = entry;
    sidebar.setSelectedLibrary(`${entry.family}/${entry.name}`);
    clearLodCache();
    const available = availableLibraryLods(entry);
    leftLod = 0;
    rightLod = available.find((l) => l !== 0) ?? 0;
    viewMode = 'optimize';
    imported?.dispose();
    imported = await importProjectGlb(studio.renderer, entry.url, `${entry.family}/${entry.name}`);
    sidebar.setSaveFields(entry.family, entry.name);
    afterImport(entry.name, entry.embeddedLod);
  };

  const afterImport = (name: string, embeddedLod: boolean) => {
    if (!imported) return;
    validation = validateStaticAsset(imported.root, imported.clips, {
      sourceBytes: imported.sourceBytes,
      embeddedLod,
    });
    sidebar.setIssues(validation.issues);
    const block = rebuildBlockReason(validation);
    sidebar.setRebuildGate(validation.rebuildAllowed, block);
    sidebar.setCanOptimize(validation.ok);
    studio.setOriginal(imported.root.clone(true));
    previewGlb = null;
    setOptimized(null);
    studio.fit();
    syncLodPreviewUi();
    updateLabels();
    if (!validation.ok)
      showEditorToast(
        validation.issues.find((i) => i.severity === 'block')?.message ?? 'Import blocked',
        'error',
      );
    else showEditorToast(`Loaded ${name} (${formatBytes(imported.sourceBytes)})`, 'success');
    schedulePreview();
  };

  const refreshLibrary = async () => {
    try {
      libraryEntries = await fetchLibrary();
      sidebar.setLibrary(libraryEntries);
      if (libraryEntry) {
        const match = libraryEntries.find(
          (e) => e.family === libraryEntry!.family && e.name === libraryEntry!.name,
        );
        if (match) {
          libraryEntry = match;
          sidebar.setSelectedLibrary(`${match.family}/${match.name}`);
          clearLodCache();
          const available = availableLibraryLods(match);
          if (!available.includes(leftLod)) leftLod = 0;
          if (!available.includes(rightLod)) {
            rightLod = available.find((l) => l !== leftLod) ?? 0;
          }
        }
      }
      syncLodPreviewUi();
    } catch {
      /* DEV API may be unavailable mid-session */
    }
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
    setJobBusy(true);
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
      await refreshLibrary();
      const saved = libraryEntries.find(
        (e) => e.family === fields.family && e.name === fields.name,
      );
      if (saved && availableLibraryLods(saved).length > 1) {
        libraryEntry = saved;
        sidebar.setSelectedLibrary(`${saved.family}/${saved.name}`);
        clearLodCache();
        leftLod = 0;
        rightLod = availableLibraryLods(saved).find((l) => l !== 0) ?? 1;
        syncLodPreviewUi();
        showEditorToast('LOD siblings ready — open LOD compare to inspect', 'info', 4000);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError' || (err as Error).message === 'Save cancelled') {
        showEditorToast('Save cancelled', 'info');
        return;
      }
      showEditorToast((err as Error).message, 'error');
    } finally {
      setJobBusy(false);
    }
  };

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
      shell.splitHandle.setAttribute('aria-valuenow', String(Math.round(split * 100)));
    },
  );
  shell.splitHandle.style.left = '50%';
  shell.splitHandle.setAttribute('aria-valuemin', '10');
  shell.splitHandle.setAttribute('aria-valuemax', '90');
  shell.splitHandle.setAttribute('aria-valuenow', '50');
  shell.splitHandle.tabIndex = 0;

  renderLoop = () => {
    studio.controls.update();
    const rect = shell.viewport.getBoundingClientRect();
    renderSplitViews(studio, split, rect.width, rect.height);
  };
  studio.renderer.setAnimationLoop(renderLoop);

  try {
    const [caps, entries] = await Promise.all([fetchCapabilities(), fetchLibrary()]);
    libraryEntries = entries;
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
      lodLoadGen += 1;
      if (debounce) clearTimeout(debounce);
      client.dispose();
      sidebar.dispose();
      detachSplit();
      ro.disconnect();
      studio.renderer.setAnimationLoop(null);
      clearLodCache();
      studio.dispose();
      imported?.dispose();
      setEditorToastParent(null);
    },
  };
}
