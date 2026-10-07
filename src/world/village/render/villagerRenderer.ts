// src/world/village/render/villagerRenderer.ts — one instanced draw for every villager, plus a blob-shadow draw
import {
  type DirectionalLight,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
} from 'three';
import { VILLAGE } from '../../../config/village';
import { ensureGeometryUv } from '../../../rendering/ensureGeometryUv';
import { buildVillagerGeometry } from '../assets/placeholder/villagerFigure';
import type { Villagers } from '../sim/villageTypes';
import { createBlobShadowMaterial } from './blobShadows';
import { createVillagerMaterial } from './villagerMaterial';
import { uVillageTime } from './villageUniforms';

export interface VillagerRendererOptions {
  sun: DirectionalLight;
  getY: (x: number, z: number) => number;
  /** Horizontal components of the ground normal at (x, z), for tilting the blob shadow. */
  getGroundNormal: (x: number, z: number, out: { x: number; z: number }) => void;
}

export interface VillagerFrame {
  /** Fixed-step interpolation 0..1. */
  alpha: number;
  elapsed: number;
  villagers: Villagers;
  /** Camera position: villagers beyond the draw distance are skipped. */
  viewX: number;
  viewZ: number;
}

export interface VillagerRenderer {
  readonly meshes: readonly Mesh[];
  /** Villagers drawn last frame. */
  visibleCount: () => number;
  update: (frame: VillagerFrame) => void;
  /** Make both draws visible for the pipeline compile; always pair with endWarmup. */
  beginWarmup: () => void;
  endWarmup: () => void;
  dispose: () => void;
}

function instanceAttribute(max: number): InstancedBufferAttribute {
  const attribute = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
}

export function createVillagerRenderer(options: VillagerRendererOptions): VillagerRenderer {
  const max = VILLAGE.VILLAGERS.MAX;
  const pose = instanceAttribute(max);
  const anim = instanceAttribute(max);
  const look = instanceAttribute(max);

  const source = buildVillagerGeometry();
  ensureGeometryUv(source);
  const figureGeometry = new InstancedBufferGeometry();
  for (const name of ['position', 'normal', 'color', 'uv', 'aRig']) {
    figureGeometry.setAttribute(name, source.getAttribute(name));
  }

  const quad = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobGeometry = new InstancedBufferGeometry();
  blobGeometry.setIndex(quad.getIndex());
  for (const name of ['position', 'normal', 'uv']) {
    blobGeometry.setAttribute(name, quad.getAttribute(name));
  }

  for (const geometry of [figureGeometry, blobGeometry]) {
    geometry.setAttribute('iPose', pose);
    geometry.setAttribute('iAnim', anim);
    geometry.setAttribute('iLook', look);
    geometry.instanceCount = 0;
  }

  const figureMaterial = createVillagerMaterial(options.sun);
  const blobMaterial = createBlobShadowMaterial();
  const figure = new Mesh(figureGeometry, figureMaterial);
  const blob = new Mesh(blobGeometry, blobMaterial);
  figure.name = 'villagers';
  blob.name = 'villagerBlobShadows';
  figure.renderOrder = 3;
  blob.renderOrder = 3.5;
  for (const mesh of [figure, blob]) {
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.visible = false;
  }
  figure.receiveShadow = true;

  const ground = { x: 0, z: 0 };
  const maxDist2 = VILLAGE.VILLAGERS.DRAW_DISTANCE_M ** 2;
  let visible = 0;
  let warmup = false;

  return {
    meshes: [figure, blob],
    visibleCount: () => visible,
    update: ({ alpha, elapsed, villagers: v, viewX, viewZ }) => {
      uVillageTime.value = elapsed;
      let k = 0;
      for (let i = 0; i < v.count; i++) {
        if (v.indoors[i]) continue;
        const x = v.prevX[i]! + (v.x[i]! - v.prevX[i]!) * alpha;
        const z = v.prevZ[i]! + (v.z[i]! - v.prevZ[i]!) * alpha;
        const dx = x - viewX;
        const dz = z - viewZ;
        if (dx * dx + dz * dz > maxDist2) continue;
        options.getGroundNormal(x, z, ground);
        const variant = v.variant[i]!;
        pose.setXYZW(k, x, options.getY(x, z), z, v.yaw[i]!);
        anim.setXYZW(k, v.anim[i]!, v.animPrev[i]!, v.animBlend[i]!, v.stride[i]!);
        look.setXYZW(k, variant, 0.95 + ((variant * 7) % 5) * 0.025, ground.x, ground.z);
        k++;
      }
      visible = k;
      if (warmup) return;
      figureGeometry.instanceCount = k;
      blobGeometry.instanceCount = k;
      figure.visible = k > 0;
      blob.visible = k > 0;
      if (k > 0) {
        pose.needsUpdate = true;
        anim.needsUpdate = true;
        look.needsUpdate = true;
      }
    },
    beginWarmup: () => {
      warmup = true;
      for (const mesh of [figure, blob]) {
        (mesh.geometry as InstancedBufferGeometry).instanceCount = 1;
        mesh.visible = true;
      }
    },
    endWarmup: () => {
      warmup = false;
      for (const mesh of [figure, blob]) {
        (mesh.geometry as InstancedBufferGeometry).instanceCount = 0;
        mesh.visible = false;
      }
    },
    dispose: () => {
      figureGeometry.dispose();
      blobGeometry.dispose();
      source.dispose();
      quad.dispose();
      figureMaterial.dispose();
      blobMaterial.dispose();
    },
  };
}
