// src/optimizer/io/exportGlb.ts — binary GLB from ordinary textures (never RenderTargets)
import {
  type BufferGeometry,
  ClampToEdgeWrapping,
  Group,
  LinearFilter,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Scene,
  type Texture,
  Vector2,
} from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as WebGPUTextureUtils from 'three/addons/utils/WebGPUTextureUtils.js';
import type { WebGPURenderer } from 'three/webgpu';
import { withDirectOffscreen } from '../pipeline/directOffscreen';
import { primitiveToGeometry } from '../pipeline/prepareStaticSource';
import type { PrimitivePayload } from '../pipeline/types';

async function decompressKeepingViewport(
  texture: Texture,
  maxTextureSize: number,
  renderer: WebGPURenderer,
): Promise<Texture> {
  const size = new Vector2();
  renderer.getSize(size);
  const pixelRatio = renderer.getPixelRatio();
  const outputColorSpace = renderer.outputColorSpace;
  try {
    return await withDirectOffscreen(renderer, () =>
      WebGPUTextureUtils.decompress(texture, maxTextureSize, renderer),
    );
  } finally {
    renderer.outputColorSpace = outputColorSpace;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size.x, size.y, false);
    const canvas = renderer.domElement;
    if (canvas instanceof HTMLCanvasElement) {
      canvas.style.width = '';
      canvas.style.height = '';
    }
  }
}

export async function exportOptimizedGlb(
  renderer: WebGPURenderer,
  root: Object3D,
): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter();
  exporter.setTextureUtils({
    decompress: async (texture: Texture, maxTextureSize?: number) =>
      decompressKeepingViewport(texture, maxTextureSize ?? Infinity, renderer),
  });
  const result = await exporter.parseAsync(wrapForExport(root), {
    binary: true,
    maxTextureSize: 2048,
  });
  if (result instanceof ArrayBuffer) return result;
  throw new Error('GLTFExporter did not return a binary GLB');
}

export function buildPreservePreview(primitives: PrimitivePayload[], sourceRoot: Object3D): Group {
  const group = new Group();
  group.name = 'optimized';
  const sourceMats: MeshStandardMaterial[] = [];
  sourceRoot.traverse((obj) => {
    const mesh = obj as Object3D & {
      isMesh?: boolean;
      material?: MeshStandardMaterial | MeshStandardMaterial[];
    };
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      if (mat) sourceMats.push(mat);
    }
  });
  primitives.forEach((prim, i) => {
    const geo = primitiveToGeometry(prim);
    const src =
      sourceMats.find((mat) => mat.name === prim.materialName) ??
      sourceMats[Math.min(i, sourceMats.length - 1)];
    const mat = src?.clone() ?? new MeshStandardMaterial({ color: 0xcccccc });
    mat.name = prim.materialName;
    mat.vertexColors = Boolean(prim.colors);
    mat.wireframe = false;
    const mesh = new Mesh(geo, mat);
    mesh.name = prim.materialName;
    group.add(mesh);
  });
  return group;
}

export function buildRebuildPreview(
  geometry: BufferGeometry,
  maps: { colorMap: Texture; normalMap: Texture; ormMap: Texture },
  materialName: string,
): Group {
  const group = new Group();
  group.name = 'optimized';
  const colorMap = maps.colorMap;
  const normalMap = maps.normalMap;
  const aoMap = maps.ormMap.clone();
  const roughnessMap = maps.ormMap.clone();
  const metalnessMap = maps.ormMap.clone();
  aoMap.channel = 0;
  roughnessMap.channel = 1;
  metalnessMap.channel = 2;
  for (const map of [colorMap, normalMap, aoMap, roughnessMap, metalnessMap]) {
    map.generateMipmaps = false;
    map.minFilter = LinearFilter;
    map.magFilter = LinearFilter;
    map.wrapS = map.wrapT = ClampToEdgeWrapping;
  }
  const mat = new MeshStandardMaterial({
    name: materialName || 'Atlas',
    map: colorMap,
    normalMap,
    roughnessMap,
    metalnessMap,
    aoMap,
    metalness: 1,
    roughness: 1,
    vertexColors: Boolean(geometry.getAttribute('color')),
    wireframe: false,
  });
  const mesh = new Mesh(geometry, mat);
  mesh.name = materialName || 'Atlas';
  group.add(mesh);
  return group;
}

export function wrapForExport(root: Object3D): Scene {
  const scene = new Scene();
  scene.add(root);
  return scene;
}
