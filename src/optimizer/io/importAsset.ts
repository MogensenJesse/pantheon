// src/optimizer/io/importAsset.ts — dedicated raw optimizer loader (not play AssetLoader)
import { type BufferGeometry, Mesh, MeshStandardMaterial } from 'three';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { type GLTF, GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { Group, LoadingManager, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { createKtx2Loader } from '../../assets/createKtx2Loader';
import { DRACO_DECODER_PATH } from '../../assets/decoderPaths';
import { MAX_IMPORT_BYTES } from '../pipeline/limits';
import { unzipAssetArchive } from './zipImport';

export interface ImportedAsset {
  root: Object3D;
  clips: GLTF['animations'];
  sourceBytes: number;
  fileName: string;
  dispose: () => void;
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function createGltfLoader(renderer: WebGPURenderer, manager?: LoadingManager): GLTFLoader {
  const loader = new GLTFLoader(manager);
  const draco = new DRACOLoader(manager);
  draco.setDecoderPath(DRACO_DECODER_PATH);
  loader.setDRACOLoader(draco);
  loader.setKTX2Loader(createKtx2Loader(renderer));
  return loader;
}

function createSidecarResolver(files: File[]): {
  manager: LoadingManager;
  revoke: () => void;
} {
  const blobs: string[] = [];
  const byName = new Map<string, File>();
  const byPath = new Map<string, File>();
  for (const file of files) {
    const name = file.name.replace(/\\/g, '/');
    byName.set(name, file);
    byName.set(name.split('/').pop() ?? name, file);
    const rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    byPath.set(rel, file);
    byPath.set(rel.split('/').pop() ?? rel, file);
  }
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    const decoded = decodeURIComponent((url.split('?')[0] ?? url).replace(/\\/g, '/'));
    if (/^https?:\/\//i.test(decoded) || decoded.startsWith('//')) {
      throw new Error(`External URL blocked: ${decoded}`);
    }
    const cleaned = decoded.replace(/^(\.\/)+/, '');
    const file =
      byPath.get(cleaned) ??
      byName.get(cleaned) ??
      byPath.get(cleaned.split('/').pop() ?? '') ??
      byName.get(cleaned.split('/').pop() ?? '');
    if (!file) throw new Error(`Missing sidecar: ${decoded}`);
    const blob = URL.createObjectURL(file);
    blobs.push(blob);
    return blob;
  });
  return {
    manager,
    revoke: () => {
      for (const url of blobs) URL.revokeObjectURL(url);
    },
  };
}

async function loadGltfBuffer(
  renderer: WebGPURenderer,
  buffer: ArrayBuffer,
  path = '',
): Promise<GLTF> {
  const loader = createGltfLoader(renderer);
  return loader.parseAsync(buffer, path);
}

function wrapImported(
  name: string,
  root: Object3D,
  clips: GLTF['animations'],
  sourceBytes: number,
  dispose: () => void,
): ImportedAsset {
  const wrapped = new Group();
  wrapped.name = name;
  wrapped.add(root);
  return { root: wrapped, clips, sourceBytes, fileName: name, dispose };
}

export async function importLocalFile(
  renderer: WebGPURenderer,
  file: File,
): Promise<ImportedAsset> {
  return importLocalFiles(renderer, [file]);
}

export async function importLocalFiles(
  renderer: WebGPURenderer,
  files: File[],
): Promise<ImportedAsset> {
  if (files.length === 0) throw new Error('No files selected');
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_IMPORT_BYTES) {
    throw new Error(`Selection is larger than ${Math.round(MAX_IMPORT_BYTES / (1024 * 1024))} MB`);
  }

  const zip = files.find((file) => extOf(file.name) === '.zip');
  if (zip) return importZip(renderer, zip);

  const glb = files.find((file) => extOf(file.name) === '.glb');
  if (glb) {
    const buffer = await glb.arrayBuffer();
    const gltf = await loadGltfBuffer(renderer, buffer, '');
    return wrapImported(glb.name, gltf.scene, gltf.animations ?? [], buffer.byteLength, () => {});
  }

  const gltfFile = files.find((file) => extOf(file.name) === '.gltf');
  if (gltfFile) {
    const sidecar = createSidecarResolver(files);
    try {
      const text = await gltfFile.text();
      const loader = createGltfLoader(renderer, sidecar.manager);
      const gltf = await loader.parseAsync(text, '');
      return wrapImported(gltfFile.name, gltf.scene, gltf.animations ?? [], total, sidecar.revoke);
    } catch (err) {
      sidecar.revoke();
      throw err;
    }
  }

  const obj = files.find((file) => extOf(file.name) === '.obj');
  if (obj) {
    const sidecar = createSidecarResolver(files);
    try {
      const text = await obj.text();
      const objLoader = new OBJLoader(sidecar.manager);
      const mtlFile = files.find((file) => extOf(file.name) === '.mtl');
      if (mtlFile) {
        const mtl = new MTLLoader(sidecar.manager);
        const materials = mtl.parse(await mtlFile.text(), '');
        materials.preload();
        objLoader.setMaterials(materials);
      }
      const root = objLoader.parse(text);
      return wrapImported(obj.name, root, [], total, sidecar.revoke);
    } catch (err) {
      sidecar.revoke();
      throw err;
    }
  }

  const file = files[0];
  const name = file.name || 'asset';
  const ext = extOf(name);
  const buffer = await file.arrayBuffer();
  if (ext === '.fbx') {
    return wrapImported(name, new FBXLoader().parse(buffer, ''), [], buffer.byteLength, () => {});
  }
  if (ext === '.ply') {
    const geo = new PLYLoader().parse(buffer) as BufferGeometry;
    geo.computeVertexNormals();
    return wrapImported(
      name,
      new Mesh(geo, new MeshStandardMaterial({ color: 0xcccccc })),
      [],
      buffer.byteLength,
      () => {},
    );
  }
  throw new Error(`Unsupported file type: ${ext || name}. Use GLB, glTF, ZIP, OBJ, FBX, or PLY.`);
}

