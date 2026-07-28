// src/world/MapTerrainBuilder.ts — terrain mesh from authored height/biome grids
import {
  type BufferAttribute,
  type BufferGeometry,
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
import type { GridDirtyRegion } from '../map/authoring/gridDirtyRegion';
import { gridRegionToWorldBounds } from '../map/authoring/gridDirtyRegion';
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
import { enableWaterReflectionLayer } from '../rendering/layers/waterReflectionLayers';
import { createEmptyPropContactAoTexture } from './mapProps/data/propContactAoTexture';
import type { TerrainSplatMaterial, TerrainTextureSet } from './terrain';
import { createTerrainSplatMaterial, disposeTerrainSplatMaterial } from './terrain';
import {
  configureGpuDisplacedTerrainMesh,
  createPlayTerrainLodMesh,
  type PlayTerrainLodMesh,
  terrainPlayLodConfigFromVisual,
} from './terrain/lod/terrainLodRings';
import type { TerrainLodVertexStats } from './terrain/lod/terrainLodStats';
import {
  createTerrainShadowCastMesh,
  disposeTerrainShadowCastMesh,
} from './terrain/shadow/terrainShadowCast';
import { WORLD } from './WorldConfig';
import { playWaterPlaneDiameter } from './water/config/waterExtent';
import { initWaterWaveEditorPreview } from './water/material/waterWaveUniforms';
import { createPantheonWater } from './water/mesh/createPantheonWater';
import { disposePantheonWater } from './water/mesh/disposePantheonWater';

export interface MapTerrainContext {
  /** Visible terrain — Mesh (editor) or play LOD Group (fine center + coarse macro). */
  mesh: Mesh | Group;
  /** Macro hill shadow caster — CPU-baked geometry, not drawn in main pass. */
  shadowCastMesh: Mesh | null;
  water: Object3D;
  splatMaterial: TerrainSplatMaterial;
  /** Play coarse layer — same splat shader as splatMaterial, complementary ring cutout. */
  macroSplatMaterial?: TerrainSplatMaterial;
  grids: MapGrids;
  biomeMap: DataTexture;
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
  /** Snap fine center patch + uDetailPatchOrigin (play mode). */
  updateLod: (playerX: number, playerZ: number) => void;
  lodEnabled: boolean;
  /** R8 biome displacement atlas — grass height alignment in play mode. */
  detailDisplacementMap: Texture | null;
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
  geometry: BufferGeometry,
  grids: MapGrids,
  region?: GridDirtyRegion,
): void {
  const { SIZE, HEIGHT_SCALE } = WORLD;
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
      (x < worldBounds.xMin || x > worldBounds.xMax || z < worldBounds.zMin || z > worldBounds.zMax)
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
  const propAoMap = createEmptyPropContactAoTexture(grids.size);

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
      propAoMap,
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

    let lastDetailSnapX = Number.NaN;
    let lastDetailSnapZ = Number.NaN;

    updateLod = (playerX: number, playerZ: number) => {
      const snap = playTerrainLod!.update(playerX, playerZ);
      if (snap.snapX === lastDetailSnapX && snap.snapZ === lastDetailSnapZ) return;
      lastDetailSnapX = snap.snapX;
      lastDetailSnapZ = snap.snapZ;
      for (const mat of [splatMaterial, macroSplatMaterial!]) {
        (mat.terrainUniforms.uDetailPatchOrigin.value as Vector2).set(snap.snapX, snap.snapZ);
      }
    };
    lodVertexStats = playTerrainLod.vertexStats;
    scene.add(mesh);
  } else {
    splatMaterial = createTerrainSplatMaterial(textures, sun, {
      biomeMap,
      pathMap,
      meadowMap,
      heightMap,
      propAoMap,
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
    applyGridHeightsToGeometry(shadowGeo, grids);
    shadowCastMesh = createTerrainShadowCastMesh(shadowGeo);
    scene.add(shadowCastMesh);
  }

  const syncHeights = (region?: GridDirtyRegion) => {
    updateHeightTexture(heightMap, grids, region);
    if (!lod && mesh instanceof Mesh) {
      applyGridHeightsToGeometry(mesh.geometry, grids, region);
    }
    if (shadowCastMesh) {
      applyGridHeightsToGeometry(shadowCastMesh.geometry, grids, region);
    }
  };
  syncHeights();

  const waterY = WORLD.BIOMES.WATER.max * HEIGHT_SCALE;
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
    splatMaterial,
    macroSplatMaterial,
    grids,
    biomeMap,
    pathMap,
    meadowMap,
    heightMap,
    propAoMap,
    getHeightAt,
    getWorldY,
    getBiomeAt,
    applyHeightsToMesh: syncHeights,
    uploadBiomeMap,
    updateLod,
    lodEnabled: lod,
    detailDisplacementMap: vertexDispEnabled ? textures.detailDisplacement : null,
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
  context.propAoMap.dispose();
  disposePantheonWater(context.water);
}

/** Alias used by play bootstrap / tick — same as {@link MapTerrainContext}. */
export type WorldTerrain = MapTerrainContext;

export function disposeWorldTerrain(terrain: WorldTerrain): void {
  disposeMapTerrain(terrain);
}
