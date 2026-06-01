// src/editor/EditorAssetThumbnails.ts — offscreen WebGPU previews for sidebar assets
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
import { cloneFromRegistry } from '../assets/AssetLoader';
import type { AssetRegistry } from '../assets/assetManifest';

const THUMB_SIZE = 96;
const cache = new Map<string, string>();

let renderer: WebGPURenderer | null = null;
let initPromise: Promise<void> | null = null;

const scene = new Scene();
const camera = new PerspectiveCamera(35, 1, 0.1, 200);
const ambient = new AmbientLight(0xffffff, 0.55);
const sun = new DirectionalLight(0xfff4e8, 1.1);
const _box = new Box3();
const _center = new Vector3();
const _size = new Vector3();

async function ensureRenderer(): Promise<WebGPURenderer> {
  if (renderer) return renderer;
  if (!initPromise) {
    initPromise = (async () => {
      const r = new WebGPURenderer({ antialias: true, alpha: false });
      r.setSize(THUMB_SIZE, THUMB_SIZE, false);
      r.setClearColor(new Color(0x141a22), 1);
      await r.init();
      renderer = r;
      scene.add(ambient);
      sun.position.set(4, 8, 6);
      scene.add(sun);
    })();
  }
  await initPromise;
  return renderer!;
}

function fitCameraToObject(obj: Object3D): void {
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
}

export async function getAssetThumbnailDataUrl(
  assets: AssetRegistry,
  assetKey: string,
): Promise<string | null> {
  const cached = cache.get(assetKey);
  if (cached) return cached;

  let model: Object3D;
  try {
    model = cloneFromRegistry(assets, assetKey);
  } catch {
    return null;
  }

  const r = await ensureRenderer();
  while (scene.children.length > 2) {
    scene.remove(scene.children[2]);
  }
  scene.add(model);
  fitCameraToObject(model);

  r.render(scene, camera);
  const canvas = r.domElement;
  const url = canvas.toDataURL('image/png');
  cache.set(assetKey, url);
  return url;
}

export function disposeAssetThumbnails(): void {
  cache.clear();
  if (renderer) {
    renderer.dispose();
    renderer = null;
    initPromise = null;
  }
}
