// src/world/terrain/lod/terrainLodRings.ts — play-mode geometry clipmap (detail disk + macro base)
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  PlaneGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VISUAL } from '../../../config/visualTuning';
import { WORLD } from '../../WorldConfig';
import { enableWaterReflectionLayer } from '../../water/waterReflectionLayers';
import { buildTerrainLodVertexStats, type TerrainLodVertexStats } from './terrainLodStats';

export interface TerrainLodConfig {
  centerCells: number;
  /** Full-map macro base: segment count per axis at macro step (world-fixed). */
  macroBaseCells: number;
  /** Macro base vertex spacing multiplier vs finest step. */
  macroStepMul: number;
  skirtDepth: number;
  /** Player-follow detail patch radius (m). */
  detailRadiusM: number;
  /** Inner radius (m) for full detail disp before radial fade. */
  detailDispFadeStartM: number;
}

function cellsCoveringWorldHalf(worldHalf: number, step: number): number {
  return Math.max(1, Math.ceil(worldHalf / step));
}

/**
 * Derive clipmap layout: player-follow center patch + world-fixed macro base.
 */
export function terrainLodConfigFromVisual(baseStep: number): TerrainLodConfig {
  const { detailRadiusM, detailDispFadeStartM, skirtDepth, farStepMul } = VISUAL.terrain.lod;

  const macroStep = baseStep * farStepMul;
  const centerCells = Math.max(4, cellsCoveringWorldHalf(detailRadiusM, baseStep) * 2);
  const macroBaseCells = Math.max(2, Math.ceil(WORLD.SIZE / macroStep));

  return {
    centerCells,
    macroBaseCells,
    macroStepMul: farStepMul,
    skirtDepth,
    detailRadiusM,
    detailDispFadeStartM,
  };
}

function finalizeLodGeometry(geometry: BufferGeometry): BufferGeometry {
  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }
  return geometry;
}

/**
 * Flat CPU geometry + GPU macro/detail displacement — default bounds sit near y≈0 and
 * frustum culling drops the mesh when the camera is elevated and pitched up.
 */
export function configureGpuDisplacedTerrainMesh(mesh: Mesh): void {
  mesh.frustumCulled = false;
}

/** mergeGeometries requires identical attribute sets; terrain shaders use world XZ, not geom UVs. */
function positionOnlyForMerge(geometry: BufferGeometry): BufferGeometry {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position') {
      geometry.deleteAttribute(name);
    }
  }
  return geometry;
}

