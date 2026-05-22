// src/world/grass/GrassCoverage.ts — density grid + chunked instanced blades
import { InstancedMesh, Scene } from 'three';
import { devSettings } from '../../core/GameState';
import { PHASE0 } from '../../config/phase0';
import { WORLD } from '../WorldConfig';
import type { TerrainContext } from '../TerrainGenerator';
import {
  buildGrassBladeInstancedMesh,
  disposeGrassBladeShared,
  type GrassBladeInstance,
} from './GrassBlade';
import { sampleGrassCoverageDensity } from './grassCoverageRules';
import {
  bladeCountForCellAt,
  cellHash,
  GRASS_CELL_SIZE,
  GRASS_WORLD_MIN,
  jitterInCell,
} from './grassPlacement';

const { GRASS: G } = PHASE0;

interface GrassChunk {
  cx: number;
  cz: number;
  mesh: InstancedMesh;
}

export class GrassCoverage {
  readonly gridRes = G.GRID_RES;
  readonly chunkSize = G.CHUNK_SIZE;
  private densityGrid: Float32Array;
  private chunks = new Map<string, GrassChunk>();

  constructor(
    private scene: Scene,
    private terrain: TerrainContext,
  ) {
    this.densityGrid = new Float32Array(this.gridRes * this.gridRes);
  }

  fillFromTerrain(): void {
    const scale = devSettings.grass.globalDensityScale * PHASE0.GRASS.DENSITY_SCALE;
    for (let j = 0; j < this.gridRes; j++) {
      for (let i = 0; i < this.gridRes; i++) {
        const { x, z } = jitterInCell(i, j, 0);
        const h = this.terrain.getHeightAt(x, z);
        const slopeY = sampleTerrainSlopeY(this.terrain, x, z);
        const idx = j * this.gridRes + i;
        this.densityGrid[idx] = sampleGrassCoverageDensity(x, z, h, slopeY, scale);
      }
    }
    if (import.meta.env.DEV) {
      let sum = 0;
      let active = 0;
      for (let i = 0; i < this.densityGrid.length; i++) {
        const d = this.densityGrid[i];
        sum += d;
        if (d >= G.DENSITY_THRESHOLD) active++;
      }
      console.info('[GrassCoverage] fillFromTerrain', {
        avgDensity: (sum / this.densityGrid.length).toFixed(3),
        activeCells: active,
        gridRes: this.gridRes,
      });
    }
    this.rebuildChunks();
  }

  /** Editor brush — stub for a later pass. */
  paintBrush(_x: number, _z: number, _radius: number, _delta: number): void {
    // deferred
  }

