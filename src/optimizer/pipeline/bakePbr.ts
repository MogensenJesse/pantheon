// @ts-nocheck — BVHComputeData TSL nodes are untyped in three-mesh-bvh@0.9.11
// src/optimizer/pipeline/bakePbr.ts — WebGPU high→low PBR transfer via BVHComputeData

import { MeshoptTangents } from 'meshoptimizer/tangents';
import {
  attribute,
  cross,
  Fn,
  float,
  If,
  int,
  normalize,
  struct,
  texture,
  uv,
  vec3,
  vec4,
} from 'three/tsl';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataArrayTexture,
  DoubleSide,
  LinearFilter,
  LinearSRGBColorSpace,
  type Material,
  Mesh,
  MeshBasicNodeMaterial,
  NoColorSpace,
  type Object3D,
  OrthographicCamera,
  RenderTarget,
  RepeatWrapping,
  RGBAFormat,
  Scene,
  SRGBColorSpace,
  type Texture,
  UnsignedByteType,
  Vector3,
  type WebGPURenderer,
} from 'three/webgpu';
import { getTriangleHitPointInfo, MeshBVH } from 'three-mesh-bvh';
import * as bvhWebgpu from 'three-mesh-bvh/webgpu';
import { createBvhGpuAdapter } from './bvhGpuAdapter';
import { bindOffscreenTarget, withDirectOffscreen } from './directOffscreen';
import { flattenPrimitives } from './flattenPrimitives';
import { dilateAndInfill } from './gutterInfill';
import { MAX_BAKE_MATERIALS } from './limits';
import { collectStaticPrimitives } from './prepareStaticSource';
import { readRgba8, rgbaToDataTexture } from './readbackRgba8';

type StructTypeLike = {
  name: string | null;
  membersLayout: Array<{ name: string; type: string }>;
};

const MAP_RES = 512;
const MAX_MATERIALS = MAX_BAKE_MATERIALS;
const rayStruct = (bvhWebgpu as unknown as Record<string, StructTypeLike>).rayStruct;
const rayIntersectionResultStruct = (bvhWebgpu as unknown as Record<string, StructTypeLike>)
  .rayIntersectionResultStruct;
const pointQueryResultStruct = (bvhWebgpu as unknown as Record<string, StructTypeLike>)
  .pointQueryResultStruct;

export interface BakePbrResult {
  colorMap: Texture;
  normalMap: Texture;
  ormMap: Texture;
  geometry: BufferGeometry;
}

export interface BakePbrOptions {
  renderer: WebGPURenderer;
  sourceRoot: Object3D;
  lowGeometry: BufferGeometry;
  textureSize: number;
  alphaHoles: boolean;
  gutterPx?: number;
  onProgress?: (phase: string, message: string) => void;
}

// BVHComputeData TSL nodes are untyped in three-mesh-bvh@0.9.11; keep the graph in one adapter.
function tslNode(value: unknown): NodeLike {
  return value as NodeLike;
}

type NodeLike = {
  [key: string]: NodeLike;
} & ((...args: unknown[]) => NodeLike);

function instantiateStruct(typeNode: StructTypeLike, values?: Record<string, unknown>): NodeLike {
  const layout: Record<string, string> = {};
  for (const member of typeNode.membersLayout) layout[member.name] = member.type;
  const factory = struct(layout, typeNode.name ?? undefined) as unknown as (
    v?: Record<string, unknown>,
  ) => NodeLike;
  return values ? factory(values) : factory();
}

function isMesh(obj: Object3D): obj is Object3D & { material: Material | Material[] } {
  return (obj as { isMesh?: boolean }).isMesh === true;
}

function collectMaterials(root: Object3D): Material[] {
  const mats: Material[] = [];
  root.traverse((obj) => {
    if (!isMesh(obj)) return;
    const list = Array.isArray(obj.material) ? obj.material : [obj.material];
    const geo = (obj as Object3D & { geometry?: BufferGeometry }).geometry;
    const groups = geo?.groups?.length ? geo.groups : [{ materialIndex: 0 }];
    for (const g of groups) {
      mats.push(list[g.materialIndex ?? 0] ?? list[0]);
    }
  });
  return mats;
}

