// src/world/MapTerrainBuilder.ts — terrain mesh from authored height/biome grids
import {
  CircleGeometry,
  type DataTexture,
  type DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  type Scene,
  type Texture,
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
import { createTerrainLodMesh } from './terrain/lod/terrainLodRings';
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
  /** Reposition LOD rings to the player (no-op for editor / single mesh). */
  updateLod: (playerX: number, playerZ: number) => void;
}

/** CPU-bake sculpt height into geometry (shadow caster; editor optional legacy path). */
function applyGridHeightsToGeometry(mesh: Mesh, grids: MapGrids): void {
  const { SIZE, HEIGHT_SCALE } = WORLD;
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position;
  const heightNorms: number[] = [];

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const h = sampleHeightBilinear(grids, x, z, SIZE);
    positions.setY(i, h * HEIGHT_SCALE);
    heightNorms.push(h);
  }

  geometry.setAttribute('heightNorm', new Float32BufferAttribute(heightNorms, 1));
  geometry.computeVertexNormals();
  positions.needsUpdate = true;
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
  /**
   * When true (play default), visible mesh stays flat — macro height sampled in vertex shader.
   * Shadow caster uses a separate CPU-baked mesh when castShadow is enabled.
   */
  gpuMacroHeight?: boolean;
  /** Play-mode geometry clipmap rings (editor always uses a single mesh). */
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
    gpuMacroHeight = true,
    lod = false,
  } = options;
  const { SIZE, HEIGHT_SCALE } = WORLD;
  const finestSegments = meshSegmentsOverride ?? VISUAL.terrain.meshSegments;
  const finestStep = SIZE / finestSegments;

  const biomeMap = createBiomeWeightTexture(grids);
  const pathMap = createPathMaskTexture(grids);
  const meadowMap = createMeadowMaskTexture(grids);
  const heightMap = createHeightTexture(grids);
  const splatMaterial = createTerrainSplatMaterial(textures, sun, {
    biomeMap,
    pathMap,
    meadowMap,
    heightMap,
    meshSegments: finestSegments,
    vertexDisplacement:
      vertexDisplacement ?? (textures.hasDisplacementMaps && VISUAL.terrain.displacementEnabled),
  });

  let mesh: Mesh | Group;
  let legacyGeometry: PlaneGeometry | null = null;
  let updateLod: (playerX: number, playerZ: number) => void = () => {};

  if (lod) {
    const lodMesh = createTerrainLodMesh(splatMaterial, finestStep);
    mesh = lodMesh.group;
    for (const ringMesh of lodMesh.meshes) {
      ringMesh.receiveShadow = receiveShadow;
    }
    updateLod = (playerX: number, playerZ: number) => {
      lodMesh.update(playerX, playerZ);
    };
    scene.add(mesh);
  } else {
    legacyGeometry = new PlaneGeometry(SIZE, SIZE, finestSegments, finestSegments);
    legacyGeometry.rotateX(-Math.PI / 2);
    const singleMesh = new Mesh(legacyGeometry, splatMaterial);
    singleMesh.castShadow = false;
    singleMesh.receiveShadow = receiveShadow;
    enableWaterReflectionLayer(singleMesh);
    mesh = singleMesh;
    scene.add(mesh);
  }

  let shadowCastMesh: Mesh | null = null;
  if (castShadow) {
    const shadowSegments = lod
      ? VISUAL.terrain.lod.shadowMeshSegments
      : finestSegments;
    const shadowGeo = new PlaneGeometry(SIZE, SIZE, shadowSegments, shadowSegments);
    shadowGeo.rotateX(-Math.PI / 2);
    applyGridHeightsToGeometry(new Mesh(shadowGeo), grids);
    shadowCastMesh = createTerrainShadowCastMesh(shadowGeo);
    scene.add(shadowCastMesh);
  }

  const syncHeights = () => {
    updateHeightTexture(heightMap, grids);
    if (shadowCastMesh) {
      applyGridHeightsToGeometry(shadowCastMesh, grids);
    }
    if (!gpuMacroHeight && mesh instanceof Mesh && legacyGeometry) {
      applyGridHeightsToGeometry(mesh, grids);
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
  };
}

export function disposeMapTerrain(context: MapTerrainContext): void {
  if (context.shadowCastMesh) {
    const shadowGeo = context.shadowCastMesh.geometry;
    disposeTerrainShadowCastMesh(context.shadowCastMesh);
    shadowGeo.dispose();
  }

  if (context.mesh instanceof Group) {
    context.mesh.traverse((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
      }
    });
  } else {
    context.mesh.geometry.dispose();
  }

  disposeTerrainSplatMaterial(context.splatMaterial);
  context.biomeMap.dispose();
  context.pathMap.dispose();
  context.meadowMap.dispose();
  context.heightMap.dispose();
  disposePantheonWater(context.water);
  context.seafloor.geometry.dispose();
  (context.seafloor.material as { dispose?: () => void }).dispose?.();
}
