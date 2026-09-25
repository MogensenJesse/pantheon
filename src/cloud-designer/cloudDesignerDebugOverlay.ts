// src/cloud-designer/cloudDesignerDebugOverlay.ts — designer debug drawn on the preview deck
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  type Scene,
  SphereGeometry,
  SRGBColorSpace,
} from 'three';
import { samplePreviewPlacementWeight } from '../rendering/clouds/generateCloudField';
import type { DesignerPreviewDebugSnapshot } from './buildDesignerPreviewBank';

export interface CloudDesignerDebugViews {
  coverage: boolean;
  clusters: boolean;
}

const COVERAGE_CELLS = 128;

export interface CloudDesignerDebugOverlay {
  sync: (views: CloudDesignerDebugViews, snapshot: DesignerPreviewDebugSnapshot | null) => void;
  dispose: () => void;
}

export function createCloudDesignerDebugOverlay(scene: Scene): CloudDesignerDebugOverlay {
  const root = new Group();
  root.name = 'cloudDesignerDebug';
  root.frustumCulled = false;
  scene.add(root);

  const sync = (
    views: CloudDesignerDebugViews,
    snapshot: DesignerPreviewDebugSnapshot | null,
  ): void => {
    clearGroup(root);
    const anyOn = views.coverage || views.clusters;
    root.visible = anyOn && snapshot !== null;
    if (!anyOn || !snapshot) return;
    if (views.coverage) root.add(createWeightHeatmap(snapshot));
    if (views.clusters) root.add(createClusterMarkers(snapshot));
  };

  return {
    sync,
    dispose: () => {
      clearGroup(root);
      scene.remove(root);
    },
  };
}

function clearGroup(root: Group): void {
  for (const child of [...root.children]) {
    root.remove(child);
    disposeObject(child);
  }
}

function disposeObject(object: Object3D): void {
  if (object instanceof Group) {
    for (const child of object.children) disposeObject(child);
  }
  if (object instanceof Mesh) {
    object.geometry.dispose();
    const material = object.material;
    const materials = Array.isArray(material) ? material : [material];
    for (const entry of materials) {
      if (entry instanceof MeshBasicMaterial && entry.map) entry.map.dispose();
      entry.dispose();
    }
  }
}

function createClusterMarkers(snapshot: DesignerPreviewDebugSnapshot): Group {
  const group = new Group();
  group.name = 'cloudDesignerClusters';
  for (const site of snapshot.sites) {
    const marker = new Mesh(
      new SphereGeometry(7, 10, 8),
      new MeshBasicMaterial({
        color: 0xff5a1f,
        fog: false,
        toneMapped: false,
        depthTest: false,
      }),
    );
    marker.position.set(site.x, site.y, site.z);
    marker.frustumCulled = false;
    marker.renderOrder = 4;
    marker.castShadow = false;
    marker.receiveShadow = false;
    group.add(marker);
  }
  return group;
}

/** Slider 0 is flat yellow. As it rises, dense cores go red and the fringe goes green. */
function weightRgb(weight: number, slider: number): { r: number; g: number; b: number } {
  const yellow = { r: 255, g: 255, b: 0 };
  const s = Math.max(0, Math.min(1, slider));
  if (s <= 1e-6) return yellow;
  const separated = (weight - (1 - s)) / s;
  const t = Math.max(0, Math.min(1, separated));
  const end =
    t <= 0.5
      ? { r: Math.round((t / 0.5) * 255), g: 255, b: 0 }
      : { r: 255, g: Math.round((1 - (t - 0.5) / 0.5) * 255), b: 0 };
  return {
    r: Math.round(yellow.r + (end.r - yellow.r) * s),
    g: Math.round(yellow.g + (end.g - yellow.g) * s),
    b: 0,
  };
}

/** Transparent deck sheet of the pick weight. Clear outside the coverage mask. */
function createWeightHeatmap(snapshot: DesignerPreviewDebugSnapshot): Mesh {
  const cells = COVERAGE_CELLS;
  const canvas = document.createElement('canvas');
  canvas.width = cells;
  canvas.height = cells;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const image = ctx.createImageData(cells, cells);
    const half = snapshot.spread * 0.5;
    for (let iy = 0; iy < cells; iy++) {
      for (let ix = 0; ix < cells; ix++) {
        const x = -half + ((ix + 0.5) / cells) * snapshot.spread;
        const z = half - ((iy + 0.5) / cells) * snapshot.spread;
        const weight = samplePreviewPlacementWeight(snapshot.settings, x, z, snapshot.supercluster);
        const pixel = (iy * cells + ix) * 4;
        if (weight === null) {
          image.data[pixel + 3] = 0;
          continue;
        }
        const rgb = weightRgb(weight, snapshot.supercluster);
        image.data[pixel] = rgb.r;
        image.data[pixel + 1] = rgb.g;
        image.data[pixel + 2] = rgb.b;
        image.data[pixel + 3] = 150;
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = false;
  texture.needsUpdate = true;
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new Mesh(new PlaneGeometry(snapshot.spread, snapshot.spread), material);
  mesh.name = 'cloudDesignerCoverage';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = snapshot.deckY;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
