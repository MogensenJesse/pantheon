// src/world/AssetScatterer.ts
import {
  BufferGeometry,
  DoubleSide,
  Euler,
  InstancedMesh,
  Matrix4,
  Material,
  Mesh,
  Object3D,
  Quaternion,
  Scene,
  Texture,
  Vector3,
} from 'three';
import alea from 'alea';
import {
  ASSET_MANIFEST,
  GRASS_ACCENT_VARIANTS,
  GRASS_COVER_VARIANTS,
  GRASS_GLB_KEY,
  LIVING_TREE_ENTRIES,
  type AssetRegistry,
  type GrassVariantEntry,
  type ScatterAssetEntry,
} from '../assets/assetManifest';
import { PHASE0 } from '../config/phase0';
import { devSettings } from '../core/GameState';
import { ensureGeometryUv } from '../rendering/ensureGeometryUv';
import { applyGrassMaterial, getGrassMaterial, initGrassMaterial } from './grass/grassMaterial';
import {
  GRASS_BIOME_BANDS,
  createPlacementGrid,
  type GrassPlacement,
} from './grass/grassBiomeDensity';
import {
  countResolvedGrassMeshes,
  extractGrassDiffuseMap,
  getGrassPrototype,
} from './grass/grassPrototype';
import { distanceToJourneyPath, sampleBesideJourney } from './JourneyPath';
import { WORLD, LANDMARK_XZ_POSITIONS } from './WorldConfig';
import type { TerrainContext } from './TerrainGenerator';

interface Placement {
  x: number;
  z: number;
  yRotation: number;
  scale: number;
  instanceIndex: number;
}

interface PlacementRules {
  count: number;
  heightMin: number;
  heightMax: number;
  minSpacing: number;
  landmarkClearance: number;
  scaleMin: number;
  scaleMax: number;
  surfaceLift?: number;
  /** When set, placements are confined to this disk (denser toward center). */
  region?: { centerX: number; centerZ: number; radius: number };
  /** When set, placements stay in the corridor beside the painted path. */
  pathCorridor?: boolean;
  /** Override default path centreline clearance (metres). */
  pathExclusionRadius?: number;
}

interface ScatterConfig extends PlacementRules {
  entries: readonly ScatterAssetEntry[];
}

interface GrassScatterConfig extends PlacementRules {
  entries: readonly GrassVariantEntry[];
}

interface InstancedGroup {
  mesh: InstancedMesh;
  placements: Placement[];
  surfaceLift: number;
  isGrass?: boolean;
  /** World XZ center of the spatial cull cell (grass only). */
  cullCenterX?: number;
  cullCenterZ?: number;
}

interface GrassCellBucket {
  centerX: number;
  centerZ: number;
  placements: Placement[];
}

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

const _matrix = new Matrix4();
const _pos = new Vector3();
const _quat = new Quaternion();
const _scl = new Vector3();
const _euler = new Euler();

function tooClose(x: number, z: number, list: Placement[], minSpacing: number): boolean {
  const minSq = minSpacing * minSpacing;
  for (const p of list) {
    const dx = p.x - x;
    const dz = p.z - z;
    if (dx * dx + dz * dz < minSq) return true;
  }
  return false;
}

function tooCloseLandmarks(x: number, z: number, clearance: number): boolean {
  const minSq = clearance * clearance;
  for (const [lx, lz] of LANDMARK_XZ_POSITIONS) {
    const dx = lx - x;
    const dz = lz - z;
    if (dx * dx + dz * dz < minSq) return true;
  }
  return false;
}

function tooCloseToPath(x: number, z: number, exclusionRadius: number): boolean {
  return distanceToJourneyPath(x, z) < exclusionRadius;
}

function pickWeighted<T extends { weight: number }>(entries: readonly T[], rng: () => number): T {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return entries[entries.length - 1];
}

function extractMeshes(modelScene: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  modelScene.traverse((c) => {
    const m = c as Mesh;
    if (m.isMesh) meshes.push(m);
  });
  if (meshes.length === 0) throw new Error('GLTF has no mesh');
  return meshes;
}

function cloneScatterMaterial(base: Material): Material {
  const mat = base.clone();
  mat.side = DoubleSide;
  const std = mat as Material & { map?: Texture | null; alphaTest?: number };
  if (std.map) {
    // alphaTest on the main material is enough — the WebGPU renderer auto-derives
    // a depth/shadow pass from it. A plain MeshDepthMaterial as customDepthMaterial
    // is *not* a node material and silently fails to populate the shadow map for
    // instanced trees/rocks under WebGPU.
    std.alphaTest = 0.2;
    std.transparent = false;
    std.depthWrite = true;
  }
  return mat;
}

