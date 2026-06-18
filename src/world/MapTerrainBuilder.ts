// src/world/MapTerrainBuilder.ts — terrain mesh from authored height/biome grids
import {
  CircleGeometry,
  type BufferAttribute,
  type DataTexture,
  type DirectionalLight,
  type Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  type Scene,
  type Texture,
  type Vector2,
} from 'three';
import { VISUAL } from '../config/visualTuning';
import type { BiomeWeightBakeOptions, MapGrids } from '../map/MapGrids';
import type { GridDirtyRegion } from '../map/gridDirtyRegion';
import { gridRegionToWorldBounds } from '../map/gridDirtyRegion';
import {
  createBiomeWeightTexture,
  createHeightTexture,
  createMeadowMaskTexture,
  createPathMaskTexture,
  sampleBiomeNearest,
  sampleHeightBilinear,
  updateBiomeWeightTexture,
  updateHeightTexture,
  updateMeadowMaskTexture,
  updatePathMaskTexture,
} from '../map/MapGrids';
import type { TerrainSplatMaterial, TerrainTextureSet } from './terrain';
import { createTerrainSplatMaterial, disposeTerrainSplatMaterial } from './terrain';
import {
  configureGpuDisplacedTerrainMesh,
  createPlayTerrainLodMesh,
  type PlayTerrainLodMesh,
  terrainPlayLodConfigFromVisual,
} from './terrain/lod/terrainLodRings';
import {
  formatTerrainLodVertexStats,
  type TerrainLodVertexStats,
} from './terrain/lod/terrainLodStats';
import {
  createTerrainShadowCastMesh,
  disposeTerrainShadowCastMesh,
} from './terrain/shadow/terrainShadowCast';
import { WORLD } from './WorldConfig';
import { disposePantheonWater } from './water/disposePantheonWater';
import { createPantheonWater } from './water/PantheonWaterMesh';
import { enableWaterReflectionLayer } from './water/waterReflectionLayers';

export interface MapTerrainContext {
  /** Visible terrain — Mesh (editor) or play LOD Group (fine center + coarse macro). */
  mesh: Mesh | Group;
  /** Macro hill shadow caster — CPU-baked geometry, not drawn in main pass. */
  shadowCastMesh: Mesh | null;
  water: Object3D;
  seafloor: Mesh;
  splatMaterial: TerrainSplatMaterial;
  /** Play coarse layer — same splat shader as splatMaterial, complementary ring cutout. */
  macroSplatMaterial?: TerrainSplatMaterial;
  grids: MapGrids;
  biomeMap: DataTexture;
  pathMap: DataTexture;
  meadowMap: DataTexture;
  heightMap: DataTexture;
  getHeightAt: (x: number, z: number) => number;
  getWorldY: (x: number, z: number) => number;
  getBiomeAt: (x: number, z: number) => import('../map/MapTypes').BiomeIdValue;
  applyHeightsToMesh: (region?: GridDirtyRegion) => void;
  uploadBiomeMap: (opts?: BiomeWeightBakeOptions) => void;
  /** Snap fine center patch + uDetailPatchOrigin (play mode). */
  updateLod: (playerX: number, playerZ: number) => void;
  lodEnabled: boolean;
  playTerrainLod?: PlayTerrainLodMesh;
  lodVertexStats?: TerrainLodVertexStats;
}

/** Extra grid cells around dirty region for height-gradient normals. */
const HEIGHT_NORMAL_MARGIN_CELLS = 2;

function setHeightfieldVertexNormal(
  normals: BufferAttribute,
  i: number,
  grids: MapGrids,
  x: number,
  z: number,
  heightScale: number,
): void {
  const { SIZE } = WORLD;
  const cellWorld = SIZE / Math.max(1, grids.size - 1);
  const hL = sampleHeightBilinear(grids, x - cellWorld, z, SIZE) * heightScale;
  const hR = sampleHeightBilinear(grids, x + cellWorld, z, SIZE) * heightScale;
  const hD = sampleHeightBilinear(grids, x, z - cellWorld, SIZE) * heightScale;
  const hU = sampleHeightBilinear(grids, x, z + cellWorld, SIZE) * heightScale;
  const dhdx = (hR - hL) / (2 * cellWorld);
  const dhdz = (hU - hD) / (2 * cellWorld);
  const nx = -dhdx;
  const ny = 1;
  const nz = -dhdz;
  const len = Math.hypot(nx, ny, nz) || 1;
  normals.setXYZ(i, nx / len, ny / len, nz / len);
}

