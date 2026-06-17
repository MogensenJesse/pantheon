// src/world/terrain/lod/terrainLodDebug.ts — DEV wireframe mesh bounds + player-centered detail radii
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Scene,
} from 'three';
import { snapLodOrigin, terrainLodConfigFromVisual, type TerrainLodConfig } from './terrainLodRings';

const CENTER_COLOR = 0x44ff88;
const OUTER_COLOR = 0xffaa44;
const INNER_COLOR = 0x88aaff;
const DETAIL_START_COLOR = 0x44ffcc;
const DETAIL_END_COLOR = 0xff6644;

function createSquareOutline(half: number): BufferGeometry {
  const positions = new Float32Array([
    -half,
    0,
    -half,
    half,
    0,
    -half,
    half,
    0,
    -half,
    half,
    0,
    half,
    half,
    0,
    half,
    -half,
    0,
    half,
    -half,
    0,
    half,
    -half,
    0,
    -half,
  ]);
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geo;
}

function createCircleOutline(radius: number, segments = 64): BufferGeometry {
  const positions = new Float32Array(segments * 2 * 3);
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const base = i * 6;
    positions[base] = Math.cos(a0) * radius;
    positions[base + 1] = 0;
    positions[base + 2] = Math.sin(a0) * radius;
    positions[base + 3] = Math.cos(a1) * radius;
    positions[base + 4] = 0;
    positions[base + 5] = Math.sin(a1) * radius;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geo;
}

function addSquareOutline(parent: Group, half: number, color: number, name: string): void {
  const outline = new LineSegments(
    createSquareOutline(half),
    new LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }),
  );
  outline.name = name;
  outline.renderOrder = 9999;
  parent.add(outline);
}

function addCircleOutline(parent: Group, radius: number, color: number, name: string): void {
  const outline = new LineSegments(
    createCircleOutline(radius),
    new LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }),
  );
  outline.name = name;
  outline.renderOrder = 10000;
  parent.add(outline);
}

export interface TerrainLodBoundsDebug {
  group: Group;
  update: (playerX: number, playerZ: number, surfaceY: number, visible: boolean) => void;
  dispose: () => void;
}

export function createTerrainLodBoundsDebug(
  scene: Scene,
  baseStep: number,
  config: TerrainLodConfig = terrainLodConfigFromVisual(baseStep),
): TerrainLodBoundsDebug {
  const group = new Group();
  group.name = 'terrain-lod-bounds-debug';
  group.visible = false;
  scene.add(group);

  const meshBounds = new Group();
  meshBounds.name = 'lod-debug-mesh-bounds';
  group.add(meshBounds);

  const detailRadii = new Group();
  detailRadii.name = 'lod-debug-detail-radii';
  group.add(detailRadii);

  addCircleOutline(
    detailRadii,
    config.detailRadiusStart,
    DETAIL_START_COLOR,
    'lod-debug-detail-start',
  );
  addCircleOutline(detailRadii, config.detailRadiusEnd, DETAIL_END_COLOR, 'lod-debug-detail-end');

  const levelGroups: Group[] = [];
  const steps: number[] = [];

  const centerHalf = (config.centerCells * baseStep) / 2;
  const centerGroup = new Group();
  centerGroup.name = 'lod-debug-center';
  addSquareOutline(centerGroup, centerHalf, CENTER_COLOR, 'lod-debug-center-loop');
  meshBounds.add(centerGroup);
  levelGroups.push(centerGroup);
  steps.push(baseStep);

  for (let i = 0; i < config.rings.length; i++) {
    const ring = config.rings[i]!;
    const step = baseStep * ring.stepMul;
    const ringGroup = new Group();
    ringGroup.name = `lod-debug-ring-${i}`;
    addSquareOutline(ringGroup, ring.outerCells * step, OUTER_COLOR, `lod-debug-ring-${i}-outer`);
    addSquareOutline(ringGroup, ring.innerCells * step, INNER_COLOR, `lod-debug-ring-${i}-inner`);
    meshBounds.add(ringGroup);
    levelGroups.push(ringGroup);
    steps.push(step);
  }

  const update = (playerX: number, playerZ: number, surfaceY: number, visible: boolean) => {
    group.visible = visible;
    if (!visible) return;
    group.position.y = surfaceY + 0.35;
    detailRadii.position.set(playerX, 0, playerZ);
    for (let i = 0; i < levelGroups.length; i++) {
      const step = steps[i]!;
      levelGroups[i]!.position.set(snapLodOrigin(playerX, step), 0, snapLodOrigin(playerZ, step));
    }
  };

  const dispose = () => {
    scene.remove(group);
    group.traverse((obj) => {
      if (obj instanceof LineSegments) {
        obj.geometry.dispose();
        (obj.material as LineBasicMaterial).dispose();
      }
    });
  };

  return { group, update, dispose };
}
