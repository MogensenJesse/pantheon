// src/editor/ui/EditorAssetThumbnails.ts — offscreen WebGPU previews for sidebar assets
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  type Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { cloneFromRegistry } from '../../assets/AssetLoader';
import type { AssetRegistry } from '../../assets/assetManifest';
import { EDITOR_PROP_PREVIEW_LOD } from '../place/editorPropPreviewLod';

const THUMB_SIZE = 96;

export interface EditorAssetThumbnailService {
  getDataUrl: (assets: AssetRegistry, assetKey: string) => Promise<string | null>;
  dispose: () => void;
}

export function createEditorAssetThumbnailService(): EditorAssetThumbnailService {
  const cache = new Map<string, string>();
  const inflight = new Map<string, Promise<string | null>>();

  let renderer: WebGPURenderer | null = null;
  let initPromise: Promise<void> | null = null;
  let queueTail: Promise<unknown> = Promise.resolve();
  let generation = 0;

  const scene = new Scene();
  const camera = new PerspectiveCamera(35, 1, 0.1, 200);
  const ambient = new AmbientLight(0xffffff, 0.55);
  const sun = new DirectionalLight(0xfff4e8, 1.1);
  const _box = new Box3();
  const _center = new Vector3();
  const _size = new Vector3();

  scene.add(ambient);
  sun.position.set(4, 8, 6);
  scene.add(sun);

  const isStale = (gen: number): boolean => gen !== generation;

  const enqueueThumbnailRender = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queueTail.then(fn, fn);
    queueTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const whenIdle = (): Promise<void> =>
    new Promise((resolve) => {
      const ric = (
        window as Window & {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback;
      if (typeof ric === 'function') {
        ric(() => resolve(), { timeout: 200 });
        return;
      }
      requestAnimationFrame(() => resolve());
    });

  const ensureRenderer = async (gen: number): Promise<WebGPURenderer | null> => {
    if (isStale(gen)) return null;
    if (renderer) return renderer;
    if (!initPromise) {
      initPromise = (async () => {
        if (isStale(gen)) return;
        const r = new WebGPURenderer({ antialias: true, alpha: false });
        r.setSize(THUMB_SIZE, THUMB_SIZE, false);
        r.setClearColor(new Color(0x141a22), 1);
        await r.init();
        if (isStale(gen)) {
          r.dispose();
          return;
        }
        renderer = r;
      })();
    }
    await initPromise;
    if (isStale(gen)) return null;
    return renderer;
  };

  const fitCameraToObject = (obj: Object3D): void => {
    _box.setFromObject(obj);
    if (_box.isEmpty()) {
      camera.position.set(2, 2, 2);
      camera.lookAt(0, 0, 0);
      return;
    }
    _box.getCenter(_center);
    _box.getSize(_size);
    const maxDim = Math.max(_size.x, _size.y, _size.z, 0.01);
    const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360)) + maxDim * 0.15;
    camera.position.set(_center.x + dist * 0.85, _center.y + dist * 0.55, _center.z + dist * 0.85);
    camera.lookAt(_center);
    camera.updateProjectionMatrix();
  };

  const cloneThumbModel = (assets: AssetRegistry, assetKey: string): Object3D | null => {
    try {
      return cloneFromRegistry(assets, assetKey, EDITOR_PROP_PREVIEW_LOD);
    } catch {
      try {
        return cloneFromRegistry(assets, assetKey, 0);
      } catch {
        return null;
      }
    }
  };

  const renderThumbnailDataUrl = async (
    assets: AssetRegistry,
    assetKey: string,
    gen: number,
  ): Promise<string | null> => {
    if (isStale(gen)) return null;

    const cached = cache.get(assetKey);
    if (cached) return cached;

    await whenIdle();
    if (isStale(gen)) return null;

    const model = cloneThumbModel(assets, assetKey);
    if (!model) return null;

    const r = await ensureRenderer(gen);
    if (!r || isStale(gen)) return null;

    while (scene.children.length > 2) {
      scene.remove(scene.children[2]);
    }
    scene.add(model);
    fitCameraToObject(model);

    r.render(scene, camera);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(model);

    if (isStale(gen)) return null;

    cache.set(assetKey, url);
    return url;
  };

  return {
    getDataUrl(assets, assetKey) {
      const gen = generation;
      if (isStale(gen)) return Promise.resolve(null);

      const cached = cache.get(assetKey);
      if (cached) return Promise.resolve(cached);

      const pending = inflight.get(assetKey);
      if (pending) return pending;

      const promise = enqueueThumbnailRender(() => renderThumbnailDataUrl(assets, assetKey, gen));
      inflight.set(assetKey, promise);
      return promise.finally(() => {
        inflight.delete(assetKey);
      });
    },
    dispose() {
      generation++;
      cache.clear();
      inflight.clear();
      queueTail = Promise.resolve();
      if (renderer) {
        renderer.dispose();
        renderer = null;
        initPromise = null;
      }
    },
  };
}

let activeThumbnails: EditorAssetThumbnailService = createEditorAssetThumbnailService();

export function bindActiveEditorAssetThumbnails(
  service: EditorAssetThumbnailService,
): () => void {
  activeThumbnails = service;
  return () => {
    activeThumbnails = createEditorAssetThumbnailService();
  };
}

export function getAssetThumbnailDataUrl(
  assets: AssetRegistry,
  assetKey: string,
): Promise<string | null> {
  return activeThumbnails.getDataUrl(assets, assetKey);
}

export function disposeAssetThumbnails(): void {
  activeThumbnails.dispose();
}
