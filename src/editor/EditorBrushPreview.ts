// src/editor/EditorBrushPreview.ts — terrain-following brush ring(s) on hover
import { DoubleSide, Mesh, MeshBasicMaterial, Object3D, RingGeometry, type Scene } from 'three';
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

const PREVIEW_RENDER_ORDER = 1000;
const TUBE = 0.035;

function createRingMesh(color: number, opacity: number): Mesh {
  const geo = new RingGeometry(1 - TUBE, 1, 64);
  const mat = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: DoubleSide,
    depthTest: true,
    depthWrite: false,
  });
  const mesh = new Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  mesh.renderOrder = PREVIEW_RENDER_ORDER;
  return mesh;
}

export function createEditorBrushPreview(scene: Scene): EditorBrushPreviewContext {
  const root = new Object3D();
  root.name = 'EditorBrushPreview';
  root.frustumCulled = false;

  const outerRing = createRingMesh(0xf0f4ff, 0.92);
  const innerRing = createRingMesh(0xffffff, 0.55);

  root.add(outerRing);
  root.add(innerRing);
  scene.add(root);
  root.visible = false;

  const lift = 0.35;

  return {
    update(hit, options) {
      const show = options.visible && hit !== null && options.radius > 0;
      root.visible = show;
      if (!show || !hit) return;

      root.position.set(hit.x, hit.y + lift, hit.z);
      outerRing.scale.set(options.radius, options.radius, 1);

      const hardness = options.hardness ?? 1;
      const showInner = hardness < 0.995;
      innerRing.visible = showInner;
      if (showInner) {
        const coreRadius = options.radius * Math.max(0.05, hardness);
        innerRing.scale.set(coreRadius, coreRadius, 1);
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
