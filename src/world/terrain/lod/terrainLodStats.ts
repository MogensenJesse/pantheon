// src/world/terrain/lod/terrainLodStats.ts — play mesh vertex counts vs full finest-mesh baseline
import type { BufferGeometry, Mesh } from 'three';
import type { TerrainPlayLodConfig } from './terrainLodRings';

export interface TerrainLodVertexStats {
  centerVertices: number;
  macroVertices: number;
  clipmapTotalVertices: number;
  legacyFullMeshVertices: number;
  savingsPercent: number;
  centerCells: number;
  macroBaseCells: number;
  finestStepM: number;
  macroStepM: number;
  detailRadiusM: number;
}

function geometryVertexCount(geometry: BufferGeometry): number {
  return geometry.getAttribute('position').count;
}

export function legacyTerrainMeshVertexCount(finestSegments: number): number {
  return (finestSegments + 1) ** 2;
}

export function buildPlayTerrainVertexStats(
  detailMesh: Mesh,
  macroMesh: Mesh,
  config: TerrainPlayLodConfig,
  finestSegments: number,
  macroStepM: number,
): TerrainLodVertexStats {
  const centerVertices = geometryVertexCount(detailMesh.geometry);
  const macroVertices = geometryVertexCount(macroMesh.geometry);
  const clipmapTotalVertices = centerVertices + macroVertices;
  const legacyFullMeshVertices = legacyTerrainMeshVertexCount(finestSegments);
  const savingsPercent =
    legacyFullMeshVertices > 0
      ? (1 - clipmapTotalVertices / legacyFullMeshVertices) * 100
      : 0;

  return {
    centerVertices,
    macroVertices,
    clipmapTotalVertices,
    legacyFullMeshVertices,
    savingsPercent,
    centerCells: config.centerCells,
    macroBaseCells: config.macroBaseCells,
    finestStepM: config.finestStep,
    macroStepM,
    detailRadiusM: config.detailRadiusM,
  };
}

export function formatTerrainLodVertexStats(stats: TerrainLodVertexStats): string {
  const pct = stats.savingsPercent.toFixed(1);
  return [
    `play LOD ${stats.clipmapTotalVertices.toLocaleString()} verts`,
    `(fine center ${stats.centerVertices.toLocaleString()}, macro ${stats.macroVertices.toLocaleString()})`,
    `vs full finest mesh ${stats.legacyFullMeshVertices.toLocaleString()} — ${pct}% fewer`,
  ].join(' ');
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
        <dt>Macro base</dt>
        <dd>${fmt(stats.macroVertices)} verts</dd>
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
      · macro ${stats.macroBaseCells}×${stats.macroBaseCells} @ ${stats.macroStepM.toFixed(2)} m
      · detail ring ${stats.detailRadiusM} m
    </p>
  `.trim();
}
