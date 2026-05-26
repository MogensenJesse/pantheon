// src/world/grass/grassScatter.ts — grass placement, instancing, and distance cull
import {
  BufferGeometry,
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import {
  GRASS_ACCENT_VARIANTS,
  GRASS_COVER_VARIANTS,
  GRASS_GLB_KEY,
  type AssetRegistry,
  type GrassVariantEntry,
} from '../../assets/assetManifest';
import { PHASE0 } from '../../config/phase0';
import { devSettings } from '../../core/GameState';
import { ensureGeometryUv } from '../../rendering/ensureGeometryUv';
import { tooCloseLandmarks, tooCloseToPath, distributePlacements } from '../scatter/placementEngine';
import type { Placement, PlacementRules, InstancedGroup } from '../scatter/placementTypes';
import { WORLD } from '../WorldConfig';
import type { TerrainContext } from '../TerrainGenerator';
import { applyGrassMaterial, getGrassMaterial } from './grassMaterial';
import {
  GRASS_ACCENT_BAND,
  GRASS_COVER_BAND,
} from './grassDevDefaults';
import {
  GRASS_BIOME_BANDS,
  createPlacementGrid,
  type GrassPlacement,
} from './grassBiomeDensity';
import { getGrassPrototype } from './grassPrototype';

interface GrassScatterConfig extends PlacementRules {
  entries: readonly GrassVariantEntry[];
}

interface GrassCellBucket {
  centerX: number;
  centerZ: number;
  placements: Placement[];
}

const _matrix = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scl = new Vector3();
const _euler = new Euler();

function bucketPlacementsByCell(placements: Placement[], cellSize: number): GrassCellBucket[] {
  const cells = new Map<string, Placement[]>();
  for (const p of placements) {
    const cx = Math.floor(p.x / cellSize);
    const cz = Math.floor(p.z / cellSize);
    const key = `${cx},${cz}`;
    let list = cells.get(key);
    if (!list) {
      list = [];
      cells.set(key, list);
    }
    list.push(p);
  }

  const buckets: GrassCellBucket[] = [];
  for (const [key, list] of cells) {
    const [cx, cz] = key.split(',').map(Number);
    list.forEach((p, i) => {
      p.instanceIndex = i;
    });
    buckets.push({
      centerX: (cx + 0.5) * cellSize,
      centerZ: (cz + 0.5) * cellSize,
      placements: list,
    });
  }
  return buckets;
}

function writeGrassInstanceMatrix(
  mesh: InstancedMesh,
  index: number,
  placement: Placement,
  terrain: TerrainContext,
  surfaceLift: number,
): void {
  const y = terrain.getWorldY(placement.x, placement.z) + surfaceLift;
  _pos.set(placement.x, y, placement.z);
  _euler.set(0, placement.yRotation, 0);
  _quat.setFromEuler(_euler);
  _scl.setScalar(placement.scale);
  _matrix.compose(_pos, _quat, _scl);
  mesh.setMatrixAt(index, _matrix);
}

function scatterGrassPlacements(
  config: PlacementRules,
  terrain: TerrainContext,
  rng: () => number,
): Placement[] {
  const globalPlacements: GrassPlacement[] = [];
  const grid = createPlacementGrid(config.minSpacing);
  const pathExclusion =
    config.pathExclusionRadius ?? WORLD.JOURNEY.PATH_EXCLUSION_RADIUS;

  const bandSummary: Array<{ id: string; placed: number; want: number }> = [];

  for (const band of GRASS_BIOME_BANDS) {
    const bandCount = Math.round(config.count * band.countShare);
    if (bandCount <= 0) continue;

    const hMin = Math.max(config.heightMin, band.hMin);
    const hMax = Math.min(config.heightMax, band.hMax);
    if (hMin >= hMax) continue;

    let bandPlaced = 0;
    let attempts = 0;
    const attemptLimit = bandCount * 50;

    while (bandPlaced < bandCount && attempts < attemptLimit) {
      attempts++;
      const x = (rng() - 0.5) * WORLD.SIZE * 0.9;
      const z = (rng() - 0.5) * WORLD.SIZE * 0.9;
      const h = terrain.getHeightAt(x, z);

      if (h < hMin || h > hMax) continue;
      if (grid.tooClose(x, z, h, config.minSpacing)) continue;
      if (tooCloseLandmarks(x, z, config.landmarkClearance)) continue;
      if (tooCloseToPath(x, z, pathExclusion)) continue;

      const placement: GrassPlacement = {
        x,
        z,
        h,
        yRotation: rng() * Math.PI * 2,
        scale: config.scaleMin + rng() * (config.scaleMax - config.scaleMin),
        instanceIndex: globalPlacements.length,
      };
      globalPlacements.push(placement);
      grid.add(placement);
      bandPlaced++;
    }

    bandSummary.push({ id: band.id, placed: bandPlaced, want: bandCount });
  }

  if (import.meta.env.DEV) {
    const fmt = bandSummary
      .map((b) => `${b.id}=${b.placed}/${b.want}`)
      .join(' ');
    console.info(`[grass] bands → ${fmt}`);
  }

  return globalPlacements;
}

function getGrassGeometry(
  prototype: Mesh,
  meshName: string,
  cache: Map<string, BufferGeometry>,
): BufferGeometry {
  let geometry = cache.get(meshName);
  if (!geometry) {
    geometry = prototype.geometry.clone();
    ensureGeometryUv(geometry);
    cache.set(meshName, geometry);
  }
  return geometry;
}

function buildGrassInstancedMeshes(
  prototype: Mesh,
  meshName: string,
  placements: Placement[],
  terrain: TerrainContext,
  surfaceLift: number,
  geometryCache: Map<string, BufferGeometry>,
): InstancedMesh[] {
  const geometry = getGrassGeometry(prototype, meshName, geometryCache);
  const instanced = new InstancedMesh(geometry, getGrassMaterial(), placements.length);
  applyGrassMaterial(instanced);

  placements.forEach((p, i) => {
    writeGrassInstanceMatrix(instanced, i, p, terrain, surfaceLift);
  });

  instanced.instanceMatrix.needsUpdate = true;
  instanced.computeBoundingSphere();
  return [instanced];
}

function grassScatterConfigs(): GrassScatterConfig[] {
  const g = devSettings.grass;
  const mul = g.scaleMul;
  const surfaceLift = PHASE0.GRASS.SURFACE_LIFT;
  return [
    {
      entries: GRASS_COVER_VARIANTS,
      count: Math.round(PHASE0.SCATTER.GRASS_COVER_COUNT * g.densityMul),
      heightMin: GRASS_COVER_BAND.heightMin,
      heightMax: GRASS_COVER_BAND.heightMax,
      minSpacing: GRASS_COVER_BAND.minSpacing,
      landmarkClearance: 4,
      scaleMin: GRASS_COVER_BAND.scaleMin * mul,
      scaleMax: GRASS_COVER_BAND.scaleMax * mul,
      surfaceLift,
    },
    {
      entries: GRASS_ACCENT_VARIANTS,
      count: Math.round(PHASE0.SCATTER.GRASS_ACCENT_COUNT * g.densityMul),
      heightMin: GRASS_ACCENT_BAND.heightMin,
      heightMax: GRASS_ACCENT_BAND.heightMax,
      minSpacing: GRASS_ACCENT_BAND.minSpacing,
      landmarkClearance: 5,
      scaleMin: GRASS_ACCENT_BAND.scaleMin * mul,
      scaleMax: GRASS_ACCENT_BAND.scaleMax * mul,
      surfaceLift,
    },
  ];
}

export function scatterGrassIntoScene(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
  groups: InstancedGroup[],
  geometryCache: Map<string, BufferGeometry>,
  rng: () => number,
): void {
  const grassConfigs = grassScatterConfigs();
  const surfaceLift = PHASE0.GRASS.SURFACE_LIFT;
  let totalInstances = 0;
  let meshGroups = 0;

  for (const config of grassConfigs) {
    const globalPlacements = scatterGrassPlacements(config, terrain, rng);
    const label = config.entries[0]?.class ?? 'grass';
    const targetTotal = Math.round(
      config.count * GRASS_BIOME_BANDS.reduce((s, b) => s + b.countShare, 0),
    );
    if (import.meta.env.DEV) {
      console.info(
        `[grass] ${label}: ${globalPlacements.length} placements (budget ~${targetTotal} from ${config.count} base)`,
      );
    }
    const scattered = distributePlacements(globalPlacements, config.entries, rng);
    const cellSize = PHASE0.GRASS.CULL_CELL_SIZE;
    for (const { entry, placements } of scattered) {
      if (placements.length === 0) continue;
      try {
        const prototype = getGrassPrototype(assets, GRASS_GLB_KEY, entry.meshName);
        const buckets = bucketPlacementsByCell(placements, cellSize);
        for (const bucket of buckets) {
          const meshes = buildGrassInstancedMeshes(
            prototype,
            entry.meshName,
            bucket.placements,
            terrain,
            config.surfaceLift ?? surfaceLift,
            geometryCache,
          );
          for (const mesh of meshes) {
            scene.add(mesh);
            groups.push({
              mesh,
              placements: bucket.placements,
              surfaceLift: config.surfaceLift ?? surfaceLift,
              isGrass: true,
              cullCenterX: bucket.centerX,
              cullCenterZ: bucket.centerZ,
            });
            totalInstances += bucket.placements.length;
            meshGroups += 1;
          }
        }
      } catch (err) {
        console.warn(`[grass] skip ${entry.meshName}:`, err);
      }
    }
  }

  if (import.meta.env.DEV) {
    console.info(`[grass] scatter complete: ${meshGroups} instanced meshes, ${totalInstances} instances`);
  }
}

export function updateGrassDistanceCull(
  groups: InstancedGroup[],
  playerX: number,
  playerZ: number,
): void {
  const cutSq = PHASE0.GRASS.DISTANCE_CUT * PHASE0.GRASS.DISTANCE_CUT;
  for (const group of groups) {
    if (!group.isGrass || group.cullCenterX === undefined || group.cullCenterZ === undefined) continue;
    const dx = group.cullCenterX - playerX;
    const dz = group.cullCenterZ - playerZ;
    group.mesh.visible = dx * dx + dz * dz <= cutSq;
  }
}

export function disposeGrassGroup(
  scene: Scene,
  group: InstancedGroup,
  disposeGeometry: boolean,
): void {
  scene.remove(group.mesh);
  if (disposeGeometry) {
    group.mesh.geometry.dispose();
  }
}
