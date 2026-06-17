// src/world/terrain/lod/terrainLodDebug.ts — DEV wireframe mesh bounds + player-centered detail radii
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Scene,
} from 'three';
import { WORLD } from '../../WorldConfig';
import { snapLodOrigin, terrainLodConfigFromVisual, type TerrainLodConfig } from './terrainLodRings';

const CENTER_COLOR = 0x44ff88;
const DETAIL_RADIUS_COLOR = 0x44ffcc;
const DETAIL_FADE_START_COLOR = 0xffffff;
const MAP_BOUNDARY_COLOR = 0xccccff;

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

  const detailRadii = new Group();
  detailRadii.name = 'lod-debug-detail-radii';
  group.add(detailRadii);

  const mapBoundary = new Group();
  mapBoundary.name = 'lod-debug-map-boundary';
  addSquareOutline(
    mapBoundary,
    WORLD.SIZE * 0.5,
    MAP_BOUNDARY_COLOR,
    'lod-debug-map-extent',
  );
  group.add(mapBoundary);

  addCircleOutline(
    detailRadii,
    config.detailRadiusM,
    DETAIL_RADIUS_COLOR,
    'lod-debug-detail-radius',
  );
  if (config.detailDispFadeStartM > 0) {
    addCircleOutline(
      detailRadii,
      config.detailDispFadeStartM,
      DETAIL_FADE_START_COLOR,
      'lod-debug-detail-fade-start',
    );
  }

  const detailBounds = new Group();
  detailBounds.name = 'lod-debug-detail-bounds';
  group.add(detailBounds);

  const centerHalf = (config.centerCells * baseStep) / 2;
  addSquareOutline(detailBounds, centerHalf, CENTER_COLOR, 'lod-debug-center-loop');

  const update = (playerX: number, playerZ: number, surfaceY: number, visible: boolean) => {
    group.visible = visible;
    if (!visible) return;
    group.position.y = surfaceY + 0.35;
    detailRadii.position.set(
      snapLodOrigin(playerX, baseStep),
      0,
      snapLodOrigin(playerZ, baseStep),
    );
    detailBounds.position.set(
      snapLodOrigin(playerX, baseStep),
      0,
      snapLodOrigin(playerZ, baseStep),
    );
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