  rebuildChunks(_dirtyBounds?: { xMin: number; xMax: number; zMin: number; zMax: number }): void {
    this.disposeChunks();
    const { maxBladesPerCell, nearRingRadius, nearRingMultiplier } = devSettings.grass;
    const playerX = devSettings.grass.lastPlayerX;
    const playerZ = devSettings.grass.lastPlayerZ;
    const nearR2 = nearRingRadius * nearRingRadius;

    const bladesByChunk = new Map<string, GrassBladeInstance[]>();

    for (let j = 0; j < this.gridRes; j++) {
      for (let i = 0; i < this.gridRes; i++) {
        const density = this.densityGrid[j * this.gridRes + i];
        const cx = Math.floor((GRASS_WORLD_MIN + i * GRASS_CELL_SIZE) / this.chunkSize);
        const cz = Math.floor((GRASS_WORLD_MIN + j * GRASS_CELL_SIZE) / this.chunkSize);
        const cellX = GRASS_WORLD_MIN + (i + 0.5) * GRASS_CELL_SIZE;
        const cellZ = GRASS_WORLD_MIN + (j + 0.5) * GRASS_CELL_SIZE;
        const dx = cellX - playerX;
        const dz = cellZ - playerZ;
        const maxBlades =
          dx * dx + dz * dz < nearR2
            ? maxBladesPerCell * nearRingMultiplier
            : maxBladesPerCell;
        const n = bladeCountForCellAt(i, j, density, maxBlades);
        if (n <= 0) continue;

        const key = chunkKey(cx, cz);
        let list = bladesByChunk.get(key);
        if (!list) {
          list = [];
          bladesByChunk.set(key, list);
        }

        for (let k = 0; k < n; k++) {
          const { x, z } = jitterInCell(i, j, k);
          const h = this.terrain.getHeightAt(x, z);
          if (h < WORLD.BIOMES.WATER.max + 0.01) continue;
          const slopeY = sampleTerrainSlopeY(this.terrain, x, z);
          const d = sampleGrassCoverageDensity(x, z, h, slopeY, 1);
          if (d < G.DENSITY_THRESHOLD) continue;

          const variantRoll = cellHash(i, j, k + 1);
          const isWide = variantRoll < G.BLADE_WIDE_RATIO ? 1 : 0;
          const heightBase =
            G.BLADE_HEIGHT_MIN / G.BLADE_HEIGHT +
            cellHash(j, i, k + 5) * (1 - G.BLADE_HEIGHT_MIN / G.BLADE_HEIGHT);
          const widthBase = 0.75 + cellHash(i, j, k + 7) * 0.5;
          list.push({
            x,
            z,
            yRotation: cellHash(i, j, k + 3) * Math.PI * 2,
            heightScale: isWide
              ? heightBase * G.BLADE_WIDE_HEIGHT_MUL
              : heightBase * (0.85 + cellHash(j, i, k + 9) * 0.3),
            widthScale: isWide ? widthBase * G.BLADE_WIDE_WIDTH_MUL : widthBase,
            bend:
              G.BLADE_BEND_MIN +
              cellHash(i, j, k + 17) * (G.BLADE_BEND_MAX - G.BLADE_BEND_MIN),
            windPhase: cellHash(i, j, k + 11) * Math.PI * 2,
            hueJitter: cellHash(j, i, k + 13) * 2 - 1,
            variant: isWide,
          });
        }
      }
    }

    for (const [key, blades] of bladesByChunk) {
      if (blades.length === 0) continue;
      const [cx, cz] = key.split(',').map(Number);
      const mesh = buildGrassBladeInstancedMesh(blades, this.terrain);
      this.scene.add(mesh);
      this.chunks.set(key, { cx, cz, mesh });
    }

    const total = [...bladesByChunk.values()].reduce((s, b) => s + b.length, 0);
    if (import.meta.env.DEV) {
      console.info('[GrassCoverage] rebuilt', {
        chunks: this.chunks.size,
        blades: total,
        maxBladesPerCell,
        nearRingRadius,
      });
      if (total === 0) {
        console.warn(
          '[GrassCoverage] zero blades — check biome mask, DENSITY_THRESHOLD, or path exclusion',
        );
      }
    }
    devSettings.grass.dirty = false;
  }

  updatePlayerPosition(x: number, z: number): void {
    devSettings.grass.lastPlayerX = x;
    devSettings.grass.lastPlayerZ = z;
  }

  getChunkMeshes(): InstancedMesh[] {
    return [...this.chunks.values()].map((c) => c.mesh);
  }

  serialize(): string {
    return JSON.stringify({ version: 1, grid: Array.from(this.densityGrid) });
  }

  deserialize(_data: string): void {
    // stub for editor persistence
  }

  dispose(): void {
    this.disposeChunks();
    disposeGrassBladeShared();
  }

  private disposeChunks(): void {
    for (const { mesh } of this.chunks.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.chunks.clear();
  }
}

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

function sampleTerrainSlopeY(terrain: TerrainContext, x: number, z: number): number {
  const eps = 0.45;
  const y0 = terrain.getWorldY(x, z);
  const yx = terrain.getWorldY(x + eps, z);
  const yz = terrain.getWorldY(x, z + eps);
  const dx = (yx - y0) / eps;
  const dz = (yz - y0) / eps;
  return 1 / Math.sqrt(dx * dx + 1 + dz * dz);
}

export function createGrassCoverage(scene: Scene, terrain: TerrainContext): GrassCoverage {
  const coverage = new GrassCoverage(scene, terrain);
  coverage.fillFromTerrain();
  return coverage;
}