function applyGridHeightsToGeometry(
  mesh: Mesh,
  grids: MapGrids,
  region?: GridDirtyRegion,
): void {
  const { SIZE, HEIGHT_SCALE } = WORLD;
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal as BufferAttribute;
  const worldBounds = region
    ? gridRegionToWorldBounds(region, grids.size, SIZE, HEIGHT_NORMAL_MARGIN_CELLS)
    : null;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    if (
      worldBounds &&
      (x < worldBounds.xMin ||
        x > worldBounds.xMax ||
        z < worldBounds.zMin ||
        z > worldBounds.zMax)
    ) {
      continue;
    }
    const h = sampleHeightBilinear(grids, x, z, SIZE);
    positions.setY(i, h * HEIGHT_SCALE);
    setHeightfieldVertexNormal(normals, i, grids, x, z, HEIGHT_SCALE);
  }

  positions.needsUpdate = true;
  normals.needsUpdate = true;
}

function createBakedShadowGeometry(segments: number): PlaneGeometry {
  const shadowGeo = new PlaneGeometry(WORLD.SIZE, WORLD.SIZE, segments, segments);
  shadowGeo.rotateX(-Math.PI / 2);
  return shadowGeo;
}

/** Flat translucent sheet at the gameplay water level — editor height reference only. */
function createEditorWaterPreview(waterRadius: number, waterY: number): Mesh {
  const geometry = new PlaneGeometry(waterRadius * 2, waterRadius * 2);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    color: WORLD.BIOMES.WATER.color,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'editor-water-preview';
  mesh.position.y = waterY;
  mesh.renderOrder = 1;
  return mesh;
}

export interface BuildMapTerrainOptions {
  receiveShadow?: boolean;
  castShadow?: boolean;
  waterNormals?: Texture;
  /** Simple flat water sheet when waterNormals is omitted (map editor). */
  editorWaterPreview?: boolean;
  vertexDisplacement?: boolean;
  meshSegments?: number;
  lod?: boolean;
}

