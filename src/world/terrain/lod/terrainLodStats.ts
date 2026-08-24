// src/world/terrain/lod/terrainLodStats.ts — play mesh vertex counts vs full finest-mesh baseline
import type { BufferGeometry, Mesh } from 'three';
import type { TerrainPlayLodConfig } from './terrainLodRings';

export interface TerrainLodVertexStats {
  centerVertices: number;
  midVertices: number;
  farVertices: number;
  clipmapTotalVertices: number;
  legacyFullMeshVertices: number;
  savingsPercent: number;
  centerCells: number;
  midCenterCells: number;
  farBaseCells: number;
  finestStepM: number;
  midStepM: number;
  farStepM: number;
  detailRadiusM: number;
  macroRadiusM: number;
}

function geometryVertexCount(geometry: BufferGeometry): number {
  return geometry.getAttribute('position').count;
}

function legacyTerrainMeshVertexCount(finestSegments: number): number {
  return (finestSegments + 1) ** 2;
}

export function buildPlayTerrainVertexStats(
  detailMesh: Mesh,
  midMesh: Mesh,
  farMesh: Mesh,
  config: TerrainPlayLodConfig,
  finestSegments: number,
): TerrainLodVertexStats {
  const centerVertices = geometryVertexCount(detailMesh.geometry);
  const midVertices = geometryVertexCount(midMesh.geometry);
  const farVertices = geometryVertexCount(farMesh.geometry);
  const clipmapTotalVertices = centerVertices + midVertices + farVertices;
  const legacyFullMeshVertices = legacyTerrainMeshVertexCount(finestSegments);
  const savingsPercent =
    legacyFullMeshVertices > 0 ? (1 - clipmapTotalVertices / legacyFullMeshVertices) * 100 : 0;

  return {
    centerVertices,
    midVertices,
    farVertices,
    clipmapTotalVertices,
    legacyFullMeshVertices,
    savingsPercent,
    centerCells: config.centerCells,
    midCenterCells: config.midCenterCells,
    farBaseCells: config.farBaseCells,
    finestStepM: config.finestStep,
    midStepM: config.midStep,
    farStepM: config.farStep,
    detailRadiusM: config.detailRadiusM,
    macroRadiusM: config.macroRadiusM,
  };
}

export function formatTerrainLodVertexStatsHtml(stats: TerrainLodVertexStats): string {
  const pct = stats.savingsPercent.toFixed(1);
  const fmt = (n: number) => n.toLocaleString();
  return `
    <dl class="dev-lod-stats">
      <div class="dev-lod-stats-row">
        <dt>Fine center</dt>
        <dd>${fmt(stats.centerVertices)} verts</dd>
      </div>
      <div class="dev-lod-stats-row">
        <dt>Mid follow</dt>
        <dd>${fmt(stats.midVertices)} verts</dd>
      </div>
      <div class="dev-lod-stats-row">
        <dt>Far base</dt>
        <dd>${fmt(stats.farVertices)} verts</dd>
      </div>
      <div class="dev-lod-stats-row dev-lod-stats-total">
        <dt>Play total</dt>
        <dd>${fmt(stats.clipmapTotalVertices)} verts</dd>
      </div>
      <div class="dev-lod-stats-row">
        <dt>Full finest mesh (baseline)</dt>
        <dd>${fmt(stats.legacyFullMeshVertices)} verts</dd>
      </div>
      <div class="dev-lod-stats-row dev-lod-stats-savings">
        <dt>Savings</dt>
        <dd>${pct}%</dd>
      </div>
    </dl>
    <p class="dev-hint dev-lod-stats-grid">
      Fine ${stats.centerCells}×${stats.centerCells} @ ${stats.finestStepM.toFixed(3)} m
      · mid ${stats.midCenterCells}×${stats.midCenterCells} @ ${stats.midStepM.toFixed(2)} m
      · far ${stats.farBaseCells}×${stats.farBaseCells} @ ${stats.farStepM.toFixed(1)} m
      · rings ${stats.detailRadiusM} m / ${stats.macroRadiusM} m
    </p>
  `.trim();
}
