// src/world/terrain/lod/terrainLodRings.ts — play fine + mid follow patches + world-fixed far base
import { Group, type Material, Mesh, PlaneGeometry } from 'three';
import { VISUAL } from '../../../config/visualTuning';
import { enableWaterReflectionLayer } from '../../../rendering/layers/waterReflectionLayers';
import { WORLD } from '../../WorldConfig';
import { buildPlayTerrainVertexStats, type TerrainLodVertexStats } from './terrainLodStats';

export interface TerrainPlayLodConfig {
  detailRadiusM: number;
  detailDispFadeStartM: number;
  layerFadeBandM: number;
  macroRadiusM: number;
  macroFadeBandM: number;
  finestStep: number;
  centerCells: number;
  midStep: number;
  midCenterCells: number;
  farStep: number;
  farBaseCells: number;
}

function cellsCoveringWorldHalf(worldHalf: number, step: number): number {
  return Math.max(1, Math.ceil(worldHalf / step));
}

export function terrainPlayLodConfigFromVisual(finestSegments: number): TerrainPlayLodConfig {
  const referenceStep = WORLD.SIZE / Math.max(1, finestSegments);
  const {
    detailRadiusM,
    detailDispFadeStartM,
    layerFadeBandM,
    macroRadiusM,
    macroFadeBandM,
    midStepMul,
    farStepMul,
    maxMacroStepM,
    maxFinestStepM,
    maxFarStepM,
  } = VISUAL.terrain.lod;
  const finestStep = Math.min(referenceStep, maxFinestStepM);
  const midStep = Math.min(referenceStep * midStepMul, maxMacroStepM);
  const farStep = Math.min(referenceStep * farStepMul, maxFarStepM);
  const centerCells = Math.max(4, cellsCoveringWorldHalf(detailRadiusM, finestStep) * 2);
  const midCenterCells = Math.max(4, cellsCoveringWorldHalf(macroRadiusM, midStep) * 2);
  const farBaseCells = Math.max(2, Math.ceil(WORLD.SIZE / farStep));

  return {
    detailRadiusM,
    detailDispFadeStartM,
    layerFadeBandM,
    macroRadiusM,
    macroFadeBandM,
    finestStep,
    centerCells,
    midStep,
    midCenterCells,
    farStep,
    farBaseCells,
  };
}

/** Player-follow or world-fixed square patch (Y = 0; macro height applied in shader). */
function createLodPatchGeometry(step: number, cells: number): PlaneGeometry {
  const size = cells * step;
  const geometry = new PlaneGeometry(size, size, cells, cells);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function configureGpuDisplacedTerrainMesh(mesh: Mesh): void {
  mesh.frustumCulled = false;
}

export interface TerrainLodSnap {
  snapX: number;
  snapZ: number;
  midSnapX: number;
  midSnapZ: number;
}

export interface PlayTerrainLodMesh {
  group: Group;
  detailMesh: Mesh;
  midMesh: Mesh;
  farMesh: Mesh;
  vertexStats: TerrainLodVertexStats;
  update: (playerX: number, playerZ: number) => TerrainLodSnap;
  dispose: () => void;
}

/** Snap world XZ to the clipmap grid at the given vertex spacing. */
export function snapLodOrigin(coord: number, step: number): number {
  return Math.floor(coord / step) * step;
}

/**
 * Fine + mid player-follow patches + world-fixed far base. Same splat shader on all layers;
 * opaque coverage at detailRadiusM / macroRadiusM with a short coarser underlay at the cut.
 */
export function createPlayTerrainLodMesh(
  detailMaterial: Material,
  midMaterial: Material,
  farMaterial: Material,
  finestSegments: number,
  config: TerrainPlayLodConfig = terrainPlayLodConfigFromVisual(finestSegments),
): PlayTerrainLodMesh {
  const group = new Group();
  group.name = 'terrain-play-lod';

  const farGeo = createLodPatchGeometry(config.farStep, config.farBaseCells);
  const farMesh = new Mesh(farGeo, farMaterial);
  farMesh.name = 'terrain-play-far';
  farMesh.castShadow = false;
  farMesh.renderOrder = 0;
  configureGpuDisplacedTerrainMesh(farMesh);
  enableWaterReflectionLayer(farMesh);
  group.add(farMesh);

  const midGeo = createLodPatchGeometry(config.midStep, config.midCenterCells);
  const midMesh = new Mesh(midGeo, midMaterial);
  midMesh.name = 'terrain-play-mid';
  midMesh.castShadow = false;
  midMesh.renderOrder = 1;
  configureGpuDisplacedTerrainMesh(midMesh);
  enableWaterReflectionLayer(midMesh);
  group.add(midMesh);

  const detailGeo = createLodPatchGeometry(config.finestStep, config.centerCells);
  const detailMesh = new Mesh(detailGeo, detailMaterial);
  detailMesh.name = 'terrain-play-detail';
  detailMesh.castShadow = false;
  detailMesh.renderOrder = 2;
  configureGpuDisplacedTerrainMesh(detailMesh);
  // Detail patch is invisible at reflector RT scale — keep layer 0 only (Phase 5.3).
  group.add(detailMesh);

  const update = (playerX: number, playerZ: number): TerrainLodSnap => {
    const snapX = snapLodOrigin(playerX, config.finestStep);
    const snapZ = snapLodOrigin(playerZ, config.finestStep);
    detailMesh.position.set(snapX, 0, snapZ);
    const midSnapX = snapLodOrigin(playerX, config.midStep);
    const midSnapZ = snapLodOrigin(playerZ, config.midStep);
    midMesh.position.set(midSnapX, 0, midSnapZ);
    return { snapX, snapZ, midSnapX, midSnapZ };
  };

  const vertexStats = buildPlayTerrainVertexStats(
    detailMesh,
    midMesh,
    farMesh,
    config,
    finestSegments,
  );

  return {
    group,
    detailMesh,
    midMesh,
    farMesh,
    vertexStats,
    update,
    dispose: () => {
      detailGeo.dispose();
      midGeo.dispose();
      farGeo.dispose();
    },
  };
}