async function blitToRgba(
  renderer: WebGPURenderer,
  src: Texture,
  size: number,
  srgb: boolean,
): Promise<Uint8Array> {
  const target = new RenderTarget(size, size, {
    format: RGBAFormat,
    type: UnsignedByteType,
    colorSpace: srgb ? SRGBColorSpace : NoColorSpace,
    depthBuffer: false,
  });
  const mat = new MeshBasicNodeMaterial();
  mat.colorNode = texture(src, uv());
  mat.vertexNode = vec4(attribute('position'), 1);
  const quadGeo = new BufferGeometry();
  quadGeo.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  );
  quadGeo.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const quad = new Mesh(quadGeo, mat);
  quad.frustumCulled = false;
  const scene = new Scene();
  scene.add(quad);
  const cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const unbind = bindOffscreenTarget(renderer, target);
  try {
    renderer.render(scene, cam);
  } finally {
    unbind();
  }
  const data = await readRgba8(renderer, target, size, size);
  target.dispose();
  mat.dispose();
  quadGeo.dispose();
  return data;
}

async function packMaterialArrays(
  renderer: WebGPURenderer,
  materials: Material[],
): Promise<{
  albedo: DataArrayTexture;
  normal: DataArrayTexture;
  orm: DataArrayTexture;
  count: number;
}> {
  const count = Math.min(MAX_MATERIALS, Math.max(1, materials.length));
  const albedoData = new Uint8Array(MAP_RES * MAP_RES * 4 * count);
  const normalData = new Uint8Array(MAP_RES * MAP_RES * 4 * count);
  const ormData = new Uint8Array(MAP_RES * MAP_RES * 4 * count);
  const layerBytes = MAP_RES * MAP_RES * 4;

  for (let i = 0; i < count; i++) {
    const mat = (materials[i] ?? materials[0]) as Material & {
      color?: Color;
      map?: Texture | null;
      normalMap?: Texture | null;
      roughnessMap?: Texture | null;
      metalnessMap?: Texture | null;
      aoMap?: Texture | null;
      roughness?: number;
      metalness?: number;
    };
    if (mat.map) {
      albedoData.set(await blitToRgba(renderer, mat.map, MAP_RES, true), i * layerBytes);
    } else {
      const r = Math.round((mat.color?.r ?? 1) * 255);
      const g = Math.round((mat.color?.g ?? 1) * 255);
      const b = Math.round((mat.color?.b ?? 1) * 255);
      for (let p = 0; p < layerBytes; p += 4) {
        const o = i * layerBytes + p;
        albedoData[o] = r;
        albedoData[o + 1] = g;
        albedoData[o + 2] = b;
        albedoData[o + 3] = 255;
      }
    }
    if (mat.normalMap) {
      normalData.set(await blitToRgba(renderer, mat.normalMap, MAP_RES, false), i * layerBytes);
    } else {
      for (let p = 0; p < layerBytes; p += 4) {
        const o = i * layerBytes + p;
        normalData[o] = 128;
        normalData[o + 1] = 128;
        normalData[o + 2] = 255;
        normalData[o + 3] = 255;
      }
    }
    const ao = mat.aoMap ? await blitToRgba(renderer, mat.aoMap, MAP_RES, false) : null;
    const rough = mat.roughnessMap
      ? await blitToRgba(renderer, mat.roughnessMap, MAP_RES, false)
      : null;
    const metal = mat.metalnessMap
      ? await blitToRgba(renderer, mat.metalnessMap, MAP_RES, false)
      : null;
    const r0 = Math.round((mat.roughness ?? 1) * 255);
    const m0 = Math.round((mat.metalness ?? 0) * 255);
    for (let p = 0; p < MAP_RES * MAP_RES; p++) {
      const o = i * layerBytes + p * 4;
      const s = p * 4;
      ormData[o] = ao ? ao[s] : 255;
      ormData[o + 1] = rough ? rough[s + 1] : r0;
      ormData[o + 2] = metal ? metal[s + 2] : m0;
      ormData[o + 3] = 255;
    }
  }

  const makeArray = (data: Uint8Array, srgb: boolean, name: string) => {
    const tex = new DataArrayTexture(data, MAP_RES, MAP_RES, count);
    tex.format = RGBAFormat;
    tex.type = UnsignedByteType;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace;
    tex.needsUpdate = true;
    tex.name = name;
    return tex;
  };

  return {
    albedo: makeArray(albedoData, true, 'optimizer-albedo-array'),
    normal: makeArray(normalData, false, 'optimizer-normal-array'),
    orm: makeArray(ormData, false, 'optimizer-orm-array'),
    count,
  };
}

