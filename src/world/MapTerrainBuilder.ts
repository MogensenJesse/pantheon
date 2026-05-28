// src/world/MapTerrainBuilder.ts — terrain mesh from authored height/biome grids
import {
  CircleGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  Scene,
  type DataTexture,
} from 'three';
import type { TerrainSplatMaterial } from './terrain/TerrainSplatMaterial';
import type { TerrainTextureSet } from './terrain/loadTerrainTextures';
import {
  createTerrainSplatMaterial,
  disposeTerrainSplatMaterial,
} from './terrain/TerrainSplatMaterial';
import { WORLD } from './WorldConfig';
import type { MapGrids } from '../map/MapGrids';
import {
  createBiomeWeightTexture,
  sampleHeightBilinear,
  updateBiomeWeightTexture,
} from '../map/MapGrids';

export interface MapTerrainContext {
  mesh: Mesh;
  water: Object3D;
  seafloor: Mesh;
  splatMaterial: TerrainSplatMaterial;
  grids: MapGrids;
  biomeMap: DataTexture;
  getHeightAt: (x: number, z: number) => number;
  getWorldY: (x: number, z: number) => number;
  applyHeightsToMesh: () => void;
  uploadBiomeMap: () => void;
}

const WATER_COLOR = 0x1a3a5c;

const WATER_TIERS: ReadonlyArray<{ rInner: number; rOuter: number; opacity: number }> = [
  { rInner: 0.0, rOuter: 0.25, opacity: 0.85 },
  { rInner: 0.25, rOuter: 0.55, opacity: 0.95 },
  { rInner: 0.55, rOuter: 1.0, opacity: 1.0 },
];

function buildWaterRings(waterRadius: number, waterY: number): Object3D {
  const group = new Group();
  for (const tier of WATER_TIERS) {
    const rOuter = waterRadius * tier.rOuter;
    const rInner = waterRadius * tier.rInner;
    const geo =
      tier.rInner === 0
        ? new CircleGeometry(rOuter, 96)
        : new RingGeometry(rInner, rOuter, 96, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new MeshBasicMaterial({
      color: WATER_COLOR,
      transparent: tier.opacity < 1,
      opacity: tier.opacity,
      depthWrite: tier.opacity >= 1,
    });
    const ring = new Mesh(geo, mat);
    ring.position.y = waterY;
    ring.renderOrder = 1;
    group.add(ring);
  }
  return group;
}

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
}

export function buildMapTerrain(
  scene: Scene,
  textures: TerrainTextureSet,
  sun: DirectionalLight,
  grids: MapGrids,
  options: BuildMapTerrainOptions = {},
): MapTerrainContext {
  const { receiveShadow = true } = options;
  const { SIZE, SEGMENTS, HEIGHT_SCALE } = WORLD;
  const geometry = new PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
  geometry.rotateX(-Math.PI / 2);

  const biomeMap = createBiomeWeightTexture(grids);
  const splatMaterial = createTerrainSplatMaterial(textures, sun, { biomeMap });
  const mesh = new Mesh(geometry, splatMaterial);
  mesh.receiveShadow = receiveShadow;
  scene.add(mesh);

  const applyHeightsToMesh = () => applyGridHeightsToGeometry(mesh, grids);
  applyHeightsToMesh();

  const waterY = WORLD.BIOMES.WATER.max * HEIGHT_SCALE;
  const waterRadius = WORLD.WATER_PLANE_SIZE * 0.5;

  const seafloorGeo = new CircleGeometry(waterRadius * 1.02, 64);
  seafloorGeo.rotateX(-Math.PI / 2);
  const seafloor = new Mesh(
    seafloorGeo,
    new MeshBasicMaterial({ color: 0x0a1a2e, depthWrite: true }),
  );
  seafloor.position.y = waterY - 4;
  scene.add(seafloor);

  const water = buildWaterRings(waterRadius, waterY);
  scene.add(water);

  const getHeightAt = (x: number, z: number) => sampleHeightBilinear(grids, x, z, SIZE);
  const getWorldY = (x: number, z: number) => getHeightAt(x, z) * HEIGHT_SCALE;
  const uploadBiomeMap = () => updateBiomeWeightTexture(biomeMap, grids);

  return {
    mesh,
    water,
    seafloor,
    splatMaterial,
    grids,
    biomeMap,
    getHeightAt,
    getWorldY,
    applyHeightsToMesh,
    uploadBiomeMap,
  };
}

export function disposeMapTerrain(context: MapTerrainContext): void {
  context.mesh.geometry.dispose();
  disposeTerrainSplatMaterial(context.splatMaterial);
  context.biomeMap.dispose();
  context.water.traverse((obj) => {
    const m = obj as Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (m.material as Material).dispose();
    }
  });
  context.seafloor.geometry.dispose();
  (context.seafloor.material as { dispose?: () => void }).dispose?.();
}
