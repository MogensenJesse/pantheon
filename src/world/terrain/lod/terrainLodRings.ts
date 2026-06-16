// src/world/terrain/lod/terrainLodRings.ts — camera-centered geometry clipmap rings
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  PlaneGeometry,
  type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VISUAL } from '../../../config/visualTuning';
import { enableWaterReflectionLayer } from '../../water/waterReflectionLayers';

export interface TerrainLodRingSpec {
  /** Vertex spacing multiplier vs the finest (center) step. */
  stepMul: number;
  /** Inner hole half-width in cells at this ring's step. */
  innerCells: number;
  /** Outer square half-width in cells at this ring's step. */
  outerCells: number;
}

export interface TerrainLodConfig {
  centerCells: number;
  rings: TerrainLodRingSpec[];
  skirtDepth: number;
}

export function terrainLodConfigFromVisual(): TerrainLodConfig {
  const { centerCells, rings, skirtDepth } = VISUAL.terrain.lod;
  return { centerCells, rings: [...rings], skirtDepth };
}

function finalizeLodGeometry(geometry: BufferGeometry): BufferGeometry {
  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }
  return geometry;
}

/** Full square patch for the innermost clipmap level (Y = 0; macro height applied in shader). */
export function createLodCenterGeometry(step: number, cells: number): BufferGeometry {
  const size = cells * step;
  const geometry = new PlaneGeometry(size, size, cells, cells);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** Rectangular grid strip on the XZ plane (local Y = 0). */
function createLodStripGeometry(
  step: number,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
): BufferGeometry {
  const xCells = Math.max(1, Math.round(Math.abs(x1 - x0) / step));
  const zCells = Math.max(1, Math.round(Math.abs(z1 - z0) / step));
  const xStep = (x1 - x0) / xCells;
  const zStep = (z1 - z0) / zCells;
  const vertStride = xCells + 1;
  const positions = new Float32Array(vertStride * (zCells + 1) * 3);
  const indices: number[] = [];

  for (let j = 0; j <= zCells; j++) {
    for (let i = 0; i <= xCells; i++) {
      const vi = (j * vertStride + i) * 3;
      positions[vi] = x0 + i * xStep;
      positions[vi + 1] = 0;
      positions[vi + 2] = z0 + j * zStep;
    }
  }

  for (let j = 0; j < zCells; j++) {
    for (let i = 0; i < xCells; i++) {
      const a = j * vertStride + i;
      const b = a + 1;
      const c = a + vertStride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return finalizeLodGeometry(geometry);
}

/**
 * Indexed square annulus: four axis-aligned strips around an inner hole.
 * `innerCells` / `outerCells` are half-widths in cells at `step` spacing.
 */
export function createLodRingGeometry(
  step: number,
  innerCells: number,
  outerCells: number,
): BufferGeometry {
  const inner = innerCells * step;
  const outer = outerCells * step;
  const strips = [
    createLodStripGeometry(step, -outer, outer, inner, outer),
    createLodStripGeometry(step, -outer, outer, -outer, -inner),
    createLodStripGeometry(step, -outer, -inner, -inner, inner),
    createLodStripGeometry(step, inner, outer, -inner, inner),
  ];
  const merged = mergeGeometries(strips, false);
  if (!merged) {
    throw new Error('createLodRingGeometry: failed to merge strip geometries');
  }
  for (const strip of strips) {
    strip.dispose();
  }
  return finalizeLodGeometry(merged);
}

/** Vertical ribbon along one edge — local Y runs 0 (surface) to -skirtDepth. */
function createSkirtWallGeometry(
  step: number,
  axis: 'x' | 'z',
  fixed: number,
  along0: number,
  along1: number,
  skirtDepth: number,
): BufferGeometry {
  const cells = Math.max(1, Math.round(Math.abs(along1 - along0) / step));
  const alongStep = (along1 - along0) / cells;
  const positions = new Float32Array((cells + 1) * 2 * 3);
  const indices: number[] = [];

  for (let i = 0; i <= cells; i++) {
    const along = along0 + i * alongStep;
    const top = i * 2;
    const bottom = top + 1;
    const x = axis === 'x' ? along : fixed;
    const z = axis === 'z' ? along : fixed;
    positions[top * 3] = x;
    positions[top * 3 + 1] = 0;
    positions[top * 3 + 2] = z;
    positions[bottom * 3] = x;
    positions[bottom * 3 + 1] = -skirtDepth;
    positions[bottom * 3 + 2] = z;
    if (i < cells) {
      const a = top;
      const b = bottom;
      const c = top + 2;
      const d = bottom + 2;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return finalizeLodGeometry(geometry);
}

/** Inner + outer perimeter skirts for one annulus ring. */
export function createLodRingSkirtGeometry(
  step: number,
  innerCells: number,
  outerCells: number,
  skirtDepth: number,
): BufferGeometry {
  const inner = innerCells * step;
  const outer = outerCells * step;
  const walls = [
    createSkirtWallGeometry(step, 'x', outer, -outer, outer, skirtDepth),
    createSkirtWallGeometry(step, 'x', -outer, -outer, outer, skirtDepth),
    createSkirtWallGeometry(step, 'z', outer, -outer, outer, skirtDepth),
    createSkirtWallGeometry(step, 'z', -outer, -outer, outer, skirtDepth),
    createSkirtWallGeometry(step, 'x', inner, -inner, inner, skirtDepth),
    createSkirtWallGeometry(step, 'x', -inner, -inner, inner, skirtDepth),
    createSkirtWallGeometry(step, 'z', inner, -inner, inner, skirtDepth),
    createSkirtWallGeometry(step, 'z', -inner, -inner, inner, skirtDepth),
  ];
  const merged = mergeGeometries(walls, false);
  if (!merged) {
    throw new Error('createLodRingSkirtGeometry: failed to merge skirt walls');
  }
  for (const wall of walls) {
    wall.dispose();
  }
  return finalizeLodGeometry(merged);
}

export interface TerrainLodMesh {
  group: Group;
  meshes: Mesh[];
  /** Vertex spacing per mesh (center first, then rings). */
  steps: number[];
  update: (cameraX: number, cameraZ: number) => void;
  dispose: () => void;
}

/** Snap world XZ to a clipmap grid origin at the given vertex spacing. */
export function snapLodOrigin(coord: number, step: number): number {
  return Math.floor(coord / step) * step;
}

/** Center patch + annulus rings, all sharing one splat material. */
export function createTerrainLodMesh(
  material: Material,
  baseStep: number,
  config: TerrainLodConfig = terrainLodConfigFromVisual(),
): TerrainLodMesh {
  const group = new Group();
  group.name = 'terrain-lod';
  const meshes: Mesh[] = [];
  const steps: number[] = [];

  const centerGeo = createLodCenterGeometry(baseStep, config.centerCells);
  const centerMesh = new Mesh(centerGeo, material);
  centerMesh.name = 'terrain-lod-center';
  centerMesh.castShadow = false;
  enableWaterReflectionLayer(centerMesh);
  group.add(centerMesh);
  meshes.push(centerMesh);
  steps.push(baseStep);

  for (let i = 0; i < config.rings.length; i++) {
    const ring = config.rings[i]!;
    const step = baseStep * ring.stepMul;
    const surface = createLodRingGeometry(step, ring.innerCells, ring.outerCells);
    const skirt = createLodRingSkirtGeometry(
      step,
      ring.innerCells,
      ring.outerCells,
      config.skirtDepth,
    );
    const ringGeo = mergeGeometries([surface, skirt], false);
    surface.dispose();
    skirt.dispose();
    if (!ringGeo) {
      throw new Error(`createTerrainLodMesh: failed to merge ring ${i}`);
    }
    const ringMesh = new Mesh(finalizeLodGeometry(ringGeo), material);
    ringMesh.name = `terrain-lod-ring-${i}`;
    ringMesh.castShadow = false;
    enableWaterReflectionLayer(ringMesh);
    group.add(ringMesh);
    meshes.push(ringMesh);
    steps.push(step);
  }

  const update = (cameraX: number, cameraZ: number) => {
    for (let i = 0; i < meshes.length; i++) {
      const step = steps[i]!;
      const mesh = meshes[i]!;
      mesh.position.set(snapLodOrigin(cameraX, step), 0, snapLodOrigin(cameraZ, step));
    }
  };

  return {
    group,
    meshes,
    steps,
    update,
    dispose: () => {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
      }
    },
  };
}