function defaultTangents(vertexCount: number): Float32Array {
  const tangents = new Float32Array(vertexCount * 4);
  for (let i = 0; i < vertexCount; i++) {
    tangents[i * 4] = 1;
    tangents[i * 4 + 3] = 1;
  }
  return tangents;
}

function buildHighBakeMesh(sourceRoot: Object3D): Mesh {
  const primitives = collectStaticPrimitives(sourceRoot);
  const flat = flattenPrimitives(primitives);
  const geo = new BufferGeometry();
  const n = flat.positions.length / 3;
  geo.setAttribute('position', new BufferAttribute(flat.positions, 3));
  geo.setAttribute('uv', new BufferAttribute(flat.uvs ?? new Float32Array(n * 2), 2));
  geo.setAttribute('normal', new BufferAttribute(flat.normals ?? new Float32Array(n * 3), 3));
  geo.setAttribute('color', new BufferAttribute(flat.colors ?? new Float32Array(n * 4).fill(1), 4));
  geo.setAttribute('materialId', new BufferAttribute(flat.materialId, 1));
  let tangents: Float32Array;
  try {
    tangents = MeshoptTangents.generateTangents(
      flat.indices,
      flat.positions,
      3,
      flat.normals ?? new Float32Array(n * 3),
      3,
      flat.uvs ?? new Float32Array(n * 2),
      2,
      ['Compatible'],
    );
  } catch {
    tangents = defaultTangents(n);
  }
  geo.setAttribute('tangent', new BufferAttribute(tangents, 4));
  geo.setIndex(new BufferAttribute(flat.indices, 1));
  geo.computeBoundingBox();
  const mesh = new Mesh(geo);
  mesh.frustumCulled = false;
  mesh.updateMatrixWorld(true);
  return mesh;
}

function cageDistance(geo: BufferGeometry): number {
  geo.computeBoundingBox();
  const size = new Vector3();
  geo.boundingBox!.getSize(size);
  return Math.max(size.length() * 0.015, 1e-4);
}

export async function bakePbrMaps(opts: BakePbrOptions): Promise<BakePbrResult> {
  return withDirectOffscreen(opts.renderer, () => bakePbrMapsDirect(opts));
}

