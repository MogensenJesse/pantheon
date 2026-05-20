// src/world/AssetScatterer.ts
import {
  DoubleSide,
  Euler,
  InstancedMesh,
  Matrix4,
  Material,
  Mesh,
  MeshDepthMaterial,
  Object3D,
  Quaternion,
  Scene,
  Texture,
  Vector3,
} from 'three';
import alea from 'alea';
import {
  ASSET_MANIFEST,
  LIVING_TREE_ENTRIES,
  type AssetRegistry,
  type ScatterAssetEntry,
} from '../assets/assetManifest';
import { PHASE0 } from '../config/phase0';
import { distanceToJourneyPath, sampleBesideJourney } from './JourneyPath';
import { WORLD, getAllLandmarkXZ } from './WorldConfig';
import type { TerrainContext } from './TerrainGenerator';

export interface Placement {
  x: number;
  z: number;
  yRotation: number;
  scale: number;
  instanceIndex: number;
}

interface ScatterConfig {
  entries: readonly ScatterAssetEntry[];
  count: number;
  heightMin: number;
  heightMax: number;
  minSpacing: number;
  landmarkClearance: number;
  scaleMin: number;
  scaleMax: number;
  surfaceLift?: number;
  grass?: boolean;
  /** When set, placements are confined to this disk (denser toward center). */
  region?: { centerX: number; centerZ: number; radius: number };
  /** When set, placements stay in the corridor beside the painted path. */
  pathCorridor?: boolean;
  /** Override default path centreline clearance (metres). */
  pathExclusionRadius?: number;
}

interface InstancedGroup {
  mesh: InstancedMesh;
  placements: Placement[];
  surfaceLift: number;
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
  for (const [lx, lz] of getAllLandmarkXZ()) {
    const dx = lx - x;
    const dz = lz - z;
    if (dx * dx + dz * dz < minSq) return true;
  }
  return false;
}

function tooCloseToPath(x: number, z: number, exclusionRadius: number): boolean {
  return distanceToJourneyPath(x, z) < exclusionRadius;
}

function pickWeighted(entries: readonly ScatterAssetEntry[], rng: () => number): ScatterAssetEntry {
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

function cloneScatterMaterial(base: Material, isGrass: boolean): Material {
  const mat = base.clone();
  mat.side = DoubleSide;
  const std = mat as Material & {
    map?: Texture | null;
    alphaTest?: number;
    customDepthMaterial?: Material;
  };
  if (std.map) {
    const alphaTest = isGrass ? 0.35 : 0.2;
    std.alphaTest = alphaTest;
    std.transparent = false;
    std.depthWrite = true;
    if (!isGrass) {
      std.customDepthMaterial = new MeshDepthMaterial({
        map: std.map,
        alphaTest,
        depthWrite: true,
      });
    }
  }
  if (isGrass) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -1;
  }
  return mat;
}

/** Clone all materials — living trees use bark + leaves (multi-material meshes). */
function prepareScatterMaterials(
  material: Material | Material[],
  isGrass: boolean,
): Material | Material[] {
  if (Array.isArray(material)) {
    return material.map((m) => cloneScatterMaterial(m, isGrass));
  }
  return cloneScatterMaterial(material, isGrass);
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

function scatter(
  config: ScatterConfig,
  terrain: TerrainContext,
  rng: () => number,
): { entry: ScatterAssetEntry; placements: Placement[] }[] {
  const byKey = new Map<string, { entry: ScatterAssetEntry; placements: Placement[] }>();
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
    if (tooCloseToPath(x, z, pathExclusion)) continue;

    const entry = pickWeighted(config.entries, rng);
    const placement: Placement = {
      x,
      z,
      yRotation: rng() * Math.PI * 2,
      scale: config.scaleMin + rng() * (config.scaleMax - config.scaleMin),
      instanceIndex: 0,
    };

    if (!byKey.has(entry.key)) {
      byKey.set(entry.key, { entry, placements: [] });
    }
    const group = byKey.get(entry.key)!;
    placement.instanceIndex = group.placements.length;
    group.placements.push(placement);
    globalPlacements.push(placement);
  }

  return [...byKey.values()];
}

function buildInstancedMeshes(
  modelScene: Object3D,
  placements: Placement[],
  terrain: TerrainContext,
  surfaceLift: number,
  isGrass: boolean,
): InstancedMesh[] {
  const srcMeshes = extractMeshes(modelScene);
  const result: InstancedMesh[] = [];

  for (const srcMesh of srcMeshes) {
    const materials = prepareScatterMaterials(srcMesh.material, isGrass);
    const instanced = new InstancedMesh(srcMesh.geometry, materials, placements.length);
    instanced.castShadow = false;
    instanced.receiveShadow = false;
    if (isGrass) instanced.frustumCulled = true;

    placements.forEach((p, i) => {
      writeInstanceMatrix(instanced, i, p, terrain, surfaceLift);
    });

    instanced.instanceMatrix.needsUpdate = true;
    if (!isGrass) instanced.computeBoundingSphere();
    result.push(instanced);
  }

  return result;
}

