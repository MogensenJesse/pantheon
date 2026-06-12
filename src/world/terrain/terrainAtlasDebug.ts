// src/world/terrain/terrainAtlasDebug.ts — DEV atlas placement + shader UV report
import type { Texture } from 'three';
import { VISUAL } from '../../config/visualTuning';
import { WORLD } from '../WorldConfig';
import {
  readTexturePixelSize,
  TERRAIN_ATLAS_BIOME_INDEX,
  TERRAIN_ATLAS_COLS,
  TERRAIN_ATLAS_DISP_TILE_PX,
  TERRAIN_ATLAS_GUTTER_PX,
  TERRAIN_ATLAS_ROWS,
  TERRAIN_ATLAS_SURF_TILE_PX,
} from './terrainMapAtlas';
import type { TerrainGltfFolder } from './terrainTextureManifest';

export interface TerrainMapUrls {
  color: string | null;
  normal: string | null;
  mr: string | null;
  spec: string | null;
  displacement: string | null;
}

export interface TerrainBiomeLoadRecord {
  biome: TerrainGltfFolder;
  slotIndex: number;
  urls: TerrainMapUrls;
  sourcePixels: {
    color: { width: number; height: number };
    normal: { width: number; height: number };
    orm: { width: number; height: number };
    spec: { width: number; height: number };
    displacement: { width: number; height: number };
  };
  flags: {
    hasRealDisplacement: boolean;
    colorFallback: boolean;
    dispFallback: boolean;
  };
}

export interface AtlasSlotPlacementPx {
  destX: number;
  destY: number;
  destW: number;
  destH: number;
  atlasWidth: number;
  atlasHeight: number;
  normUv: { u0: number; v0: number; u1: number; v1: number };
  source: { width: number; height: number };
  stretch: { scaleX: number; scaleY: number };
}

export interface AtlasKindReport {
  kind: 'color' | 'normal' | 'orm' | 'spec' | 'disp';
  tileW: number;
  tileH: number;
  atlasWidth: number;
  atlasHeight: number;
  generateMipmaps: boolean;
  slots: Record<TerrainGltfFolder, AtlasSlotPlacementPx>;
}

export interface TerrainAtlasBuildReport {
  grid: { cols: number; rows: number };
  biomes: TerrainBiomeLoadRecord[];
  atlases: {
    color: AtlasKindReport;
    normal: AtlasKindReport;
    orm: AtlasKindReport;
    spec: AtlasKindReport;
    disp: AtlasKindReport;
  };
  parity: {
    /** Surface (2048) and disp (1024) atlases are packed separately by design. */
    separateDispAtlas: boolean;
    colorVsDispTileSizeMatch: boolean;
    colorTile: { w: number; h: number };
    dispTile: { w: number; h: number };
    /** Same source→dest stretch on path (world UV aligns via shared tileRepeat). */
    pathStretchMatch: boolean;
    pathColorDest: AtlasSlotPlacementPx;
    pathDispDest: AtlasSlotPlacementPx;
  };
  shaderSampling: {
    worldSize: number;
    tileUvFormula: string;
    atlasUvFormula: string;
    perBiome: Record<
      TerrainGltfFolder,
      { slotIndex: number; tileRepeat: number; detailDisplacement: number }
    >;
  };
}

const BIOME_BY_SLOT: TerrainGltfFolder[] = [
  'shore',
  'forest',
  'hills',
  'mountain',
  'path',
  'meadow',
  'snow',
];

function unifiedAtlasTileSize(layerSets: Texture[][]): { tileW: number; tileH: number } {
  const flat = layerSets.flat();
  return {
    tileW: Math.max(1, ...flat.map((t) => readTexturePixelSize(t).width)),
    tileH: Math.max(1, ...flat.map((t) => readTexturePixelSize(t).height)),
  };
}

function slotPlacement(
  slotIndex: number,
  tileW: number,
  tileH: number,
  gutter: number,
  source: Texture,
): AtlasSlotPlacementPx {
  const col = slotIndex % TERRAIN_ATLAS_COLS;
  const row = Math.floor(slotIndex / TERRAIN_ATLAS_COLS);
  const cellW = tileW + gutter * 2;
  const cellH = tileH + gutter * 2;
  const atlasWidth = cellW * TERRAIN_ATLAS_COLS;
  const atlasHeight = cellH * TERRAIN_ATLAS_ROWS;
  const destX = col * cellW + gutter;
  const destY = row * cellH + gutter;
  const { width: srcW, height: srcH } = readTexturePixelSize(source);

  return {
    destX,
    destY,
    destW: tileW,
    destH: tileH,
    atlasWidth,
    atlasHeight,
    normUv: {
      u0: destX / atlasWidth,
      v0: destY / atlasHeight,
      u1: (destX + tileW) / atlasWidth,
      v1: (destY + tileH) / atlasHeight,
    },
    source: { width: srcW, height: srcH },
    stretch: { scaleX: tileW / srcW, scaleY: tileH / srcH },
  };
}

