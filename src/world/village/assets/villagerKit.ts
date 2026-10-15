// src/world/village/assets/villagerKit.ts — modelled villager figures (villagers.glb) as GPU-rigged geometry
import {
  BufferGeometry,
  Float32BufferAttribute,
  Matrix4,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
} from 'three';
import { Role, type RoleId, Sex, type SexId } from '../model/types.ts';
import { VillagerPart, VillagerSlot } from './placeholder/villagerFigure.ts';

const ROLE_NAMES = new Map<number, string>(
  Object.entries(Role).map(([name, id]) => [id, name.toLowerCase()]),
);

/** Node name of one figure in villagers.glb, e.g. `villager_builder_f`. */
export function figureNodeName(role: RoleId, sex: SexId): string {
  return `villager_${ROLE_NAMES.get(role)}_${sex === Sex.Female ? 'f' : 'm'}`;
}

const SLOT_OF_MATERIAL: Record<string, number> = {
  villager_skin: VillagerSlot.Skin,
  villager_hair: VillagerSlot.Hair,
  villager_tunic: VillagerSlot.Tunic,
};

/**
 * One figure from the kit (`assets-src/village/villager_build.py`), in the placeholder's attribute layout:
 * non-indexed position and normal in figure space, colour (rgb + slot / 3) and `aRig` (pivot xyz + part).
 * Every mesh belongs to the rig part named by the `part` extra on its node (or an ancestor) and swings
 * about that node's `pivot` extra. Slot materials get white: the shader tints them. Null when the file
 * has no such figure.
 */
export function figureFromKit(root: Object3D, role: RoleId, sex: SexId): BufferGeometry | null {
  const figure = root.getObjectByName(figureNodeName(role, sex));
  if (!figure) return null;
  figure.updateWorldMatrix(true, true);
  const toFigure = figure.matrixWorld.clone().invert();
  const position: number[] = [];
  const normal: number[] = [];
  const color: number[] = [];
  const rig: number[] = [];
  const matrix = new Matrix4();
  figure.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    let node: Object3D | null = mesh;
    while (node && node !== figure && node.userData.part === undefined) node = node.parent;
    const part = VillagerPart[node?.userData.part as keyof typeof VillagerPart];
    const pivot = node?.userData.pivot as number[] | undefined;
    if (part === undefined || pivot?.length !== 3) {
      throw new Error(`villager kit: ${mesh.name} has no valid part / pivot extras`);
    }
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    source.applyMatrix4(matrix.multiplyMatrices(toFigure, mesh.matrixWorld));
    const material = mesh.material as MeshStandardMaterial;
    const slot = SLOT_OF_MATERIAL[material.name] ?? VillagerSlot.Fixed;
    const c = slot === VillagerSlot.Fixed ? material.color : { r: 1, g: 1, b: 1 };
    const p = source.getAttribute('position');
    const n = source.getAttribute('normal');
    for (let i = 0; i < p.count; i++) {
      position.push(p.getX(i), p.getY(i), p.getZ(i));
      normal.push(n.getX(i), n.getY(i), n.getZ(i));
      color.push(c.r, c.g, c.b, slot / 3);
      rig.push(pivot[0]!, pivot[1]!, pivot[2]!, part);
    }
    source.dispose();
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(position, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normal, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(color, 4));
  geometry.setAttribute('aRig', new Float32BufferAttribute(rig, 4));
  return geometry;
}