/** Full square patch for the player-follow detail disk (Y = 0; macro height applied in shader). */
export function createLodCenterGeometry(step: number, cells: number): BufferGeometry {
  const size = cells * step;
  const geometry = new PlaneGeometry(size, size, cells, cells);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** World-fixed coarse square covering the full authored map extent (Y = 0). */
export function createTerrainMacroBaseGeometry(
  baseStep: number,
  config: TerrainLodConfig,
): BufferGeometry {
  const macroStep = baseStep * config.macroStepMul;
  return createLodCenterGeometry(macroStep, config.macroBaseCells);
}

/** Vertical ribbon along one edge — local Y runs 0 (surface) to -skirtDepth. */
function createSkirtWallGeometry(
  step: number,
  axis: 'x' | 'z',
  fixed: number,
  along0: number,
  along1: number,
  skirtDepth: number,
): BufferGeometry {
  const cells = Math.max(1, Math.round(Math.abs(along1 - along0) / step));
  const alongStep = (along1 - along0) / cells;
  const positions = new Float32Array(cells * 4 * 3 * 3);
  let offset = 0;

  const writeVertex = (x: number, y: number, z: number) => {
    positions[offset++] = x;
    positions[offset++] = y;
    positions[offset++] = z;
  };

  const writeTwoSidedQuad = (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => {
    writeVertex(...a);
    writeVertex(...c);
    writeVertex(...b);
    writeVertex(...b);
    writeVertex(...c);
    writeVertex(...d);
    writeVertex(...a);
    writeVertex(...b);
    writeVertex(...c);
    writeVertex(...b);
    writeVertex(...d);
    writeVertex(...c);
  };

  for (let i = 0; i < cells; i++) {
    const alongA = along0 + i * alongStep;
    const alongB = along0 + (i + 1) * alongStep;
    const a: [number, number, number] =
      axis === 'x' ? [alongA, 0, fixed] : [fixed, 0, alongA];
    const b: [number, number, number] =
      axis === 'x' ? [alongA, -skirtDepth, fixed] : [fixed, -skirtDepth, alongA];
    const c: [number, number, number] =
      axis === 'x' ? [alongB, 0, fixed] : [fixed, 0, alongB];
    const d: [number, number, number] =
      axis === 'x' ? [alongB, -skirtDepth, fixed] : [fixed, -skirtDepth, alongB];
    writeTwoSidedQuad(a, b, c, d);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
  return geometry;
}

/** Outer perimeter skirts for the center detail patch (hides seam with macro base). */
function createLodCenterSkirtGeometry(
  step: number,
  halfWidthCells: number,
  skirtDepth: number,
): BufferGeometry {
  const outer = halfWidthCells * step;
  const walls = [
    createSkirtWallGeometry(step, 'x', outer, -outer, outer, skirtDepth),
    createSkirtWallGeometry(step, 'x', -outer, -outer, outer, skirtDepth),
    createSkirtWallGeometry(step, 'z', outer, -outer, outer, skirtDepth),
    createSkirtWallGeometry(step, 'z', -outer, -outer, outer, skirtDepth),
  ];
  const merged = mergeGeometries(walls, false);
  if (!merged) {
    throw new Error('createLodCenterSkirtGeometry: failed to merge skirt walls');
  }
  for (const wall of walls) {
    wall.dispose();
  }
  return finalizeLodGeometry(merged);
}

export interface TerrainLodSnap {
  snapX: number;
  snapZ: number;
}

export interface TerrainLodMesh {
  group: Group;
  /** World-fixed coarse mesh covering the full map — never repositioned. */
  macroBaseMesh: Mesh;
  /** Player-follow detail disk (surface + perimeter skirts) — single mesh in current layout. */
  detailMeshes: Mesh[];
  /** All visible clipmap draw meshes (macro base first, then detail disk). */
  meshes: Mesh[];
  /** Position-attribute vertex counts for each clipmap draw mesh. */
  vertexStats: TerrainLodVertexStats;
  update: (playerX: number, playerZ: number) => TerrainLodSnap;
  dispose: () => void;
}

/** Snap world XZ to a clipmap grid origin at the given vertex spacing. */
export function snapLodOrigin(coord: number, step: number): number {
  return Math.floor(coord / step) * step;
}

/** World-fixed macro base + player-follow center detail patch (separate materials optional). */
export function createTerrainLodMesh(
  detailMaterial: Material,
  baseStep: number,
  config: TerrainLodConfig = terrainLodConfigFromVisual(baseStep),
  macroMaterial: Material = detailMaterial,
): TerrainLodMesh {
  const group = new Group();
  group.name = 'terrain-lod';
  const detailMeshes: Mesh[] = [];
  const meshes: Mesh[] = [];

  const macroGeo = createTerrainMacroBaseGeometry(baseStep, config);
  const macroBaseMesh = new Mesh(macroGeo, macroMaterial);
  macroBaseMesh.name = 'terrain-lod-macro-base';
  macroBaseMesh.castShadow = false;
  configureGpuDisplacedTerrainMesh(macroBaseMesh);
  enableWaterReflectionLayer(macroBaseMesh);
  group.add(macroBaseMesh);
  meshes.push(macroBaseMesh);

  const centerSurface = positionOnlyForMerge(createLodCenterGeometry(baseStep, config.centerCells));
  const centerSkirt = positionOnlyForMerge(
    createLodCenterSkirtGeometry(baseStep, config.centerCells / 2, config.skirtDepth),
  );
  const centerGeo = mergeGeometries([centerSurface, centerSkirt], false);
  centerSurface.dispose();
  centerSkirt.dispose();
  if (!centerGeo) {
    throw new Error('createTerrainLodMesh: failed to merge center patch + skirt');
  }
  const centerMesh = new Mesh(finalizeLodGeometry(centerGeo), detailMaterial);
  centerMesh.name = 'terrain-lod-center';
  centerMesh.castShadow = false;
  configureGpuDisplacedTerrainMesh(centerMesh);
  enableWaterReflectionLayer(centerMesh);
  group.add(centerMesh);
  detailMeshes.push(centerMesh);
  meshes.push(centerMesh);

  const update = (playerX: number, playerZ: number): TerrainLodSnap => {
    const snapX = snapLodOrigin(playerX, baseStep);
    const snapZ = snapLodOrigin(playerZ, baseStep);
    for (const mesh of detailMeshes) {
      mesh.position.set(snapX, 0, snapZ);
    }
    return { snapX, snapZ };
  };

  const vertexStats = buildTerrainLodVertexStats(
    macroBaseMesh,
    detailMeshes,
    config,
    baseStep,
    Math.round(WORLD.SIZE / baseStep),
  );

  return {
    group,
    macroBaseMesh,
    detailMeshes,
    meshes,
    vertexStats,
    update,
    dispose: () => {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
      }
    },
  };
}
