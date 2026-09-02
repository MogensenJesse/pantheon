// src/world/MapTerrainBuilder.ts — terrain mesh from authored height/biome grids
import {
  type BufferAttribute,
  type BufferGeometry,
  CircleGeometry,
  type DataTexture,
  type DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  type Scene,
  type Texture,
  Vector3,
} from 'three';
import { VISUAL } from '../config/visualTuning';
import type { GridDirtyRegion } from '../map/authoring/gridDirtyRegion';
import { gridRegionToWorldBounds } from '../map/authoring/gridDirtyRegion';
import type { BiomeWeightBakeOptions, MapGrids } from '../map/MapGrids';
import {
  createBiomeIdTexture,
  createBiomeWeightTexture,
  createHeightTexture,
  createMeadowMaskTexture,
  createPathMaskTexture,
  createTerrainAuxTexture,
  sampleBiomeNearest,
  sampleHeightBilinear,
  updateBiomeIdTexture,
  updateBiomeWeightTexture,
  updateHeightTexture,
  updateMeadowMaskTexture,
  updatePathMaskTexture,
  updateTerrainAuxTexture,
} from '../map/MapGrids';
import type { MapTerrainAuxMeta } from '../map/MapTypes';
import { defaultTerrainAuxMeta } from '../map/terrainAux';
import { enableWaterReflectionLayer } from '../rendering/layers/waterReflectionLayers';
import { bindPropContactAoRebake } from './mapProps/data/propContactAoDevState';
import { createEmptyPropContactAoTexture } from './mapProps/data/propContactAoTexture';
import type { TerrainSplatMaterial, TerrainTextureSet } from './terrain';
import { createTerrainSplatMaterial, disposeTerrainSplatMaterial } from './terrain';
import {
  chiselDirtyMarginCells,
  sampleChiseledWorldNormal,
  sampleChiseledWorldY,
  terrainMeshSegments,
} from './terrain/cpu/terrainChiselCpu';
import { applyTerrainAuxUniforms } from './terrain/material/biomeSplatUniforms';
import {
  createTerrainShadowCastMesh,
  disposeTerrainShadowCastMesh,
} from './terrain/shadow/terrainShadowCast';
import { WORLD } from './WorldConfig';
import { playWaterPlaneDiameter } from './water/config/waterExtent';
import { initWaterWaveEditorPreview, waterWaveUniforms } from './water/material/waterWaveUniforms';
import { createPantheonWater } from './water/mesh/createPantheonWater';
import { disposePantheonWater } from './water/mesh/disposePantheonWater';
import type { PantheonWaterInstance } from './water/mesh/pantheonWaterTypes';

export function collectTerrainLodSplatMaterials(
  terrain: MapTerrainContext,
): TerrainSplatMaterial[] {
  return [terrain.splatMaterial];
}

/** DEV: toggle bright painted-biome false-color overlay on terrain splat materials. */
export function setTerrainBiomeDebugVisible(terrain: MapTerrainContext, enabled: boolean): void {
  const value = enabled ? 1 : 0;
  for (const mat of collectTerrainLodSplatMaterials(terrain)) {
    mat.terrainUniforms.uBiomeDebugEnabled.value = value;
  }
}

