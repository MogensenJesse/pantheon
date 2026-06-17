// src/world/terrain/lod/terrainLodStats.ts — clipmap vertex counts vs full finest-mesh baseline
import type { BufferGeometry, Mesh } from 'three';
import type { TerrainLodConfig } from './terrainLodRings';

export interface TerrainLodVertexStats {
  /** Player-follow center patch (surface + perimeter skirts). */
  centerVertices: number;
  /** World-fixed macro base. */
  macroVertices: number;
  /** All visible clipmap draw meshes combined. */
  clipmapTotalVertices: number;
  /** Hypothetical full-map finest-grid single mesh (comparison baseline). */
  legacyFullMeshVertices: number;
  /** Percent reduction vs baseline (0–100). */
  savingsPercent: number;
  centerCells: number;
  macroBaseCells: number;
  baseStepM: number;
  macroStepM: number;
  detailRadiusM: number;
}

function geometryVertexCount(geometry: BufferGeometry): number {
  return geometry.getAttribute('position').count;
}

function meshVertexCount(mesh: Mesh): number {
  return geometryVertexCount(mesh.geometry);
}

export function legacyTerrainMeshVertexCount(finestSegments: number): number {
  return (finestSegments + 1) ** 2;
}

export function buildTerrainLodVertexStats(
  macroBaseMesh: Mesh,
  detailMeshes: Mesh[],
  config: TerrainLodConfig,
  baseStep: number,
  finestSegments: number,
): TerrainLodVertexStats {
  const macroVertices = meshVertexCount(macroBaseMesh);
  const centerVertices = detailMeshes.reduce((sum, mesh) => sum + meshVertexCount(mesh), 0);
  const clipmapTotalVertices = macroVertices + centerVertices;
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
    baseStepM: baseStep,
    macroStepM: baseStep * config.macroStepMul,
    detailRadiusM: config.detailRadiusM,
  };
}

export function formatTerrainLodVertexStats(stats: TerrainLodVertexStats): string {
  const pct = stats.savingsPercent.toFixed(1);
  return [
    `clipmap ${stats.clipmapTotalVertices.toLocaleString()} verts`,
    `(center ${stats.centerVertices.toLocaleString()}, macro ${stats.macroVertices.toLocaleString()})`,
    `vs full finest mesh ${stats.legacyFullMeshVertices.toLocaleString()} — ${pct}% fewer`,
  ].join(' ');
}

export function formatTerrainLodVertexStatsHtml(stats: TerrainLodVertexStats): string {
  const pct = stats.savingsPercent.toFixed(1);
  const fmt = (n: number) => n.toLocaleString();
  return `
    <dl class="dev-lod-stats">
      <div class="dev-lod-stats-row">
        <dt>Center detail</dt>
        <dd>${fmt(stats.centerVertices)} verts</dd>
      </div>
      <div class="dev-lod-stats-row">
        <dt>Macro base</dt>
        <dd>${fmt(stats.macroVertices)} verts</dd>
      </div>
      <div class="dev-lod-stats-row dev-lod-stats-total">
        <dt>Clipmap total</dt>
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
      Center ${stats.centerCells}×${stats.centerCells} @ ${stats.baseStepM.toFixed(2)} m
      · macro ${stats.macroBaseCells}×${stats.macroBaseCells} @ ${stats.macroStepM.toFixed(2)} m
      · detail circle ${stats.detailRadiusM} m
    </p>
  `.trim();
}