type WindShaderRef = { uniforms: Record<string, { value: number }> };

function applyGrassWindShader(mesh: InstancedMesh, shaderRefs: WindShaderRef[]): void {
  const mat = mesh.material as Material & {
    onBeforeCompile?: (shader: WindShaderRef & { vertexShader: string }) => void;
    needsUpdate?: boolean;
  };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.time = { value: 0 };
    shader.vertexShader = 'uniform float time;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
  {
    float swayFactor = max(0.0, transformed.y) * 0.14;
    vec4 wPos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    transformed.x += sin(time * 1.3 + wPos.x * 0.7) * swayFactor;
    transformed.z += cos(time * 0.9 + wPos.z * 0.6) * swayFactor * 0.6;
  }
#endif`,
    );
    shaderRefs.push(shader as unknown as WindShaderRef);
  };
  mat.needsUpdate = true;
}

export interface AssetScatterer {
  groups: InstancedGroup[];
  updateWind: (time: number) => void;
  dispose: () => void;
}

export function buildAssetScatterer(
  scene: Scene,
  assets: AssetRegistry,
  terrain: TerrainContext,
): AssetScatterer {
  const rng = alea(`${WORLD.SEED}-scatter`);
  const groups: InstancedGroup[] = [];

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
      entries: [
        ...ASSET_MANIFEST.plants.filter((p) => p.key === 'fern' || p.key === 'plant_1'),
        ...ASSET_MANIFEST.grass.filter(
          (g) => g.key === 'grass_common_tall' || g.key === 'grass_wispy_tall',
        ),
      ],
      count: PHASE0.SCATTER.FOREST_UNDERSTORY_COUNT,
      heightMin: 0.42,
      heightMax: 1.05,
      minSpacing: 1.2,
      landmarkClearance: 4,
      scaleMin: 0.35,
      scaleMax: 0.85,
      surfaceLift: 0.05,
      grass: true,
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
    {
      entries: ASSET_MANIFEST.grass,
      count: PHASE0.SCATTER.GRASS_PATH_COUNT,
      heightMin: WORLD.BIOMES.WATER.max + 0.01,
      heightMax: WORLD.BIOMES.HILLS.max - 0.05,
      minSpacing: 0.35,
      landmarkClearance: 2,
      scaleMin: 0.75,
      scaleMax: 1.15,
      surfaceLift: 0.05,
      grass: true,
      pathCorridor: true,
    },
    {
      entries: ASSET_MANIFEST.grass,
      count: PHASE0.SCATTER.GRASS_OPEN_COUNT,
      heightMin: WORLD.BIOMES.WATER.max + 0.01,
      heightMax: WORLD.BIOMES.HILLS.max - 0.05,
      minSpacing: 0.4,
      landmarkClearance: 2.5,
      scaleMin: 0.75,
      scaleMax: 1.1,
      surfaceLift: 0.05,
      grass: true,
    },
  ];

  const grassCounts: Record<string, number> = {};
  const grassWindShaders: WindShaderRef[] = [];
  const treeKeys = new Set<string>(ASSET_MANIFEST.trees.map((t) => t.key));
  const rockKeys = new Set<string>(ASSET_MANIFEST.rocks.map((r) => r.key));

  for (const config of configs) {
    const scattered = scatter(config, terrain, rng);
    for (const { entry, placements } of scattered) {
      if (placements.length === 0) continue;
      if (config.entries === ASSET_MANIFEST.grass) {
        grassCounts[entry.key] = placements.length;
      }
      const model = assets.get(entry.key);
      if (!model) {
        console.warn(`Missing scatter asset: ${entry.key}`);
        continue;
      }
      const isGrass = config.grass === true;
      const meshes = buildInstancedMeshes(
        model,
        placements,
        terrain,
        config.surfaceLift ?? 0,
        isGrass,
      );
      // Keys like pine_* do not contain "tree" — match manifest entries explicitly.
      const castsShadow = treeKeys.has(entry.key) || rockKeys.has(entry.key);
      for (const mesh of meshes) {
        if (castsShadow) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
        if (isGrass) applyGrassWindShader(mesh, grassWindShaders);
        scene.add(mesh);
        groups.push({ mesh, placements, surfaceLift: config.surfaceLift ?? 0 });
      }
    }
  }

  if (Object.keys(grassCounts).length > 0) {
    const total = Object.values(grassCounts).reduce((s, n) => s + n, 0);
    console.info('[AssetScatterer] grass instances', { ...grassCounts, total });
  }

  const updateWind = (time: number) => {
    for (const s of grassWindShaders) {
      s.uniforms.time.value = time;
    }
  };

  const dispose = () => {
    for (const { mesh } of groups) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const depth = (m as Material & { customDepthMaterial?: Material }).customDepthMaterial;
        depth?.dispose();
        m.dispose();
      }
    }
  };

  return { groups, updateWind, dispose };
}