async function bakePbrMapsDirect(opts: BakePbrOptions): Promise<BakePbrResult> {
  const { renderer, sourceRoot, lowGeometry, textureSize, alphaHoles, onProgress } = opts;
  const gutterPx = opts.gutterPx ?? 2;
  await MeshoptTangents.ready;
  onProgress?.('bake', 'Packing source materials (WebGPU decompress)…');
  const materials = collectMaterials(sourceRoot);
  if (materials.length === 0) throw new Error('Rebuild bake: no source materials');
  if (materials.length > MAX_MATERIALS) {
    throw new Error(
      `Rebuild bake: ${materials.length} materials exceeds the ${MAX_MATERIALS} array-layer budget`,
    );
  }
  const packed = await packMaterialArrays(renderer, materials);

  onProgress?.('bake', 'Building GPU BVH (BVHComputeData)…');
  const highMesh = buildHighBakeMesh(sourceRoot);
  const adapter = createBvhGpuAdapter(highMesh);
  adapter.update();
  adapter.assertBudget();
  type BvhQueryFns = {
    raycastFirstHit: (ray: NodeLike, hit: NodeLike) => unknown;
    sampleTrianglePoint: (bary: unknown, indices: unknown) => NodeLike;
    closestPointToPoint: (point: NodeLike, result: NodeLike) => unknown;
  };
  const bvhFns = adapter.data.fns as unknown as BvhQueryFns;
  if (!bvhFns.raycastFirstHit || !bvhFns.sampleTrianglePoint || !bvhFns.closestPointToPoint) {
    throw new Error(
      'BVHComputeData TSL query functions are unavailable (need three-mesh-bvh@0.9.11).',
    );
  }

  const cage = cageDistance(lowGeometry);
  const maxDistSq = cage * cage * 16;
  const bakeGeometry = lowGeometry.clone();
  const lowMesh = new Mesh(bakeGeometry);
  lowMesh.frustumCulled = false;
  const hasTangent = Boolean(lowGeometry.getAttribute('tangent'));

  const makeChannelMaterial = (mode: 'color' | 'normal' | 'orm'): MeshBasicNodeMaterial => {
    const mat = new MeshBasicNodeMaterial();
    mat.side = DoubleSide;
    mat.depthTest = false;
    mat.depthWrite = false;
    mat.fog = false;
    // Clip-space UV unwrap (vertexNode), not positionNode — MVP would re-project the 3D mesh.
    mat.vertexNode = Fn(() => {
      const t = uv();
      return vec4(t.x.mul(2).sub(1), t.y.mul(2).sub(1), float(0), float(1));
    })() as never;
    mat.colorNode = Fn(() => {
      const wp = tslNode(attribute('position')).xyz;
      const n = tslNode(normalize(tslNode(attribute('normal')).xyz));
      const t4 = hasTangent ? tslNode(attribute('tangent')) : tslNode(vec4(1, 0, 0, 1));
      const lowT = tslNode(normalize(t4.xyz));
      const lowB = tslNode(cross(n, lowT)).mul(t4.w);
      const out = tslNode(vec4(0, 0, 0, 0)).toVar();
      const hit = instantiateStruct(rayIntersectionResultStruct).toVar();
      const nearest = instantiateStruct(pointQueryResultStruct).toVar();
      const rayDown = instantiateStruct(rayStruct, {
        origin: wp.add(n.mul(cage)),
        direction: n.negate(),
      });
      const rayUp = instantiateStruct(rayStruct, {
        origin: wp.sub(n.mul(cage)),
        direction: n,
      });

      const writeHit = (bary: unknown, indices: unknown) => {
        const sampled = bvhFns.sampleTrianglePoint(bary, indices);
        const srcUv = sampled.uv.xy;
        const matId = int(sampled.materialId.x);
        const albedo = tslNode(texture(packed.albedo, srcUv).depth(matId));
        const nrmTex = tslNode(texture(packed.normal, srcUv).depth(matId));
        const orm = tslNode(texture(packed.orm, srcUv).depth(matId));
        const srcNts = nrmTex.xyz.mul(2).sub(1);
        const srcNgeo = tslNode(normalize(sampled.normal.xyz));
        const srcT = tslNode(normalize(sampled.tangent.xyz));
        const srcB = tslNode(cross(srcNgeo, srcT)).mul(sampled.tangent.w);
        const worldN = tslNode(
          normalize(srcT.mul(srcNts.x).add(srcB.mul(srcNts.y)).add(srcNgeo.mul(srcNts.z))),
        );
        const ts = vec3(lowT.dot(worldN), lowB.dot(worldN), n.dot(worldN));
        const tsN = tslNode(normalize(ts)).mul(0.5).add(0.5);
        if (mode === 'color') out.assign(vec4(albedo.rgb, albedo.a));
        else if (mode === 'normal') out.assign(vec4(tsN, float(1)));
        else out.assign(vec4(orm.r, orm.g, orm.b, float(1)));
      };

      If(bvhFns.raycastFirstHit(rayDown, hit) as never, () => {
        writeHit(hit.barycoord, hit.indices.xyz);
      }).Else(() => {
        If(bvhFns.raycastFirstHit(rayUp, hit) as never, () => {
          writeHit(hit.barycoord, hit.indices.xyz);
        }).Else(() => {
          If(bvhFns.closestPointToPoint(wp, nearest) as never, () => {
            If(nearest.distanceSq.lessThan(maxDistSq) as never, () => {
              writeHit(nearest.barycoord, nearest.faceIndices.xyz);
            });
          });
        });
      });
      return out as never;
    })() as never;
    return mat;
  };

  const scene = new Scene();
  scene.add(lowMesh);
  const cam = new OrthographicCamera(-1, 1, 1, -1, -1, 1);
  const size = textureSize;
  const target = new RenderTarget(size, size, {
    format: RGBAFormat,
    type: UnsignedByteType,
    depthBuffer: false,
  });

  const prevClear = new Color();
  renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();

  const renderChannel = async (mode: 'color' | 'normal' | 'orm', srgb: boolean) => {
    onProgress?.('bake', `Rasterizing ${mode} (UV space + BVH cage rays)…`);
    const mat = makeChannelMaterial(mode);
    lowMesh.material = mat;
    target.texture.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    const unbind = bindOffscreenTarget(renderer, target);
    try {
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, cam);
    } finally {
      unbind();
    }
    const data = await readRgba8(renderer, target, size, size);
    mat.dispose();
    return data;
  };

  try {
    const color = await renderChannel('color', true);
    const normal = await renderChannel('normal', false);
    const orm = await renderChannel('orm', false);
    const coverage = new Uint8Array(size * size);
    for (let i = 0; i < coverage.length; i++) coverage[i] = color[i * 4 + 3] > 8 ? 1 : 0;
    dilateAndInfill({ color, normal, orm, coverage }, size, size, gutterPx, alphaHoles);
    if (!alphaHoles) {
      for (let i = 0; i < coverage.length; i++) {
        if (coverage[i]) color[i * 4 + 3] = 255;
      }
    }
    return {
      colorMap: rgbaToDataTexture(color, size, size, { srgb: true, name: 'optimizer-color' }),
      normalMap: rgbaToDataTexture(normal, size, size, { name: 'optimizer-normal' }),
      ormMap: rgbaToDataTexture(orm, size, size, { name: 'optimizer-orm' }),
      geometry: lowGeometry,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`WebGPU PBR bake failed (BVHComputeData / TSL). Feasibility gate: ${message}`);
  } finally {
    renderer.setClearColor(prevClear, prevAlpha);
    adapter.dispose();
    highMesh.geometry.dispose();
    bakeGeometry.dispose();
    packed.albedo.dispose();
    packed.normal.dispose();
    packed.orm.dispose();
    target.dispose();
  }
}