async function importZip(renderer: WebGPURenderer, file: File): Promise<ImportedAsset> {
  const buffer = await file.arrayBuffer();
  const zip = unzipAssetArchive(buffer);
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    const path = url.split('?')[0] ?? url;
    try {
      const parsed = new URL(path, 'https://optimizer.local/');
      return zip.urlFor(parsed.pathname.replace(/^\//, ''));
    } catch {
      return zip.urlFor(path);
    }
  });
  const loader = createGltfLoader(renderer, manager);
  try {
    if (zip.rootGlb) {
      const data = zip.files.get(zip.rootGlb)!;
      const copy = new ArrayBuffer(data.byteLength);
      new Uint8Array(copy).set(data);
      const gltf = await loader.parseAsync(copy, '');
      return wrapImported(
        file.name,
        gltf.scene,
        gltf.animations ?? [],
        buffer.byteLength,
        zip.revoke,
      );
    }
    const data = zip.files.get(zip.rootGltf!)!;
    const text = new TextDecoder().decode(data);
    const gltf = await loader.parseAsync(text, '');
    return wrapImported(
      file.name,
      gltf.scene,
      gltf.animations ?? [],
      buffer.byteLength,
      zip.revoke,
    );
  } catch (err) {
    zip.revoke();
    throw err;
  }
}

export async function importProjectGlb(
  renderer: WebGPURenderer,
  url: string,
  fileName: string,
): Promise<ImportedAsset> {
  const cacheBusted = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
  const res = await fetch(cacheBusted, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    throw new Error(`File is larger than ${Math.round(MAX_IMPORT_BYTES / (1024 * 1024))} MB`);
  }
  const gltf = await loadGltfBuffer(renderer, buffer, url.replace(/[^/]+$/, ''));
  return wrapImported(fileName, gltf.scene, gltf.animations ?? [], buffer.byteLength, () => {});
}
