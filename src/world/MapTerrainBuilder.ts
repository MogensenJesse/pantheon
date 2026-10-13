// src/world/MapTerrainBuilder.ts — terrain mesh from authored height/biome grids
import {
  type BufferAttribute,
  CircleGeometry,
  type DataTexture,
  type DirectionalLight,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
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
  createOverlayTexture,
  createPlaceholderBiomeIdTexture,
  sampleBiomeNearest,
  updateBiomeIdTexture,
  updateBiomeWeightTexture,
  updateHeightTexture,
  updateOverlayConvex,
  updateOverlayTexture,
} from '../map/MapGrids';
import type { MapTerrainAuxMeta } from '../map/MapTypes';
import { createOceanInlandMaskTexture, updateOceanInlandMaskTexture } from '../map/oceanInlandMask';
import { defaultTerrainAuxMeta } from '../map/terrainAux';
import { bindValleyFogInlandMask } from '../rendering/atmosphere';
import { enableWaterReflectionLayer } from '../rendering/layers/waterReflectionLayers';
import { configureMeshShadowCast, unregisterMeshShadowCast } from '../rendering/sunShadow';
import { bindPropContactAoRebake } from './mapProps/data/propContactAoDevState';
import { createEmptyPropContactAoTexture } from './mapProps/data/propContactAoTexture';
import type { TerrainSplatMaterial, TerrainTextureSet } from './terrain';
import { createTerrainSplatMaterial } from './terrain';
import { createFineDelta } from './terrain/cpu/fineDelta';
import {
  chiselDirtyMarginCells,
  sampleChiseledWorldNormalBase,
  sampleChiseledWorldY,
  sampleChiseledWorldYBase,
  setActiveFineDelta,
  terrainFacetStepM,
  terrainMeshSegments,
} from './terrain/cpu/terrainChiselCpu';
import { carveCoarseCells, createFineTerrain, type FineTerrain } from './terrain/fineTerrainPatch';
import { applyTerrainAuxUniforms } from './terrain/material/biomeSplatUniforms';
import { WORLD } from './WorldConfig';
import { playWaterPlaneDiameter } from './water/config/waterExtent';
import { initWaterWaveEditorPreview, waterWaveUniforms } from './water/material/waterWaveUniforms';
import { createPantheonWater } from './water/mesh/createPantheonWater';
import { disposePantheonWater } from './water/mesh/disposePantheonWater';
import type { PantheonWaterInstance } from './water/mesh/pantheonWaterTypes';

/** DEV: toggle bright painted-biome false-color overlay on terrain splat materials. */
export function setTerrainBiomeDebugVisible(terrain: MapTerrainContext, enabled: boolean): void {
  const value = enabled ? 1 : 0;
  terrain.splatMaterial.terrainUniforms.uBiomeDebugEnabled.value = value;
}

export interface MapTerrainContext {
  /** Visible terrain. Play CPU-bakes Y and casts from it; the editor GPU-displaces and does not cast. */
  mesh: Mesh;
  water: Object3D;
  splatMaterial: TerrainSplatMaterial;
  grids: MapGrids;
  biomeMap: DataTexture;
  biomeIdMap: DataTexture;
  /**
   * RGBA8 overlay masks on the height grid: R path (the village adds roads and wear), G meadow,
   * B water (seabed overlay), A authored convex ridge. See `map/overlayChannels.ts`.
   */
  overlayMap: DataTexture;
  heightMap: DataTexture;
  /** R8 metres-from-ocean for night valley fog (inland lakes stay inland). */
  inlandMaskMap: DataTexture;
  /** R8 prop base footprints for terrain contact AO — filled after entity bake. */
  propAoMap: DataTexture;
  getWorldY: (x: number, z: number) => number;
  getBiomeAt: (x: number, z: number) => import('../map/MapTypes').BiomeIdValue;
  applyHeightsToMesh: (region?: GridDirtyRegion) => void;
  uploadBiomeMap: (opts?: BiomeWeightBakeOptions) => void;
  auxMeta: MapTerrainAuxMeta;
  waterLevelM: number;
  setWaterLevelM: (levelM: number) => void;
  setAuxMeta: (meta: MapTerrainAuxMeta) => void;
  /** Re-upload the convex channel of the overlay map after the aux grid changed. */
  uploadConvex: (region?: GridDirtyRegion) => void;
  /** Play only: the 2 m detail layer the village levels its pads into (null elsewhere). */
  fine: FineTerrain | null;
}