export function buildMapTerrain(
  scene: Scene,
  textures: TerrainTextureSet,
  sun: DirectionalLight,
  grids: MapGrids,
  options: BuildMapTerrainOptions = {},
): MapTerrainContext {
  const {
    receiveShadow = true,
    castShadow = VISUAL.terrain.castShadow,
    waterNormals,
    editorWaterPreview = false,
    vertexDisplacement,
    meshSegments: meshSegmentsOverride,
    lod = false,
  } = options;
  const { SIZE, HEIGHT_SCALE } = WORLD;
  const finestSegments = meshSegmentsOverride ?? VISUAL.terrain.meshSegments;
  const vertexDispEnabled =
    vertexDisplacement ?? (textures.hasDisplacementMaps && VISUAL.terrain.displacementEnabled);

  const biomeMap = createBiomeWeightTexture(grids);
  const pathMap = createPathMaskTexture(grids);
  const meadowMap = createMeadowMaskTexture(grids);
  const heightMap = createHeightTexture(grids);

  let splatMaterial: TerrainSplatMaterial;
  let macroSplatMaterial: TerrainSplatMaterial | undefined;
  let mesh: Mesh | Group;
  let updateLod: (playerX: number, playerZ: number) => void = () => {};
  let playTerrainLod: PlayTerrainLodMesh | undefined;
  let lodVertexStats: TerrainLodVertexStats | undefined;

  if (lod) {
    const playSegments = Math.max(2, Math.ceil(finestSegments / VISUAL.terrain.lod.farStepMul));
    const lodConfig = terrainPlayLodConfigFromVisual(finestSegments);
    const sharedMaterialOpts = {
      biomeMap,
      pathMap,
      meadowMap,
      heightMap,
      vertexDisplacement: vertexDispEnabled,
      detailDispRadialFade: true,
    };

    splatMaterial = createTerrainSplatMaterial(textures, sun, {
      ...sharedMaterialOpts,
      meshSegments: finestSegments,
      terrainMeshLayer: 'detail',
    });
    macroSplatMaterial = createTerrainSplatMaterial(textures, sun, {
      ...sharedMaterialOpts,
      meshSegments: playSegments,
      terrainMeshLayer: 'macro',
    });

    playTerrainLod = createPlayTerrainLodMesh(
      splatMaterial,
      macroSplatMaterial,
      finestSegments,
      lodConfig,
    );
    mesh = playTerrainLod.group;
    for (const lodMesh of [playTerrainLod.detailMesh, playTerrainLod.macroMesh]) {
      lodMesh.receiveShadow = receiveShadow;
    }

    updateLod = (playerX: number, playerZ: number) => {
      const snap = playTerrainLod!.update(playerX, playerZ);
      for (const mat of [splatMaterial, macroSplatMaterial!]) {
        (mat.terrainUniforms.uDetailPatchOrigin.value as Vector2).set(snap.snapX, snap.snapZ);
      }
    };
    lodVertexStats = playTerrainLod.vertexStats;
    if (import.meta.env.DEV) {
      console.info('[terrain play LOD]', formatTerrainLodVertexStats(lodVertexStats));
    }
    scene.add(mesh);
  } else {
    splatMaterial = createTerrainSplatMaterial(textures, sun, {
      biomeMap,
      pathMap,
      meadowMap,
      heightMap,
      meshSegments: finestSegments,
      vertexDisplacement: vertexDispEnabled,
    });
    const editorGeometry = new PlaneGeometry(SIZE, SIZE, finestSegments, finestSegments);
    editorGeometry.rotateX(-Math.PI / 2);
    mesh = new Mesh(editorGeometry, splatMaterial);
    mesh.castShadow = false;
    mesh.receiveShadow = receiveShadow;
    configureGpuDisplacedTerrainMesh(mesh);
    enableWaterReflectionLayer(mesh);
    scene.add(mesh);
  }

  let shadowCastMesh: Mesh | null = null;
  if (castShadow) {
    const shadowGeo = createBakedShadowGeometry(VISUAL.terrain.lod.shadowMeshSegments);
    applyGridHeightsToGeometry(new Mesh(shadowGeo), grids);
    shadowCastMesh = createTerrainShadowCastMesh(shadowGeo);
    scene.add(shadowCastMesh);
  }

  const syncHeights = (region?: GridDirtyRegion) => {
    updateHeightTexture(heightMap, grids, region);
    if (!lod && mesh instanceof Mesh) {
      applyGridHeightsToGeometry(mesh, grids, region);
    }
    if (shadowCastMesh) {
      applyGridHeightsToGeometry(shadowCastMesh, grids, region);
    }
  };
  syncHeights();

  const waterY = WORLD.BIOMES.WATER.max * HEIGHT_SCALE;
  const waterRadius = WORLD.WATER_PLANE_SIZE * 0.5;

  const seafloorGeo = new CircleGeometry(waterRadius * 1.02, 64);
  seafloorGeo.rotateX(-Math.PI / 2);
  const seafloor = new Mesh(
    seafloorGeo,
    new MeshBasicMaterial({ color: 0x0a1a2e, depthWrite: true }),
  );
  seafloor.position.y = waterY - 4;
  enableWaterReflectionLayer(seafloor);
  scene.add(seafloor);

  const water: Object3D = waterNormals
    ? createPantheonWater(waterNormals, { waterRadius, waterY })
    : editorWaterPreview
      ? createEditorWaterPreview(waterRadius, waterY)
      : new Object3D();
  scene.add(water);

  const getHeightAt = (x: number, z: number) => sampleHeightBilinear(grids, x, z, SIZE);
  const getWorldY = (x: number, z: number) => getHeightAt(x, z) * HEIGHT_SCALE;
  const getBiomeAt = (x: number, z: number) => sampleBiomeNearest(grids, x, z, SIZE);
  const uploadBiomeMap = (opts?: BiomeWeightBakeOptions) => {
    updateBiomeWeightTexture(biomeMap, grids, opts);
    updatePathMaskTexture(pathMap, grids, opts);
    updateMeadowMaskTexture(meadowMap, grids, opts);
  };

  return {
    mesh,
    shadowCastMesh,
    water,
    seafloor,
    splatMaterial,
    macroSplatMaterial,
    grids,
    biomeMap,
    pathMap,
    meadowMap,
    heightMap,
    getHeightAt,
    getWorldY,
    getBiomeAt,
    applyHeightsToMesh: syncHeights,
    uploadBiomeMap,
    updateLod,
    lodEnabled: lod,
    playTerrainLod,
    lodVertexStats,
  };
}

export function disposeMapTerrain(context: MapTerrainContext): void {
  if (context.shadowCastMesh) {
    const shadowGeo = context.shadowCastMesh.geometry;
    disposeTerrainShadowCastMesh(context.shadowCastMesh);
    shadowGeo.dispose();
  }

  if (context.playTerrainLod) {
    context.playTerrainLod.dispose();
  } else if (context.mesh instanceof Mesh) {
    context.mesh.geometry.dispose();
  }

  disposeTerrainSplatMaterial(context.splatMaterial);
  if (context.macroSplatMaterial) {
    disposeTerrainSplatMaterial(context.macroSplatMaterial);
  }
  context.biomeMap.dispose();
  context.pathMap.dispose();
  context.meadowMap.dispose();
  context.heightMap.dispose();
  disposePantheonWater(context.water);
  context.seafloor.geometry.dispose();
  (context.seafloor.material as { dispose?: () => void }).dispose?.();
}
