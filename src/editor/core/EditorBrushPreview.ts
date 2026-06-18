// src/editor/core/EditorBrushPreview.ts — terrain-conforming brush ring(s) on hover
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  type Scene,
} from 'three';
import type { EditorHit } from './EditorInput';

export interface EditorBrushPreviewOptions {
  radius: number;
  /** 0–1 paint hardness; inner ring shows hard stamp core when < 1. */
  hardness?: number;
  visible: boolean;
}

export interface EditorBrushPreviewContext {
  update: (hit: EditorHit | null, options: EditorBrushPreviewOptions) => void;
  dispose: () => void;
}

export type SurfaceYSampler = (x: number, z: number) => number;

/** Grid height sampler — O(1) per vertex; matches editor CPU mesh (same height grid). */
const PREVIEW_RENDER_ORDER = 1000;
const TUBE = 0.035;
const SEGMENTS = 32;
const LIFT = 0.12;

function createRingGeometry(segments: number): BufferGeometry {
  const vertCount = (segments + 1) * 2;
  const positions = new Float32Array(vertCount * 3);
  const indices: number[] = [];

  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, b, d, a, d, c);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function updateRingGeometry(
  geometry: BufferGeometry,
  hit: EditorHit,
  radius: number,
  innerRadius: number,
  sampleY: SurfaceYSampler,
): void {
  const positions = geometry.getAttribute('position') as BufferAttribute;
  const data = positions.array as Float32Array;

  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const base = i * 6;

    const innerX = hit.x + cos * innerRadius;
    const innerZ = hit.z + sin * innerRadius;
    data[base] = cos * innerRadius;
    data[base + 1] = sampleY(innerX, innerZ) - hit.y + LIFT;
    data[base + 2] = sin * innerRadius;

    const outerX = hit.x + cos * radius;
    const outerZ = hit.z + sin * radius;
    data[base + 3] = cos * radius;
    data[base + 4] = sampleY(outerX, outerZ) - hit.y + LIFT;
    data[base + 5] = sin * radius;
  }

  positions.needsUpdate = true;
}

function createRingMesh(color: number, opacity: number): Mesh {
  const mat = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: DoubleSide,
    depthTest: true,
    depthWrite: false,
  });
  const mesh = new Mesh(createRingGeometry(SEGMENTS), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = PREVIEW_RENDER_ORDER;
  return mesh;
}

export function createEditorBrushPreview(
  scene: Scene,
  sampleSurfaceY: SurfaceYSampler,
): EditorBrushPreviewContext {
  const root = new Object3D();
  root.name = 'EditorBrushPreview';
  root.frustumCulled = false;

  const outerRing = createRingMesh(0xf0f4ff, 0.92);
  const innerRing = createRingMesh(0xffffff, 0.55);

  root.add(outerRing);
  root.add(innerRing);
  scene.add(root);
  root.visible = false;

  return {
    update(hit, options) {
      const show = options.visible && hit !== null && options.radius > 0;
      root.visible = show;
      if (!show || !hit) return;

      root.position.set(hit.x, hit.y, hit.z);

      const radius = options.radius;
      const innerOuter = radius * (1 - TUBE);
      updateRingGeometry(outerRing.geometry, hit, radius, innerOuter, sampleSurfaceY);

      const hardness = options.hardness ?? 1;
      const showInner = hardness < 0.995;
      innerRing.visible = showInner;
      if (showInner) {
        const coreRadius = radius * Math.max(0.05, hardness);
        const coreInner = coreRadius * (1 - TUBE);
        updateRingGeometry(innerRing.geometry, hit, coreRadius, coreInner, sampleSurfaceY);
      }
    },
    dispose() {
      scene.remove(root);
      outerRing.geometry.dispose();
      innerRing.geometry.dispose();
      (outerRing.material as MeshBasicMaterial).dispose();
      (innerRing.material as MeshBasicMaterial).dispose();
    },
  };
}