export interface MapTerrainContext {
  /** Visible terrain — world-fixed GPU-displaced plane (facet step = chisel.stepM). */
  mesh: Mesh;
  /** Macro hill shadow caster — CPU-baked geometry, not drawn in main pass. */
  shadowCastMesh: Mesh | null;
  water: Object3D;
  splatMaterial: TerrainSplatMaterial;
  grids: MapGrids;
  biomeMap: DataTexture;
  biomeIdMap: DataTexture;
  pathMap: DataTexture;
  meadowMap: DataTexture;
  heightMap: DataTexture;
  /** R8 prop base footprints for terrain contact AO — filled after entity bake. */
  propAoMap: DataTexture;
  getHeightAt: (x: number, z: number) => number;
  getWorldY: (x: number, z: number) => number;
  getBiomeAt: (x: number, z: number) => import('../map/MapTypes').BiomeIdValue;
  applyHeightsToMesh: (region?: GridDirtyRegion) => void;
  uploadBiomeMap: (opts?: BiomeWeightBakeOptions) => void;
  /**
   * PlaneGeometry subdivisions (WORLD.SIZE / chisel.stepM). Prop/marker Y interpolates
   * this tessellation so placement matches the visible mesh.
   */
  meshSegments: number;
  terrainAuxMap: DataTexture;
  auxMeta: MapTerrainAuxMeta;
  waterLevelM: number;
  setWaterLevelM: (levelM: number) => void;
  setAuxMeta: (meta: MapTerrainAuxMeta) => void;
  uploadTerrainAux: (region?: GridDirtyRegion) => void;
}

const _chiselN = new Vector3();

function configureGpuDisplacedTerrainMesh(mesh: Mesh): void {
  mesh.frustumCulled = false;
}

function planeGridSegments(geometry: BufferGeometry): { segX: number; segZ: number } | null {
  const plane = geometry as PlaneGeometry;
  const ws = plane.parameters?.widthSegments;
  const hs = plane.parameters?.heightSegments;
  if (typeof ws !== 'number' || typeof hs !== 'number' || ws < 1 || hs < 1) return null;
  return { segX: ws, segZ: hs };
}

/**
 * Bake grid heights into a regular PlaneGeometry (after rotateX(-π/2)).
 * Vertex (ix, iz): x = (ix/segX - 0.5)*SIZE, z = (iz/segZ - 0.5)*SIZE.
 * Regional updates iterate only that vertex AABB; unknown geometry falls back to a full scan.
 */
function applyGridHeightsToGeometry(
  geometry: BufferGeometry,
  grids: MapGrids,
  region?: GridDirtyRegion,
): void {
  const { SIZE } = WORLD;
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal as BufferAttribute;
  const posArr = positions.array as Float32Array;
  const nrmArr = normals.array as Float32Array;
  const grid = planeGridSegments(geometry);

  const writeVertex = (ix: number, iz: number, cols: number, segX: number, segZ: number) => {
    const x = (ix / segX - 0.5) * SIZE;
    const z = (iz / segZ - 0.5) * SIZE;
    const i = iz * cols + ix;
    posArr[i * 3 + 1] = sampleChiseledWorldY(grids, x, z);
    sampleChiseledWorldNormal(grids, x, z, _chiselN);
    const o = i * 3;
    nrmArr[o] = _chiselN.x;
    nrmArr[o + 1] = _chiselN.y;
    nrmArr[o + 2] = _chiselN.z;
  };

  if (grid && (grid.segX + 1) * (grid.segZ + 1) === positions.count) {
    const { segX, segZ } = grid;
    const cols = segX + 1;
    let ix0 = 0;
    let ix1 = segX;
    let iz0 = 0;
    let iz1 = segZ;
    if (region) {
      const worldBounds = gridRegionToWorldBounds(
        region,
        grids.size,
        SIZE,
        chiselDirtyMarginCells(grids),
      );
      ix0 = Math.max(0, Math.floor((worldBounds.xMin / SIZE + 0.5) * segX));
      ix1 = Math.min(segX, Math.ceil((worldBounds.xMax / SIZE + 0.5) * segX));
      iz0 = Math.max(0, Math.floor((worldBounds.zMin / SIZE + 0.5) * segZ));
      iz1 = Math.min(segZ, Math.ceil((worldBounds.zMax / SIZE + 0.5) * segZ));
    }
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        writeVertex(ix, iz, cols, segX, segZ);
      }
    }
  } else {
    const worldBounds = region
      ? gridRegionToWorldBounds(region, grids.size, SIZE, chiselDirtyMarginCells(grids))
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
      posArr[i * 3 + 1] = sampleChiseledWorldY(grids, x, z);
      sampleChiseledWorldNormal(grids, x, z, _chiselN);
      const o = i * 3;
      nrmArr[o] = _chiselN.x;
      nrmArr[o + 1] = _chiselN.y;
      nrmArr[o + 2] = _chiselN.z;
    }
  }

  positions.needsUpdate = true;
  normals.needsUpdate = true;
}