/** Clone all materials — living trees use bark + leaves (multi-material meshes). */
function prepareScatterMaterials(material: Material | Material[]): Material | Material[] {
  if (Array.isArray(material)) {
    return material.map((m) => cloneScatterMaterial(m));
  }
  return cloneScatterMaterial(material);
}

function writeInstanceMatrix(
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

function scatterPlacements(
  config: PlacementRules,
  terrain: TerrainContext,
  rng: () => number,
): Placement[] {
  const globalPlacements: Placement[] = [];
  let attempts = 0;

  const pathExclusion =
    config.pathExclusionRadius ?? WORLD.JOURNEY.PATH_EXCLUSION_RADIUS;
  const attemptLimit =
    config.count * (config.pathCorridor ? 70 : config.region ? 50 : 30);

  while (globalPlacements.length < config.count && attempts < attemptLimit) {
    attempts++;
    let x: number;
    let z: number;
    if (config.pathCorridor) {
      const p = sampleBesideJourney(
        rng,
        pathExclusion,
        WORLD.JOURNEY.PATH_HALF_WIDTH,
      );
      x = p.x;
      z = p.z;
    } else if (config.region) {
      const { centerX, centerZ, radius } = config.region;
      const angle = rng() * Math.PI * 2;
      const dist = radius * Math.pow(rng(), 0.55);
      x = centerX + Math.cos(angle) * dist;
      z = centerZ + Math.sin(angle) * dist;
    } else {
      x = (rng() - 0.5) * WORLD.SIZE * 0.9;
      z = (rng() - 0.5) * WORLD.SIZE * 0.9;
    }
    const h = terrain.getHeightAt(x, z);

    if (h < config.heightMin || h > config.heightMax) continue;
    if (tooClose(x, z, globalPlacements, config.minSpacing)) continue;
    if (tooCloseLandmarks(x, z, config.landmarkClearance)) continue;
    if (!config.pathCorridor && tooCloseToPath(x, z, pathExclusion)) continue;

    globalPlacements.push({
      x,
      z,
      yRotation: rng() * Math.PI * 2,
      scale: config.scaleMin + rng() * (config.scaleMax - config.scaleMin),
      instanceIndex: globalPlacements.length,
    });
  }

  return globalPlacements;
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

function distributePlacements<T extends { key: string; weight: number }>(
  globalPlacements: Placement[],
  entries: readonly T[],
  rng: () => number,
): { entry: T; placements: Placement[] }[] {
  const byKey = new Map<string, { entry: T; placements: Placement[] }>();

  for (const placement of globalPlacements) {
    const entry = pickWeighted(entries, rng);
    if (!byKey.has(entry.key)) {
      byKey.set(entry.key, { entry, placements: [] });
    }
    const group = byKey.get(entry.key)!;
    placement.instanceIndex = group.placements.length;
    group.placements.push(placement);
  }

  return [...byKey.values()];
}

function scatter<T extends { key: string; weight: number }>(
  config: PlacementRules,
  terrain: TerrainContext,
  rng: () => number,
  entries: readonly T[],
): { entry: T; placements: Placement[] }[] {
  const globalPlacements = scatterPlacements(config, terrain, rng);
  return distributePlacements(globalPlacements, entries, rng);
}

function buildInstancedMeshes(
  modelScene: Object3D,
  placements: Placement[],
  terrain: TerrainContext,
  surfaceLift: number,
): InstancedMesh[] {
  const srcMeshes = extractMeshes(modelScene);
  const result: InstancedMesh[] = [];

  for (const srcMesh of srcMeshes) {
    const geometry = srcMesh.geometry.clone();
    ensureGeometryUv(geometry);
    const materials = prepareScatterMaterials(srcMesh.material);
    const instanced = new InstancedMesh(geometry, materials, placements.length);
    instanced.castShadow = false;
    instanced.receiveShadow = false;

    placements.forEach((p, i) => {
      writeInstanceMatrix(instanced, i, p, terrain, surfaceLift);
    });

    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
    result.push(instanced);
  }

  return result;
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
    writeInstanceMatrix(instanced, i, p, terrain, surfaceLift);
  });

  instanced.instanceMatrix.needsUpdate = true;
  instanced.computeBoundingSphere();
  return [instanced];
}

