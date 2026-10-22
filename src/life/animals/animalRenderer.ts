// src/life/animals/animalRenderer.ts — every animal as instanced rigid parts, plus one blob-shadow draw
//
// One InstancedMesh per part of each model (a sheep has seven). Each frame the animals handed to `add` get their
// matrices written: the animal's place and size, then the part's pivot and its pose turn (animalPose.ts). The parts
// use the map props' lit material, so the animals take the sun, the shadows and the weather like everything else.

import type { DirectionalLight } from 'three';
import {
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { ensureGeometryUv } from '../../rendering/ensureGeometryUv';
import { createMapPropNodeMaterials } from '../../world/mapProps/material/mapPropMaterial';
import { createBlobShadowMaterial } from '../../world/village/render/blobShadows';
import type { AnimalModel } from './animalModels';
import { type PartPose, type PoseParams, posePart } from './animalPose';

/** One animal to draw this frame. */
export interface Puppet {
  model: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Tilt to the ground or into a bank, radians. */
  pitch?: number;
  roll?: number;
  /** The animal's own size, 1 = the model's size. */
  scale: number;
  pose: PoseParams;
  /** The blob shadow's size (0 = none: a bird in the air) and the ground's slope under it. */
  blob: number;
  groundNx: number;
  groundNz: number;
}

export interface AnimalRenderer {
  readonly meshes: readonly Mesh[];
  /** Start a frame: forget last frame's animals. */
  begin: () => void;
  add: (puppet: Puppet) => void;
  /** End the frame: show what was added. */
  end: () => void;
  /** Make one of every draw visible for the pipeline compile; always pair with endWarmup. */
  beginWarmup: () => void;
  endWarmup: () => void;
  dispose: () => void;
}

interface PartMesh {
  mesh: InstancedMesh;
  name: string;
  pivot: Vector3;
}

interface ModelDraw {
  model: AnimalModel;
  parts: PartMesh[];
  count: number;
  capacity: number;
}

export function createAnimalRenderer(options: {
  sun: DirectionalLight;
  models: ReadonlyMap<string, AnimalModel>;
  /** The most animals of each model key shown at once. */
  capacity: Readonly<Record<string, number>>;
}): AnimalRenderer {
  const draws = new Map<string, ModelDraw>();
  const meshes: Mesh[] = [];
  const nodeMaterials = new Map<unknown, unknown>();
  const materialOf = (base: unknown) => {
    let node = nodeMaterials.get(base);
    if (!node) {
      node = createMapPropNodeMaterials(options.sun, base as never, 0);
      nodeMaterials.set(base, node);
    }
    return node as never;
  };

  for (const [key, model] of options.models) {
    const capacity = options.capacity[key] ?? 0;
    if (capacity <= 0) continue;
    const parts: PartMesh[] = [];
    for (const part of model.parts) {
      for (const draw of part.draws) {
        ensureGeometryUv(draw.geometry);
        const mesh = new InstancedMesh(draw.geometry, materialOf(draw.material), capacity);
        mesh.name = `animal_${key}_${part.name}`;
        mesh.instanceMatrix.setUsage(DynamicDrawUsage);
        mesh.count = 0;
        mesh.frustumCulled = false;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.renderOrder = 3;
        mesh.visible = false;
        parts.push({ mesh, name: part.name, pivot: new Vector3(...part.pivot) });
        meshes.push(mesh);
      }
    }
    draws.set(key, { model, parts, count: 0, capacity });
  }

  // blob shadows, like the villagers'
  const blobCapacity = [...draws.values()].reduce((n, d) => n + d.capacity, 0);
  const attribute = () => {
    const a = new InstancedBufferAttribute(new Float32Array(blobCapacity * 4), 4);
    a.setUsage(DynamicDrawUsage);
    return a;
  };
  const blobPose = attribute();
  const blobLook = attribute();
  const quad = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blobGeometry = new InstancedBufferGeometry();
  blobGeometry.setIndex(quad.getIndex());
  for (const name of ['position', 'normal', 'uv']) {
    blobGeometry.setAttribute(name, quad.getAttribute(name));
  }
  blobGeometry.setAttribute('iPose', blobPose);
  blobGeometry.setAttribute('iLook', blobLook);
  blobGeometry.instanceCount = 0;
  const blobMaterial = createBlobShadowMaterial();
  const blob = new Mesh(blobGeometry, blobMaterial);
  blob.name = 'animalBlobShadows';
  blob.renderOrder = 3.5;
  blob.frustumCulled = false;
  blob.castShadow = false;
  blob.visible = false;
  meshes.push(blob);
  let blobCount = 0;
  let warmup = false;

  const base = new Matrix4();
  const local = new Matrix4();
  const world = new Matrix4();
  const euler = new Euler(0, 0, 0, 'YXZ');
  const quat = new Quaternion();
  const position = new Vector3();
  const scaleVec = new Vector3();
  const partPose: PartPose = { rx: 0, ry: 0, rz: 0, dx: 0, dy: 0, dz: 0 };
  const ONE = new Vector3(1, 1, 1);

  return {
    meshes,
    begin: () => {
      for (const d of draws.values()) d.count = 0;
      blobCount = 0;
    },
    add: (puppet) => {
      const draw = draws.get(puppet.model);
      if (!draw || draw.count >= draw.capacity) return;
      const k = draw.count++;
      const size = puppet.scale * draw.model.scale;
      euler.set(puppet.pitch ?? 0, puppet.yaw, puppet.roll ?? 0, 'YXZ');
      quat.setFromEuler(euler);
      position.set(puppet.x, puppet.y - draw.model.footY * size, puppet.z);
      scaleVec.set(size, size, size);
      base.compose(position, quat, scaleVec);
      for (const part of draw.parts) {
        posePart(puppet.model, part.name, puppet.pose, partPose);
        euler.set(partPose.rx, partPose.ry, partPose.rz, 'XYZ');
        quat.setFromEuler(euler);
        position.set(
          part.pivot.x + partPose.dx,
          part.pivot.y + partPose.dy,
          part.pivot.z + partPose.dz,
        );
        local.compose(position, quat, ONE);
        world.multiplyMatrices(base, local);
        part.mesh.setMatrixAt(k, world);
      }
      if (puppet.blob > 0 && blobCount < blobCapacity) {
        blobPose.setXYZW(blobCount, puppet.x, puppet.y, puppet.z, puppet.yaw);
        blobLook.setXYZW(
          blobCount,
          0,
          puppet.blob * puppet.scale,
          puppet.groundNx,
          puppet.groundNz,
        );
        blobCount++;
      }
    },
    end: () => {
      if (warmup) return;
      for (const d of draws.values()) {
        for (const part of d.parts) {
          part.mesh.count = d.count;
          part.mesh.visible = d.count > 0;
          if (d.count > 0) part.mesh.instanceMatrix.needsUpdate = true;
        }
      }
      blobGeometry.instanceCount = blobCount;
      blob.visible = blobCount > 0;
      if (blobCount > 0) {
        blobPose.needsUpdate = true;
        blobLook.needsUpdate = true;
      }
    },
    beginWarmup: () => {
      warmup = true;
      for (const d of draws.values()) {
        // an identity matrix at the origin is enough to compile the pipeline
        for (const part of d.parts) {
          part.mesh.setMatrixAt(0, base.identity());
          part.mesh.instanceMatrix.needsUpdate = true;
          part.mesh.count = 1;
          part.mesh.visible = true;
        }
      }
      blobPose.setXYZW(0, 0, 0, 0, 0);
      blobLook.setXYZW(0, 0, 1, 0, 0);
      blobGeometry.instanceCount = 1;
      blob.visible = true;
    },
    endWarmup: () => {
      warmup = false;
      for (const d of draws.values()) {
        for (const part of d.parts) {
          part.mesh.count = 0;
          part.mesh.visible = false;
        }
      }
      blobGeometry.instanceCount = 0;
      blob.visible = false;
    },
    dispose: () => {
      for (const d of draws.values()) {
        for (const part of d.parts) part.mesh.dispose();
        d.model.dispose();
      }
      for (const node of nodeMaterials.values()) {
        for (const m of Array.isArray(node) ? node : [node])
          (m as { dispose: () => void }).dispose();
      }
      blobGeometry.dispose();
      quad.dispose();
      blobMaterial.dispose();
    },
  };
}