const _chiselN = new Vector3();

function configureGpuDisplacedTerrainMesh(mesh: Mesh): void {
  mesh.frustumCulled = false;
}

/**
 * Bake grid heights into the terrain PlaneGeometry (after rotateX(-π/2)).
 * Vertex (ix, iz): x = (ix/segX - 0.5)*SIZE, z = (iz/segZ - 0.5)*SIZE.
 * Regional updates iterate only that vertex AABB.
 */
function applyGridHeightsToGeometry(
  geometry: PlaneGeometry,
  grids: MapGrids,
  region?: GridDirtyRegion,
): void {
  const { SIZE } = WORLD;
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal as BufferAttribute;
  const posArr = positions.array as Float32Array;
  const nrmArr = normals.array as Float32Array;
  const segX = geometry.parameters.widthSegments;
  const segZ = geometry.parameters.heightSegments;
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
    const z = (iz / segZ - 0.5) * SIZE;
    for (let ix = ix0; ix <= ix1; ix++) {
      const x = (ix / segX - 0.5) * SIZE;
      const i = iz * cols + ix;
      // The coarse mesh is the 8 m chisel; the village's detail patch draws its levelling.
      posArr[i * 3 + 1] = sampleChiseledWorldYBase(grids, x, z);
      sampleChiseledWorldNormalBase(grids, x, z, _chiselN);
      const o = i * 3;
      nrmArr[o] = _chiselN.x;
      nrmArr[o + 1] = _chiselN.y;
      nrmArr[o + 2] = _chiselN.z;
    }
  }

  positions.needsUpdate = true;
  normals.needsUpdate = true;
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
  /** Play: false (CPU-bake Y, visible mesh casts). Editor: true (live GPU displace). */
  vertexDisplacement?: boolean;
  /** Editor: albedo splat + Lambert (no PBR / shadows / glow). */
  simpleShading?: boolean;
  /** When set, regional height/biome uploads blit via copyTextureToTexture. */
  renderer?: import('three/webgpu').WebGPURenderer;
  waterLevelM?: number;
  auxMeta?: MapTerrainAuxMeta;
  /** Play: a square of whole facet cells around (cx, cz) drawn with 2 m detail facets, for levelling. */
  fineRegion?: { cx: number; cz: number; halfM: number };
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
    simpleShading = false,
    renderer: gridGpu = undefined,
    waterLevelM: waterLevelMOpt,
    auxMeta: auxMetaOpt,
  } = options;
  const { SIZE, HEIGHT_SCALE } = WORLD;
  const meshSegments = terrainMeshSegments();
  const vertexDispEnabled = vertexDisplacement ?? true;
  const waterY = waterLevelMOpt ?? WORLD.BIOMES.WATER.max * HEIGHT_SCALE;
  let waterLevelM = waterY;

  const biomeMap = createBiomeWeightTexture(grids);
  const biomeIdMap = import.meta.env.DEV
    ? createBiomeIdTexture(grids)
    : createPlaceholderBiomeIdTexture();
  // Integer IDs: nearest = unfilterable in WGSL → texel load, no sampler binding. Only the DEV
  // biome overlay samples it; this keeps DEV terrain within 16 samplers with the world visibility texture.
  biomeIdMap.minFilter = NearestFilter;
  biomeIdMap.magFilter = NearestFilter;
  biomeIdMap.generateMipmaps = false;
  biomeIdMap.needsUpdate = true;
  const overlayMap = createOverlayTexture(grids);
  const heightMap = createHeightTexture(grids);
  const inlandMaskMap = createOceanInlandMaskTexture(grids, waterY);
  bindValleyFogInlandMask(inlandMaskMap);
  const propAoMap = createEmptyPropContactAoTexture(grids.size);

  const splatMaterial = createTerrainSplatMaterial(textures, sun, {
    biomeMap,
    biomeIdMap,
    overlayMap,
    heightMap,
    propAoMap,
    vertexDisplacement: vertexDispEnabled,
    simpleShading,
  });
  const geometry = new PlaneGeometry(SIZE, SIZE, meshSegments, meshSegments);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, splatMaterial);
  mesh.receiveShadow = receiveShadow;
  configureGpuDisplacedTerrainMesh(mesh);
  enableWaterReflectionLayer(mesh);

  // GPU-displaced terrain cannot cast: the shadow pass would rasterise the flat base plane.
  mesh.castShadow = castShadow && !vertexDispEnabled;
  if (mesh.castShadow) configureMeshShadowCast(mesh);

  let fine: FineTerrain | null = null;
  const region = options.fineRegion;
  if (region && !vertexDispEnabled) {
    const reach = region.halfM;
    const limit = SIZE / 2 - reach - terrainFacetStepM();
    const delta = createFineDelta(
      Math.max(-limit, Math.min(limit, region.cx)),
      Math.max(-limit, Math.min(limit, region.cz)),
      reach,
      terrainFacetStepM(),
    );
    fine = createFineTerrain({ delta, grids, splatMaterial, receiveShadow, castShadow });
    carveCoarseCells(geometry, delta);
    setActiveFineDelta(delta);
    mesh.add(fine.mesh);
  }
  scene.add(mesh);

  const syncHeights = (region?: GridDirtyRegion) => {
    updateHeightTexture(heightMap, grids, region, gridGpu);
    updateOceanInlandMaskTexture(inlandMaskMap, grids, waterLevelM);
    if (!vertexDispEnabled) {
      applyGridHeightsToGeometry(geometry, grids, region);
    }
  };
  syncHeights();

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

  let auxMeta: MapTerrainAuxMeta = auxMetaOpt ? { ...auxMetaOpt } : defaultTerrainAuxMeta();

  const applyWaterY = (levelM: number) => {
    const waterChanged = levelM !== waterLevelM;
    waterLevelM = levelM;
    water.position.y = levelM;
    waterWaveUniforms.uWaterY.value = levelM;
    const shore = (water as PantheonWaterInstance).shoreUniforms;
    if (shore) shore.uWaterY.value = levelM;
    if (waterChanged) updateOceanInlandMaskTexture(inlandMaskMap, grids, waterLevelM);
  };
  applyWaterY(waterY);

  const pushAuxFlags = (meta: MapTerrainAuxMeta) => {
    auxMeta = { ...meta };
    applyTerrainAuxUniforms(splatMaterial.terrainUniforms, auxMeta);
  };
  pushAuxFlags(auxMeta);

  const uploadConvex = (region?: GridDirtyRegion) => {
    if (overlayMap.image.width !== grids.size) return;
    updateOverlayConvex(overlayMap, grids, region, gridGpu);
  };

  const getWorldY = (x: number, z: number) => sampleChiseledWorldY(grids, x, z);
  const getBiomeAt = (x: number, z: number) => sampleBiomeNearest(grids, x, z, SIZE);
  const uploadBiomeMap = (opts?: BiomeWeightBakeOptions) => {
    updateBiomeWeightTexture(biomeMap, grids, opts, gridGpu);
    if (import.meta.env.DEV) {
      updateBiomeIdTexture(biomeIdMap, grids, opts, gridGpu);
    }
    updateOverlayTexture(overlayMap, grids, opts, gridGpu);
  };

  return {
    mesh,
    water,
    splatMaterial,
    grids,
    biomeMap,
    biomeIdMap,
    overlayMap,
    heightMap,
    inlandMaskMap,
    propAoMap,
    getWorldY,
    getBiomeAt,
    applyHeightsToMesh: syncHeights,
    uploadBiomeMap,
    get auxMeta() {
      return auxMeta;
    },
    get waterLevelM() {
      return waterLevelM;
    },
    setWaterLevelM: applyWaterY,
    setAuxMeta: pushAuxFlags,
    uploadConvex,
    fine,
  };
}

export function disposeMapTerrain(context: MapTerrainContext): void {
  if (context.mesh.castShadow) unregisterMeshShadowCast(context.mesh);
  if (context.fine) {
    setActiveFineDelta(null);
    context.fine.dispose();
  }

  context.mesh.geometry.dispose();

  context.splatMaterial.dispose();
  context.biomeMap.dispose();
  context.biomeIdMap.dispose();
  context.overlayMap.dispose();
  context.heightMap.dispose();
  bindValleyFogInlandMask(null);
  context.inlandMaskMap.dispose();
  bindPropContactAoRebake(null);
  context.propAoMap.dispose();
  disposePantheonWater(context.water);
}

/** Alias used by play bootstrap / tick — same as {@link MapTerrainContext}. */
export type WorldTerrain = MapTerrainContext;

export function disposeWorldTerrain(terrain: WorldTerrain): void {
  disposeMapTerrain(terrain);
}
