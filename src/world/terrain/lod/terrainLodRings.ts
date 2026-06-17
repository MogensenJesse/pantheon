// src/world/terrain/lod/terrainLodRings.ts — play-mode fine center patch + coarse macro base (one shader, two layers)
import { Group, Mesh, PlaneGeometry, type Material } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { WORLD } from '../../WorldConfig';
import { enableWaterReflectionLayer } from '../../water/waterReflectionLayers';
import { buildPlayTerrainVertexStats, type TerrainLodVertexStats } from './terrainLodStats';

export interface TerrainDetailConfig {
  detailRadiusM: number;
  detailDispFadeStartM: number;
  layerFadeBandM: number;
}

export interface TerrainPlayLodConfig extends TerrainDetailConfig {
  finestStep: number;
  centerCells: number;
  macroBaseCells: number;
  macroStepMul: number;
}

function cellsCoveringWorldHalf(worldHalf: number, step: number): number {
  return Math.max(1, Math.ceil(worldHalf / step));
}

export function terrainDetailConfigFromVisual(): TerrainDetailConfig {
  const { detailRadiusM, detailDispFadeStartM, layerFadeBandM } = VISUAL.terrain.lod;
  return { detailRadiusM, detailDispFadeStartM, layerFadeBandM };
}

export function terrainPlayLodConfigFromVisual(finestSegments: number): TerrainPlayLodConfig {
  const finestStep = WORLD.SIZE / finestSegments;
  const { detailRadiusM, detailDispFadeStartM, layerFadeBandM, farStepMul } = VISUAL.terrain.lod;
  const macroStep = finestStep * farStepMul;
  const centerCells = Math.max(4, cellsCoveringWorldHalf(detailRadiusM, finestStep) * 2);
  const macroBaseCells = Math.max(2, Math.ceil(WORLD.SIZE / macroStep));

  return {
    detailRadiusM,
    detailDispFadeStartM,
    layerFadeBandM,
    finestStep,
    centerCells,
    macroBaseCells,
    macroStepMul: farStepMul,
  };
}

/** Play mesh segment count per axis from finest reference and step multiplier. */
export function playMeshSegments(
  finestSegments: number,
  farStepMul: number = VISUAL.terrain.lod.farStepMul,
): number {
  return Math.max(2, Math.ceil(finestSegments / farStepMul));
}

/** Flat CPU geometry + GPU macro/detail displacement — bounds sit near y≈0 without frustum cull. */
export function createPlayTerrainGeometry(segments: number): PlaneGeometry {
  const geometry = new PlaneGeometry(WORLD.SIZE, WORLD.SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** Player-follow fine square patch (Y = 0; macro height applied in shader). */
function createDetailPatchGeometry(step: number, cells: number): PlaneGeometry {
  const size = cells * step;
  const geometry = new PlaneGeometry(size, size, cells, cells);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** World-fixed coarse square covering the full authored map extent (Y = 0). */
function createMacroBaseGeometry(macroStep: number, macroBaseCells: number): PlaneGeometry {
  return createDetailPatchGeometry(macroStep, macroBaseCells);
}

export function configureGpuDisplacedTerrainMesh(mesh: Mesh): void {
  mesh.frustumCulled = false;
}

export interface TerrainLodSnap {
  snapX: number;
  snapZ: number;
}

export interface PlayTerrainLodMesh {
  group: Group;
  detailMesh: Mesh;
  macroMesh: Mesh;
  vertexStats: TerrainLodVertexStats;
  update: (playerX: number, playerZ: number) => TerrainLodSnap;
  dispose: () => void;
}

/** Snap world XZ to the finest clipmap grid at the given vertex spacing. */
export function snapLodOrigin(coord: number, step: number): number {
  return Math.floor(coord / step) * step;
}

/**
 * Fine player-follow center + world-fixed coarse base. Same splat shader on both layers;
 * complementary alpha cutouts at detailRadiusM avoid double-draw in the ring handoff.
 */
export function createPlayTerrainLodMesh(
  detailMaterial: Material,
  macroMaterial: Material,
  finestSegments: number,
  config: TerrainPlayLodConfig = terrainPlayLodConfigFromVisual(finestSegments),
): PlayTerrainLodMesh {
  const group = new Group();
  group.name = 'terrain-play-lod';

  const macroStep = config.finestStep * config.macroStepMul;
  const macroGeo = createMacroBaseGeometry(macroStep, config.macroBaseCells);
  const macroMesh = new Mesh(macroGeo, macroMaterial);
  macroMesh.name = 'terrain-play-macro';
  macroMesh.castShadow = false;
  configureGpuDisplacedTerrainMesh(macroMesh);
  enableWaterReflectionLayer(macroMesh);
  group.add(macroMesh);

  const detailGeo = createDetailPatchGeometry(config.finestStep, config.centerCells);
  const detailMesh = new Mesh(detailGeo, detailMaterial);
  detailMesh.name = 'terrain-play-detail';
  detailMesh.castShadow = false;
  detailMesh.renderOrder = 1;
  configureGpuDisplacedTerrainMesh(detailMesh);
  enableWaterReflectionLayer(detailMesh);
  group.add(detailMesh);

  const update = (playerX: number, playerZ: number): TerrainLodSnap => {
    const snapX = snapLodOrigin(playerX, config.finestStep);
    const snapZ = snapLodOrigin(playerZ, config.finestStep);
    detailMesh.position.set(snapX, 0, snapZ);
    return { snapX, snapZ };
  };

  const vertexStats = buildPlayTerrainVertexStats(
    detailMesh,
    macroMesh,
    config,
    finestSegments,
    macroStep,
  );

  return {
    group,
    detailMesh,
    macroMesh,
    vertexStats,
    update,
    dispose: () => {
      detailGeo.dispose();
      macroGeo.dispose();
    },
  };
}