function createBakedShadowGeometry(segments: number): PlaneGeometry {
  const shadowGeo = new PlaneGeometry(WORLD.SIZE, WORLD.SIZE, segments, segments);
  shadowGeo.rotateX(-Math.PI / 2);
  return shadowGeo;
}

/** Flat translucent disc at the gameplay water level — editor height reference only. */
function createEditorWaterPreview(waterRadius: number, waterY: number): Mesh {
  const geometry = new CircleGeometry(waterRadius, 64);
  geometry.rotateX(-Math.PI / 2);
  const material = new MeshBasicMaterial({
    color: WORLD.BIOMES.WATER.color,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    fog: false,
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
  /** Editor: albedo splat + Lambert (no PBR / shadows / glow). */
  simpleShading?: boolean;
  /** When set, regional height/biome uploads blit via copyTextureToTexture. */
  renderer?: import('three/webgpu').WebGPURenderer;
  waterLevelM?: number;
  auxMeta?: MapTerrainAuxMeta;
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
    simpleShading = false,
    renderer: gridGpu = undefined,
    waterLevelM: waterLevelMOpt,
    auxMeta: auxMetaOpt,
  } = options;
  const { SIZE, HEIGHT_SCALE } = WORLD;
  const meshSegments = meshSegmentsOverride ?? terrainMeshSegments();
  const vertexDispEnabled = vertexDisplacement ?? true;

  const biomeMap = createBiomeWeightTexture(grids);
  const biomeIdMap = createBiomeIdTexture(grids);
  const pathMap = createPathMaskTexture(grids);
  const meadowMap = createMeadowMaskTexture(grids);
  const heightMap = createHeightTexture(grids);
  const propAoMap = createEmptyPropContactAoTexture(grids.size);
  const terrainAuxMap = createTerrainAuxTexture(grids);

  const splatMaterial = createTerrainSplatMaterial(textures, sun, {
    biomeMap,
    biomeIdMap,
    pathMap,
    meadowMap,
    heightMap,
    propAoMap,
    terrainAuxMap,
    vertexDisplacement: vertexDispEnabled,
    simpleShading,
  });
  const geometry = new PlaneGeometry(SIZE, SIZE, meshSegments, meshSegments);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, splatMaterial);
  mesh.castShadow = false;
  mesh.receiveShadow = receiveShadow;
  configureGpuDisplacedTerrainMesh(mesh);
  enableWaterReflectionLayer(mesh);
  scene.add(mesh);

  let shadowCastMesh: Mesh | null = null;
  if (castShadow) {
    const shadowGeo = createBakedShadowGeometry(meshSegments);
    applyGridHeightsToGeometry(shadowGeo, grids);
    shadowCastMesh = createTerrainShadowCastMesh(shadowGeo);
    scene.add(shadowCastMesh);
  }

  const syncHeights = (region?: GridDirtyRegion) => {
    updateHeightTexture(heightMap, grids, region, gridGpu);
    if (!vertexDispEnabled) {
      applyGridHeightsToGeometry(mesh.geometry, grids, region);
    }
    if (shadowCastMesh) {
      applyGridHeightsToGeometry(shadowCastMesh.geometry, grids, region);
    }
  };
  syncHeights();

  const waterY = waterLevelMOpt ?? WORLD.BIOMES.WATER.max * HEIGHT_SCALE;
  const waterRadius = playWaterPlaneDiameter() * 0.5;

  if (editorWaterPreview) {
    initWaterWaveEditorPreview(waterY);
  }

  const water: Object3D = waterNormals
    ? createPantheonWater(
        waterNormals,
        {
          waterRadius,
          waterY,
          shoreDepth: {
            heightMap,
            worldSize: SIZE,
            heightScale: HEIGHT_SCALE,
            waterY,
          },
        },
        sun,
      )
    : editorWaterPreview
      ? createEditorWaterPreview(waterRadius, waterY)
      : new Object3D();
  scene.add(water);

  let waterLevelM = waterY;
  let auxMeta: MapTerrainAuxMeta = auxMetaOpt ? { ...auxMetaOpt } : defaultTerrainAuxMeta();

  const applyWaterY = (levelM: number) => {
    waterLevelM = levelM;
    water.position.y = levelM;
    waterWaveUniforms.uWaterY.value = levelM;
    const shore = (water as PantheonWaterInstance).shoreUniforms;
    if (shore) shore.uWaterY.value = levelM;
    const waterNorm = levelM / HEIGHT_SCALE;
    splatMaterial.terrainUniforms.uWaterMax.value = waterNorm;
  };
  applyWaterY(waterY);

  const pushAuxFlags = (meta: MapTerrainAuxMeta) => {
    auxMeta = { ...meta };
    applyTerrainAuxUniforms(splatMaterial.terrainUniforms, auxMeta);
  };
  pushAuxFlags(auxMeta);

  const uploadTerrainAux = (region?: GridDirtyRegion) => {
    updateTerrainAuxTexture(terrainAuxMap, grids, region, gridGpu);
  };

  const getHeightAt = (x: number, z: number) => sampleHeightBilinear(grids, x, z, SIZE);
  const getWorldY = (x: number, z: number) => sampleChiseledWorldY(grids, x, z);
  const getBiomeAt = (x: number, z: number) => sampleBiomeNearest(grids, x, z, SIZE);
  const uploadBiomeMap = (opts?: BiomeWeightBakeOptions) => {
    updateBiomeWeightTexture(biomeMap, grids, opts, gridGpu);
    updateBiomeIdTexture(biomeIdMap, grids, opts, gridGpu);
    updatePathMaskTexture(pathMap, grids, opts, gridGpu);
    updateMeadowMaskTexture(meadowMap, grids, opts, gridGpu);
  };

  return {
    mesh,
    shadowCastMesh,
    water,
    splatMaterial,
    grids,
    biomeMap,
    biomeIdMap,
    pathMap,
    meadowMap,
    heightMap,
    propAoMap,
    getHeightAt,
    getWorldY,
    getBiomeAt,
    applyHeightsToMesh: syncHeights,
    uploadBiomeMap,
    meshSegments,
    terrainAuxMap,
    get auxMeta() {
      return auxMeta;
    },
    get waterLevelM() {
      return waterLevelM;
    },
    setWaterLevelM: applyWaterY,
    setAuxMeta: pushAuxFlags,
    uploadTerrainAux,
  };
}

export function disposeMapTerrain(context: MapTerrainContext): void {
  if (context.shadowCastMesh) {
    const shadowGeo = context.shadowCastMesh.geometry;
    disposeTerrainShadowCastMesh(context.shadowCastMesh);
    shadowGeo.dispose();
  }

  context.mesh.geometry.dispose();

  disposeTerrainSplatMaterial(context.splatMaterial);
  context.biomeMap.dispose();
  context.biomeIdMap.dispose();
  context.pathMap.dispose();
  context.meadowMap.dispose();
  context.heightMap.dispose();
  bindPropContactAoRebake(null);
  context.propAoMap.dispose();
  context.terrainAuxMap.dispose();
  disposePantheonWater(context.water);
}

/** Alias used by play bootstrap / tick — same as {@link MapTerrainContext}. */
export type WorldTerrain = MapTerrainContext;

export function disposeWorldTerrain(terrain: WorldTerrain): void {
  disposeMapTerrain(terrain);
}
