// src/world/village/render/villagerRenderer.ts — one instanced draw per figure (role × sex), plus one blob-shadow draw
import {
  type BufferGeometry,
  type DirectionalLight,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  type Object3D,
  PlaneGeometry,
} from 'three';
import { VILLAGE } from '../../../config/village';
import { VISUAL } from '../../../config/visualTuning';
import { ensureGeometryUv } from '../../../rendering/ensureGeometryUv';
import { buildVillagerGeometry } from '../assets/placeholder/villagerFigure';
import { figureFromKit } from '../assets/villagerKit';
import { type AnimId, ROLE_COUNT, type RoleId, type SexId, type Villagers } from '../model/types';
import { createBlobShadowMaterial } from './blobShadows';
import { createVillagerMaterial } from './villagerMaterial';
import { uVillageTime } from './villageUniforms';

const HUNGER = VILLAGE.HUNGER;

export interface VillagerRendererOptions {
  sun: DirectionalLight;
  /** The modelled kit (villagers.glb); figures it lacks fall back to the placeholders. */
  figures?: Object3D | null;
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

/** A figure shown outside the sim (DEV lineup), standing still in one pose. */
export interface LineupFigure {
  x: number;
  z: number;
  yaw: number;
  role: RoleId;
  sex: SexId;
  anim: AnimId;
  variant: number;
}

export interface VillagerRenderer {
  readonly meshes: readonly Mesh[];
  update: (frame: VillagerFrame) => void;
  /** DEV: draw these figures besides the sim's (null removes them), to review models and poses. */
  setLineup: (figures: readonly LineupFigure[] | null) => void;
  /** Make every draw visible for the pipeline compile; always pair with endWarmup. */
  beginWarmup: () => void;
  endWarmup: () => void;
  dispose: () => void;
}

/** One draw per role and sex: the figures differ in geometry (gear, build), not in the shader. */
interface FigureDraw {
  mesh: Mesh;
  geometry: InstancedBufferGeometry;
  source: BufferGeometry;
  pose: InstancedBufferAttribute;
  anim: InstancedBufferAttribute;
  look: InstancedBufferAttribute;
  count: number;
}

function instanceAttribute(max: number): InstancedBufferAttribute {
  const attribute = new InstancedBufferAttribute(new Float32Array(max * 4), 4);
  attribute.setUsage(DynamicDrawUsage);
  return attribute;
}

export function createVillagerRenderer(options: VillagerRendererOptions): VillagerRenderer {
  const max = VILLAGE.VILLAGERS.MAX;
  const figureMaterial = createVillagerMaterial(options.sun);
  const blobPose = instanceAttribute(max);
  const blobLook = instanceAttribute(max);

  const draws: FigureDraw[] = [];
  for (let role = 0; role < ROLE_COUNT; role++) {
    for (let sex = 0; sex < 2; sex++) {
      const source =
        (options.figures && figureFromKit(options.figures, role as RoleId, sex as SexId)) ??
        buildVillagerGeometry(role as RoleId, sex as SexId);
      ensureGeometryUv(source);
      const geometry = new InstancedBufferGeometry();
      for (const name of ['position', 'normal', 'color', 'uv', 'aRig']) {
        geometry.setAttribute(name, source.getAttribute(name));
      }
      const pose = instanceAttribute(max);
      const anim = instanceAttribute(max);
      const look = instanceAttribute(max);
      geometry.setAttribute('iPose', pose);
      geometry.setAttribute('iAnim', anim);
      geometry.setAttribute('iLook', look);
      geometry.instanceCount = 0;
      const mesh = new Mesh(geometry, figureMaterial);
      mesh.name = `villagers_role${role}_sex${sex}`;
      mesh.renderOrder = 3;
      mesh.receiveShadow = true;
      draws.push({ mesh, geometry, source, pose, anim, look, count: 0 });
    }
  }

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
  blob.name = 'villagerBlobShadows';
  blob.renderOrder = 3.5;

  const meshes = [...draws.map((d) => d.mesh), blob];
  for (const mesh of meshes) {
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.visible = false;
  }

  const ground = { x: 0, z: 0 };
  /** The body sinks away once the collapse is over. */
  const fadeOf = (dying: number) =>
    dying <= HUNGER.COLLAPSE_S ? 1 : Math.max(0, 1 - (dying - HUNGER.COLLAPSE_S) / HUNGER.FADE_S);
  const maxDist2 = VISUAL.village.VILLAGERS.DRAW_DISTANCE_M ** 2;
  let warmup = false;
  let lineup: readonly LineupFigure[] | null = null;
  let blobCount = 0;

  /** Add one figure to its role/sex draw and to the blob shadows. */
  const push = (
    role: number,
    sex: number,
    x: number,
    z: number,
    yaw: number,
    anim: number,
    animPrev: number,
    blend: number,
    stride: number,
    variant: number,
    /** 1, falling to 0 as a dead villager sinks away. */
    fade = 1,
  ) => {
    const draw = draws[role * 2 + sex]!;
    options.getGroundNormal(x, z, ground);
    const y = options.getY(x, z);
    const size = (0.95 + ((variant * 7) % 5) * 0.025) * fade;
    const k = draw.count++;
    draw.pose.setXYZW(k, x, y, z, yaw);
    draw.anim.setXYZW(k, anim, animPrev, blend, stride);
    draw.look.setXYZW(k, variant, size, ground.x, ground.z);
    blobPose.setXYZW(blobCount, x, y, z, yaw);
    blobLook.setXYZW(blobCount, variant, size, ground.x, ground.z);
    blobCount++;
  };

  return {
    meshes,
    update: ({ alpha, elapsed, villagers: v, viewX, viewZ }) => {
      uVillageTime.value = elapsed;
      for (const draw of draws) draw.count = 0;
      blobCount = 0;
      for (let i = 0; i < v.count; i++) {
        if (v.indoors[i]) continue;
        const x = v.prevX[i]! + (v.x[i]! - v.prevX[i]!) * alpha;
        const z = v.prevZ[i]! + (v.z[i]! - v.prevZ[i]!) * alpha;
        const dx = x - viewX;
        const dz = z - viewZ;
        if (dx * dx + dz * dz > maxDist2) continue;
        push(
          v.role[i]!,
          v.sex[i]!,
          x,
          z,
          v.yaw[i]!,
          v.anim[i]!,
          v.animPrev[i]!,
          v.animBlend[i]!,
          v.stride[i]!,
          v.variant[i]!,
          fadeOf(v.dying[i]!),
        );
      }
      for (const f of lineup ?? []) {
        push(f.role, f.sex, f.x, f.z, f.yaw, f.anim, f.anim, 1, (f.variant * 0.37) % 1, f.variant);
      }
      if (warmup) return;
      for (const draw of draws) {
        draw.geometry.instanceCount = draw.count;
        draw.mesh.visible = draw.count > 0;
        if (draw.count > 0) {
          draw.pose.needsUpdate = true;
          draw.anim.needsUpdate = true;
          draw.look.needsUpdate = true;
        }
      }
      blobGeometry.instanceCount = blobCount;
      blob.visible = blobCount > 0;
      if (blobCount > 0) {
        blobPose.needsUpdate = true;
        blobLook.needsUpdate = true;
      }
    },
    setLineup: (figures) => {
      lineup = figures;
    },
    beginWarmup: () => {
      warmup = true;
      for (const mesh of meshes) {
        (mesh.geometry as InstancedBufferGeometry).instanceCount = 1;
        mesh.visible = true;
      }
    },
    endWarmup: () => {
      warmup = false;
      for (const mesh of meshes) {
        (mesh.geometry as InstancedBufferGeometry).instanceCount = 0;
        mesh.visible = false;
      }
    },
    dispose: () => {
      for (const draw of draws) {
        draw.geometry.dispose();
        draw.source.dispose();
      }
      blobGeometry.dispose();
      quad.dispose();
      figureMaterial.dispose();
      blobMaterial.dispose();
    },
  };
}
