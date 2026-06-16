// src/world/terrain/lod/terrainLodDebug.ts — DEV wireframe ring bounds for seam tuning
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

function addSquareOutline(parent: Group, half: number, color: number, name: string): void {
  const outline = new LineSegments(
    createSquareOutline(half),
    new LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }),
  );
  outline.name = name;
  outline.renderOrder = 9999;
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
  config: TerrainLodConfig = terrainLodConfigFromVisual(),
): TerrainLodBoundsDebug {
  const group = new Group();
  group.name = 'terrain-lod-bounds-debug';
  group.visible = false;
  scene.add(group);

  const levelGroups: Group[] = [];
  const steps: number[] = [];

  const centerHalf = (config.centerCells * baseStep) / 2;
  const centerGroup = new Group();
  centerGroup.name = 'lod-debug-center';
  addSquareOutline(centerGroup, centerHalf, CENTER_COLOR, 'lod-debug-center-loop');
  group.add(centerGroup);
  levelGroups.push(centerGroup);
  steps.push(baseStep);

  for (let i = 0; i < config.rings.length; i++) {
    const ring = config.rings[i]!;
    const step = baseStep * ring.stepMul;
    const ringGroup = new Group();
    ringGroup.name = `lod-debug-ring-${i}`;
    addSquareOutline(ringGroup, ring.outerCells * step, OUTER_COLOR, `lod-debug-ring-${i}-outer`);
    addSquareOutline(ringGroup, ring.innerCells * step, INNER_COLOR, `lod-debug-ring-${i}-inner`);
    group.add(ringGroup);
    levelGroups.push(ringGroup);
    steps.push(step);
  }

  const update = (playerX: number, playerZ: number, surfaceY: number, visible: boolean) => {
    group.visible = visible;
    if (!visible) return;
    group.position.y = surfaceY + 0.35;
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
