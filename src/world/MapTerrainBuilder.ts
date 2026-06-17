// src/world/MapTerrainBuilder.ts — terrain mesh from authored height/biome grids
import {
  CircleGeometry,
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
import { createTerrainLodMesh, configureGpuDisplacedTerrainMesh, type TerrainLodMesh } from './terrain/lod/terrainLodRings';
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
  /** Visible terrain — single Mesh (editor) or LOD Group (play). */
  mesh: Mesh | Group;
  /** Macro hill shadow caster — CPU-baked geometry, not drawn in main pass. */
  shadowCastMesh: Mesh | null;
  water: Object3D;
  seafloor: Mesh;
  splatMaterial: TerrainSplatMaterial;
  /** Play LOD: macro-only material on the world-fixed base mesh (center detail patch uses splatMaterial). */
  macroSplatMaterial?: TerrainSplatMaterial;
  grids: MapGrids;
  biomeMap: DataTexture;
  pathMap: DataTexture;
  meadowMap: DataTexture;
  heightMap: DataTexture;
  getHeightAt: (x: number, z: number) => number;
  getWorldY: (x: number, z: number) => number;
  getBiomeAt: (x: number, z: number) => import('../map/MapTypes').BiomeIdValue;
  /** Upload sculpt height to GPU height map (and shadow caster when enabled). */
  applyHeightsToMesh: () => void;
  /** Upload biome weights + path mask after paint/sculpt edits. */
  uploadBiomeMap: (opts?: BiomeWeightBakeOptions) => void;
  /** Reposition clipmap detail patch to the player (no-op for editor single mesh). */
  updateLod: (playerX: number, playerZ: number) => void;
  /** True when the visible mesh is the play-mode clipmap (detail disk + macro base). */
  lodEnabled: boolean;
  /** Play LOD mesh handle — geometry disposal via `dispose()`. */
  terrainLod?: TerrainLodMesh;
  /** Clipmap vertex counts (play LOD only). */
  lodVertexStats?: TerrainLodVertexStats;
}

/** CPU-bake sculpt height into geometry Y (shadow caster mesh). */
function applyGridHeightsToGeometry(mesh: Mesh, grids: MapGrids): void {
  const { SIZE, HEIGHT_SCALE } = WORLD;
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position;

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const h = sampleHeightBilinear(grids, x, z, SIZE);
    positions.setY(i, h * HEIGHT_SCALE);
  }

  geometry.computeVertexNormals();
  positions.needsUpdate = true;
}

/** CPU-baked hill silhouettes — separate from the flat GPU-macro visible mesh. */
function createBakedShadowGeometry(segments: number): PlaneGeometry {
  const shadowGeo = new PlaneGeometry(WORLD.SIZE, WORLD.SIZE, segments, segments);
  shadowGeo.rotateX(-Math.PI / 2);
  return shadowGeo;
}

export interface BuildMapTerrainOptions {
  receiveShadow?: boolean;
  /** Draw sculpted height into sun shadow map (hill silhouettes). */
  castShadow?: boolean;
  /** Normal map for the reflective ocean. Omit (e.g. map editor) to skip water. */
  waterNormals?: Texture;
  /** Override vertex displacement shader path (editor passes false). */
  vertexDisplacement?: boolean;
  /** PlaneGeometry segment count per axis (editor uses VISUAL.terrain.editorMeshSegments). */
  meshSegments?: number;
  /** Play-mode geometry clipmap. Editor must pass `lod: false`; play always passes `lod: true`. */
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
    vertexDisplacement,
    meshSegments: meshSegmentsOverride,
    lod = false,
  } = options;
  const { SIZE, HEIGHT_SCALE } = WORLD;
  const finestSegments = meshSegmentsOverride ?? VISUAL.terrain.meshSegments;
  const finestStep = SIZE / finestSegments;

  const biomeMap = createBiomeWeightTexture(grids);
  const pathMap = createPathMaskTexture(grids);
  const meadowMap = createMeadowMaskTexture(grids);
  const heightMap = createHeightTexture(grids);

  const splatMaterialOptions = {
    biomeMap,
    pathMap,
    meadowMap,
    heightMap,
    meshSegments: finestSegments,
    vertexDisplacement:
      vertexDisplacement ?? (textures.hasDisplacementMaps && VISUAL.terrain.displacementEnabled),
  };

  let splatMaterial: TerrainSplatMaterial;
  let macroSplatMaterial: TerrainSplatMaterial | undefined;

  let mesh: Mesh | Group;
  let updateLod: (playerX: number, playerZ: number) => void = () => {};
  let terrainLod: TerrainLodMesh | undefined;
  let lodVertexStats: TerrainLodVertexStats | undefined;

  if (lod) {
    splatMaterial = createTerrainSplatMaterial(textures, sun, {
      ...splatMaterialOptions,
      clipmapDetailDisk: true,
    });
    macroSplatMaterial = createTerrainSplatMaterial(textures, sun, {
      ...splatMaterialOptions,
      sampleDetailDisplacement: false,
    });
    terrainLod = createTerrainLodMesh(
      splatMaterial,
      finestStep,
      undefined,
      macroSplatMaterial,
    );
    mesh = terrainLod.group;
    for (const clipmapMesh of terrainLod.meshes) {
      clipmapMesh.receiveShadow = receiveShadow;
    }
    for (const detailMesh of terrainLod.detailMeshes) {
      detailMesh.renderOrder = 1;
    }
    // Macro base stays at origin; only the center detail patch snaps to the player.
    updateLod = (playerX: number, playerZ: number) => {
      const snap = terrainLod!.update(playerX, playerZ);
      for (const mat of [splatMaterial, macroSplatMaterial!]) {
        (mat.terrainUniforms.uDetailPatchOrigin.value as Vector2).set(snap.snapX, snap.snapZ);
      }
    };
    lodVertexStats = terrainLod.vertexStats;
    if (import.meta.env.DEV) {
      console.info('[terrain LOD]', formatTerrainLodVertexStats(lodVertexStats));
    }
    scene.add(mesh);
  } else {
    splatMaterial = createTerrainSplatMaterial(textures, sun, splatMaterialOptions);
    const editorGeometry = new PlaneGeometry(SIZE, SIZE, finestSegments, finestSegments);
    editorGeometry.rotateX(-Math.PI / 2);
    const singleMesh = new Mesh(editorGeometry, splatMaterial);
    singleMesh.castShadow = false;
    singleMesh.receiveShadow = receiveShadow;
    configureGpuDisplacedTerrainMesh(singleMesh);
    enableWaterReflectionLayer(singleMesh);
    mesh = singleMesh;
    scene.add(mesh);
  }

  let shadowCastMesh: Mesh | null = null;
  if (castShadow) {
    const shadowGeo = createBakedShadowGeometry(VISUAL.terrain.lod.shadowMeshSegments);
    applyGridHeightsToGeometry(new Mesh(shadowGeo), grids);
    shadowCastMesh = createTerrainShadowCastMesh(shadowGeo);
    scene.add(shadowCastMesh);
  }

  const syncHeights = () => {
    updateHeightTexture(heightMap, grids);
    if (shadowCastMesh) {
      applyGridHeightsToGeometry(shadowCastMesh, grids);
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
    terrainLod,
    lodVertexStats,
  };
}

export function disposeMapTerrain(context: MapTerrainContext): void {
  if (context.shadowCastMesh) {
    const shadowGeo = context.shadowCastMesh.geometry;
    disposeTerrainShadowCastMesh(context.shadowCastMesh);
    shadowGeo.dispose();
  }

  if (context.terrainLod) {
    context.terrainLod.dispose();
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