function buildAtlasKindReport(
  kind: AtlasKindReport['kind'],
  layers: Texture[],
  tileW: number,
  tileH: number,
  gutter: number,
  generateMipmaps: boolean,
): AtlasKindReport {
  const cellW = tileW + gutter * 2;
  const cellH = tileH + gutter * 2;
  const slots = {} as Record<TerrainGltfFolder, AtlasSlotPlacementPx>;

  for (let i = 0; i < BIOME_BY_SLOT.length; i++) {
    const biome = BIOME_BY_SLOT[i];
    if (biome && i < layers.length) {
      slots[biome] = slotPlacement(i, tileW, tileH, gutter, layers[i]);
    }
  }

  return {
    kind,
    tileW,
    tileH,
    atlasWidth: cellW * TERRAIN_ATLAS_COLS,
    atlasHeight: cellH * TERRAIN_ATLAS_ROWS,
    generateMipmaps,
    slots,
  };
}

function neighborSlots(slotIndex: number): Record<string, number | null> {
  const col = slotIndex % TERRAIN_ATLAS_COLS;
  const row = Math.floor(slotIndex / TERRAIN_ATLAS_COLS);
  const at = (c: number, r: number) =>
    c >= 0 && c < TERRAIN_ATLAS_COLS && r >= 0 && r < TERRAIN_ATLAS_ROWS ? r * TERRAIN_ATLAS_COLS + c : null;

  return {
    north: at(col, row - 1),
    south: at(col, row + 1),
    west: at(col - 1, row),
    east: at(col + 1, row),
  };
}

function stretchMatch(a: AtlasSlotPlacementPx, b: AtlasSlotPlacementPx): boolean {
  const eps = 0.001;
  return (
    Math.abs(a.stretch.scaleX - b.stretch.scaleX) < eps &&
    Math.abs(a.stretch.scaleY - b.stretch.scaleY) < eps
  );
}

/** DEV: build a full placement report before source textures are disposed. */
export function buildTerrainAtlasDebugReport(
  loadRecords: TerrainBiomeLoadRecord[],
  layers: {
    color: Texture[];
    normal: Texture[];
    orm: Texture[];
    spec: Texture[];
    displacement: Texture[];
  },
): TerrainAtlasBuildReport {
  const surfTile = unifiedAtlasTileSize([
    layers.color,
    layers.normal,
    layers.orm,
    layers.spec,
  ]);
  const surfW = surfTile.tileW;
  const surfH = surfTile.tileH;
  const dispW = TERRAIN_ATLAS_DISP_TILE_PX;
  const dispH = TERRAIN_ATLAS_DISP_TILE_PX;
  const gutter = TERRAIN_ATLAS_GUTTER_PX;

  const colorReport = buildAtlasKindReport('color', layers.color, surfW, surfH, gutter, true);
  const dispReport = buildAtlasKindReport('disp', layers.displacement, dispW, dispH, gutter, false);

  const pathColor = colorReport.slots.path;
  const pathDisp = dispReport.slots.path;

  const perBiome = {} as TerrainAtlasBuildReport['shaderSampling']['perBiome'];
  for (const biome of BIOME_BY_SLOT) {
    const tune = VISUAL.terrain.biomes[biome];
    perBiome[biome] = {
      slotIndex: TERRAIN_ATLAS_BIOME_INDEX[biome],
      tileRepeat: tune.tileRepeat,
      detailDisplacement: tune.detailDisplacement,
    };
  }

  return {
    grid: { cols: TERRAIN_ATLAS_COLS, rows: TERRAIN_ATLAS_ROWS },
    biomes: loadRecords,
    atlases: {
      color: colorReport,
      normal: buildAtlasKindReport('normal', layers.normal, surfW, surfH, gutter, true),
      orm: buildAtlasKindReport('orm', layers.orm, surfW, surfH, gutter, true),
      spec: buildAtlasKindReport('spec', layers.spec, surfW, surfH, gutter, true),
      disp: dispReport,
    },
    parity: {
      separateDispAtlas: surfW !== dispW || surfH !== dispH,
      colorVsDispTileSizeMatch:
        colorReport.tileW === dispReport.tileW && colorReport.tileH === dispReport.tileH,
      colorTile: { w: colorReport.tileW, h: colorReport.tileH },
      dispTile: { w: dispReport.tileW, h: dispReport.tileH },
      pathStretchMatch: pathColor && pathDisp ? stretchMatch(pathColor, pathDisp) : false,
      pathColorDest: pathColor,
      pathDispDest: pathDisp,
    },
    shaderSampling: {
      worldSize: WORLD.SIZE,
      tileUvFormula: 'tileUv = worldXZ * tileRepeat (macro undisplaced XZ from vertex)',
      atlasUvFormula:
        `surface atlasUv uses ${TERRAIN_ATLAS_SURF_TILE_PX}px inset; disp atlasUv uses ${TERRAIN_ATLAS_DISP_TILE_PX}px inset (same tileUv)`,
      perBiome,
    },
  };
}