function scatterGrassIntoScene(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
  groups: InstancedGroup[],
  geometryCache: Map<string, BufferGeometry>,
  rng: () => number,
): void {
  const g = devSettings.grass;
  const surfaceLift = PHASE0.GRASS.SURFACE_LIFT;
  const grassConfigs: GrassScatterConfig[] = [
    {
      entries: GRASS_COVER_VARIANTS,
      count: Math.round(g.coverCount * g.densityMul),
      heightMin: g.coverHeightMin,
      heightMax: g.coverHeightMax,
      minSpacing: g.coverMinSpacing,
      landmarkClearance: 4,
      scaleMin: g.coverScaleMin,
      scaleMax: g.coverScaleMax,
      surfaceLift,
    },
    {
      entries: GRASS_ACCENT_VARIANTS,
      count: Math.round(g.accentCount * g.densityMul),
      heightMin: g.accentHeightMin,
      heightMax: g.accentHeightMax,
      minSpacing: g.accentMinSpacing,
      landmarkClearance: 5,
      scaleMin: g.accentScaleMin,
      scaleMax: g.accentScaleMax,
      surfaceLift,
    },
  ];

  let totalInstances = 0;
  let meshGroups = 0;

  for (const config of grassConfigs) {
    const globalPlacements = scatterGrassPlacements(config, terrain, rng);
    const label = config.entries[0]?.class ?? 'grass';
    const targetTotal = Math.round(
      config.count *
        GRASS_BIOME_BANDS.reduce((s, b) => s + b.countShare, 0),
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

export interface AssetScatterer {
  groups: InstancedGroup[];
  dispose: () => void;
  rebuildGrass: () => void;
  updateGrassCull: (playerX: number, playerZ: number) => void;
}

function updateGrassDistanceCull(groups: InstancedGroup[], playerX: number, playerZ: number): void {
  const cutSq = PHASE0.GRASS.DISTANCE_CUT * PHASE0.GRASS.DISTANCE_CUT;
  for (const group of groups) {
    if (!group.isGrass || group.cullCenterX === undefined || group.cullCenterZ === undefined) continue;
    const dx = group.cullCenterX - playerX;
    const dz = group.cullCenterZ - playerZ;
    group.mesh.visible = dx * dx + dz * dz <= cutSq;
  }
}

export function buildAssetScatterer(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
): AssetScatterer {
  const rng = alea(`${WORLD.SEED}-scatter`);
  const grassRng = alea(`${WORLD.SEED}-grass`);
  const groups: InstancedGroup[] = [];
  const grassGeometryCache = new Map<string, BufferGeometry>();

  const grassRoot = assets.get(GRASS_GLB_KEY);
  if (grassRoot) {
    const diffuse = extractGrassDiffuseMap(grassRoot, GRASS_COVER_VARIANTS[0].meshName);
    initGrassMaterial(diffuse);
    const names = [
      ...GRASS_COVER_VARIANTS.map((v) => v.meshName),
      ...GRASS_ACCENT_VARIANTS.map((v) => v.meshName),
    ];
    const resolved = countResolvedGrassMeshes(assets, GRASS_GLB_KEY, names);
    if (import.meta.env.DEV) {
      console.info(`[grass] GLB prototypes resolved: ${resolved}/${names.length}`);
    }
  } else if (import.meta.env.DEV) {
    console.warn('[grass] GLB not loaded — grass scatter skipped');
  }

  const [forestCx, forestCz] = WORLD.FOREST_CLUSTER.center;
  const forestR = WORLD.FOREST_CLUSTER.radius;

  const configs: ScatterConfig[] = [
    {
      entries: LIVING_TREE_ENTRIES,
      count: PHASE0.SCATTER.TREE_PATH_COUNT,
      heightMin: 0.42,
      heightMax: 1.1,
      minSpacing: 3,
      landmarkClearance: 6,
      scaleMin: 0.85,
      scaleMax: 1.25,
      pathCorridor: true,
    },
    {
      entries: LIVING_TREE_ENTRIES,
      count: PHASE0.SCATTER.TREE_OPEN_COUNT,
      heightMin: 0.42,
      heightMax: 1.1,
      minSpacing: 4,
      landmarkClearance: 8,
      scaleMin: 0.8,
      scaleMax: 1.15,
    },
    {
      entries: LIVING_TREE_ENTRIES,
      count: PHASE0.SCATTER.TREE_FOREST_COUNT,
      heightMin: 0.42,
      heightMax: 1.1,
      minSpacing: 3.0,
      landmarkClearance: 5,
      scaleMin: 0.7,
      scaleMax: 1.25,
      region: { centerX: forestCx, centerZ: forestCz, radius: forestR },
    },
    {
      entries: ASSET_MANIFEST.plants.filter((p) => p.key === 'fern' || p.key === 'plant_1'),
      count: PHASE0.SCATTER.FOREST_UNDERSTORY_COUNT,
      heightMin: 0.42,
      heightMax: 1.05,
      minSpacing: 1.2,
      landmarkClearance: 4,
      scaleMin: 0.35,
      scaleMax: 0.85,
      surfaceLift: 0.05,
      region: { centerX: forestCx, centerZ: forestCz, radius: forestR * 0.92 },
    },
    {
      entries: ASSET_MANIFEST.rocks.filter((r) => r.biome === 'HILLS'),
      count: PHASE0.SCATTER.HILL_ROCKS_COUNT,
      heightMin: 1.1,
      heightMax: 1.9,
      minSpacing: 4,
      landmarkClearance: 6,
      scaleMin: 0.7,
      scaleMax: 1.1,
    },
    {
      entries: ASSET_MANIFEST.plants,
      count: PHASE0.SCATTER.SHORE_PLANTS_COUNT,
      heightMin: 0.08,
      heightMax: 0.42,
      minSpacing: 2,
      landmarkClearance: 5,
      scaleMin: 0.9,
      scaleMax: 1.2,
    },
    {
      entries: ASSET_MANIFEST.rocks.filter((r) => r.biome === 'MOUNTAIN'),
      count: PHASE0.SCATTER.MOUNTAIN_ROCKS_COUNT,
      heightMin: 1.9,
      heightMax: 2.5,
      minSpacing: 5,
      landmarkClearance: 6,
      scaleMin: 0.6,
      scaleMax: 1.0,
    },
  ];

  const treeKeys = new Set<string>(ASSET_MANIFEST.trees.map((t) => t.key));
  const rockKeys = new Set<string>(ASSET_MANIFEST.rocks.map((r) => r.key));

  if (grassRoot) {
    scatterGrassIntoScene(scene, assets, terrain, groups, grassGeometryCache, grassRng);
  }

  for (const config of configs) {
    const scattered = scatter(config, terrain, rng, config.entries);
    for (const { entry, placements } of scattered) {
      if (placements.length === 0) continue;
      const model = assets.get(entry.key);
      if (!model) {
        console.warn(`Missing scatter asset: ${entry.key}`);
        continue;
      }
      const meshes = buildInstancedMeshes(
        model,
        placements,
        terrain,
        config.surfaceLift ?? 0,
      );
      const castsShadow = treeKeys.has(entry.key) || rockKeys.has(entry.key);
      for (const mesh of meshes) {
        if (castsShadow) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
        scene.add(mesh);
        groups.push({ mesh, placements, surfaceLift: config.surfaceLift ?? 0 });
      }
    }
  }

  const disposeGroup = (group: InstancedGroup, disposeGrassGeometry: boolean) => {
    scene.remove(group.mesh);
    if (!group.isGrass) {
      group.mesh.geometry.dispose();
    } else if (disposeGrassGeometry) {
      group.mesh.geometry.dispose();
    }
    if (!group.isGrass) {
      const mats = Array.isArray(group.mesh.material)
        ? group.mesh.material
        : [group.mesh.material];
      for (const m of mats) {
        const depth = (m as Material & { customDepthMaterial?: Material }).customDepthMaterial;
        depth?.dispose();
        m.dispose();
      }
    }
  };

  const dispose = () => {
    for (const group of groups) disposeGroup(group, true);
    for (const geo of grassGeometryCache.values()) geo.dispose();
    grassGeometryCache.clear();
    groups.length = 0;
  };

  const rebuildGrass = () => {
    if (!grassRoot) return;
    for (let i = groups.length - 1; i >= 0; i--) {
      if (groups[i].isGrass) {
        disposeGroup(groups[i], false);
        groups.splice(i, 1);
      }
    }
    devSettings.grass.dirty = false;
    scatterGrassIntoScene(
      scene,
      assets,
      terrain,
      groups,
      grassGeometryCache,
      alea(`${WORLD.SEED}-grass-rebuild`),
    );
  };

  const updateGrassCull = (playerX: number, playerZ: number) => {
    updateGrassDistanceCull(groups, playerX, playerZ);
  };

  return { groups, dispose, rebuildGrass, updateGrassCull };
}