/** Transfer source COLOR_0 onto low-mesh vertices (play samples this attribute). */
export function transferVertexColor(sourceRoot: Object3D, lowGeometry: BufferGeometry): void {
  const primitives = collectStaticPrimitives(sourceRoot);
  const flat = flattenPrimitives(primitives);
  if (!flat.colors) return;
  const high = new BufferGeometry();
  high.setAttribute('position', new BufferAttribute(flat.positions, 3));
  high.setAttribute('color', new BufferAttribute(flat.colors, 4));
  high.setIndex(new BufferAttribute(flat.indices, 1));
  const bvh = new MeshBVH(high);
  const pos = lowGeometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 4);
  const point = new Vector3();
  const target = { point: new Vector3(), distance: 0, faceIndex: 0 };
  const infoTarget = { barycoord: new Vector3() };
  for (let i = 0; i < pos.count; i++) {
    point.fromBufferAttribute(pos, i);
    const hit = bvh.closestPointToPoint(point, target, 0, Infinity);
    if (!hit) {
      colors[i * 4] = colors[i * 4 + 1] = colors[i * 4 + 2] = colors[i * 4 + 3] = 1;
      continue;
    }
    const info = getTriangleHitPointInfo(
      hit.point,
      high,
      hit.faceIndex,
      infoTarget as Parameters<typeof getTriangleHitPointInfo>[3],
    );
    const bary = info.barycoord;
    const idx = high.getIndex()!.array;
    const a = idx[hit.faceIndex * 3];
    const b = idx[hit.faceIndex * 3 + 1];
    const c = idx[hit.faceIndex * 3 + 2];
    const col = high.getAttribute('color');
    for (let k = 0; k < 4; k++) {
      colors[i * 4 + k] =
        col.getComponent(a, k) * bary.x +
        col.getComponent(b, k) * bary.y +
        col.getComponent(c, k) * bary.z;
    }
  }
  lowGeometry.setAttribute('color', new BufferAttribute(colors, 4));
}

export function sourceHasVertexColor(root: Object3D): boolean {
  let found = false;
  root.traverse((obj) => {
    const geo = (obj as Object3D & { geometry?: BufferGeometry }).geometry;
    if (geo?.getAttribute('color')) found = true;
  });
  return found;
}