function formatSlotLine(biome: TerrainGltfFolder, slot: AtlasSlotPlacementPx, kind: string): string {
  return [
    `${biome} [${kind}]`,
    `  src ${slot.source.width}×${slot.source.height}`,
    `  → atlas px (${slot.destX},${slot.destY}) ${slot.destW}×${slot.destH}`,
    `  norm UV [${slot.normUv.u0.toFixed(4)},${slot.normUv.v0.toFixed(4)}]–[${slot.normUv.u1.toFixed(4)},${slot.normUv.v1.toFixed(4)}]`,
    `  stretch ${slot.stretch.scaleX.toFixed(3)}×${slot.stretch.scaleY.toFixed(3)}`,
  ].join('\n');
}

/** DEV: log + attach `window.__pantheonTerrainAtlas`. */
export function publishTerrainAtlasDebugReport(report: TerrainAtlasBuildReport): void {
  const pathRecord = report.biomes.find((b) => b.biome === 'path');
  const pathNeighbors = neighborSlots(TERRAIN_ATLAS_BIOME_INDEX.path);

  console.group('[terrain] atlas placement report (DEV)');
  console.info('Grid 3×3 — slot order: shore, forest, hills, mountain, path, meadow, snow');
  console.info(
    `Surface atlas ${report.atlases.color.tileW}×${report.atlases.color.tileH} inner → ${report.atlases.color.atlasWidth}×${report.atlases.color.atlasHeight} canvas (mips=${report.atlases.color.generateMipmaps})`,
  );
  console.info(
    `Disp atlas ${report.atlases.disp.tileW}×${report.atlases.disp.tileH} inner → ${report.atlases.disp.atlasWidth}×${report.atlases.disp.atlasHeight} canvas (mips=${report.atlases.disp.generateMipmaps})`,
  );
  if (report.parity.separateDispAtlas) {
    console.info('Separate disp atlas: expected (1024 disp + 2048 surface)');
  }
  console.info(
    `Path stretch parity (color vs disp): ${report.parity.pathStretchMatch ? 'MATCH' : 'MISMATCH'}`,
  );

  if (pathRecord) {
    console.group('path — source URLs');
    console.info('color:', pathRecord.urls.color);
    console.info('displacement:', pathRecord.urls.displacement);
    console.info('neighbors (slot index):', pathNeighbors);
    console.groupEnd();
  }

  console.group('path — pixel placement');
  console.info(formatSlotLine('path', report.parity.pathColorDest, 'color'));
  console.info(formatSlotLine('path', report.parity.pathDispDest, 'disp'));
  console.groupEnd();

  console.group('shader detail UV (shared tileUv; separate surface/disp atlas inset)');
  console.info(report.shaderSampling.tileUvFormula);
  console.info(report.shaderSampling.atlasUvFormula);
  console.info('worldSize:', report.shaderSampling.worldSize);
  console.table(
    Object.fromEntries(
      Object.entries(report.shaderSampling.perBiome).map(([biome, v]) => [
        biome,
        {
          slot: v.slotIndex,
          tileRepeat: v.tileRepeat,
          detailDisp: v.detailDisplacement,
          metersPerTile: (1 / v.tileRepeat).toFixed(2),
        },
      ]),
    ),
  );
  console.groupEnd();

  const tableRows = report.biomes.map((r) => {
    const c = report.atlases.color.slots[r.biome];
    const d = report.atlases.disp.slots[r.biome];
    return {
      biome: r.biome,
      slot: r.slotIndex,
      colorSrc: `${r.sourcePixels.color.width}×${r.sourcePixels.color.height}`,
      dispSrc: `${r.sourcePixels.displacement.width}×${r.sourcePixels.displacement.height}`,
      colorDest: c ? `(${c.destX},${c.destY})` : '—',
      dispDest: d ? `(${d.destX},${d.destY})` : '—',
      destMatch: c && d ? c.destX === d.destX && c.destY === d.destY : false,
      realDisp: r.flags.hasRealDisplacement,
    };
  });
  console.table(tableRows);

  console.info('Full report: window.__pantheonTerrainAtlas');
  console.groupEnd();

  (globalThis as typeof globalThis & { __pantheonTerrainAtlas?: TerrainAtlasBuildReport }).__pantheonTerrainAtlas =
    report;
}
