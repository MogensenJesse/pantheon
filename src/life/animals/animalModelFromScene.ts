// src/life/animals/animalModelFromScene.ts — reads a modelled animal out of a loaded glTF scene (node-runnable)
//
// A file holds one model: a node per rigid part, named for the part (`body`, `head`, `leg_fl`, ...), its origin at
// the joint it turns about, the whole thing standing on y = 0 with its feet centred, facing +Z. Meshes inside a
// part node (or a mesh named for the part) belong to that part. The model is scaled so its standing height is
// `life.MODEL_HEIGHT_M[key]`, whatever size it was made at.

import { Box3, Matrix4, type Mesh, type Object3D, Vector3 } from 'three';
import { life } from '../../config/visual/life.ts';
import type { AnimalModel, ModelPart, PartDraw } from './animalModels.ts';

/** `head.001` -> `head` (Blender numbers duplicates). */
const cleanName = (name: string) => name.replace(/\.\d+$/, '');

/**
 * The part a mesh belongs to: the nearest node from the mesh up to (not including) the model's root whose name is
 * not the model's own key, and that is not empty.
 */
function partNodeOf(mesh: Object3D, root: Object3D, key: string): Object3D {
  let node: Object3D | null = mesh;
  while (node && node !== root) {
    const name = cleanName(node.name);
    if (name && name !== key) return node;
    node = node.parent;
  }
  return mesh;
}

/** Read a modelled animal out of a loaded scene; null when it has no mesh. */
export function modelFromScene(key: string, scene: Object3D): AnimalModel | null {
  // the model root: the node named for the key, or the scene itself
  const root = scene.getObjectByName(key) ?? scene;
  root.updateWorldMatrix(true, true);
  const toModel = root.matrixWorld.clone().invert();

  const byName = new Map<string, ModelPart>();
  const geometries = new Set<PartDraw['geometry']>();
  const box = new Box3();
  const meshMatrix = new Matrix4();
  const toPivot = new Matrix4();
  const pivotPoint = new Vector3();

  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const node = partNodeOf(mesh, root, key);
    const name = cleanName(node.name) || cleanName(mesh.name) || 'body';
    let part = byName.get(name);
    if (!part) {
      pivotPoint.setFromMatrixPosition(meshMatrix.multiplyMatrices(toModel, node.matrixWorld));
      part = { name, pivot: [pivotPoint.x, pivotPoint.y, pivotPoint.z], draws: [] };
      byName.set(name, part);
    }
    meshMatrix.multiplyMatrices(toModel, mesh.matrixWorld);
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(
      toPivot.makeTranslation(-part.pivot[0], -part.pivot[1], -part.pivot[2]).multiply(meshMatrix),
    );
    geometries.add(geometry);
    const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
    part.draws.push({ geometry, material });
    geometry.computeBoundingBox();
    box.union(geometry.boundingBox!.clone().translate(pivotPoint.set(...part.pivot)));
  });
  if (byName.size === 0) return null;

  const height = box.max.y - box.min.y;
  const target = (life.MODEL_HEIGHT_M as Readonly<Record<string, number>>)[key];
  const scale = target && height > 1e-6 ? target / height : 1;
  const materials = new Set([...byName.values()].flatMap((p) => p.draws.map((d) => d.material)));
  return {
    key,
    parts: [...byName.values()],
    scale,
    footY: box.min.y,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) {
        (m as { map?: { dispose: () => void } | null }).map?.dispose();
        m.dispose();
      }
    },
  };
}
