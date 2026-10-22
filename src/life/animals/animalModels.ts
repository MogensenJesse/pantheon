// src/life/animals/animalModels.ts — what an animal model is, and the stand-in models used until yours arrive
//
// A model is a set of rigid, separately named parts. Each part hangs from a pivot at its joint (in model space:
// metres, +Y up, facing +Z, origin at the centre of the feet) and its geometry is relative to that pivot, so a
// pose is just a turn about the pivot (animalPose.ts). The stand-ins are chunky vertex-coloured toys built with
// the village's MeshBuilder; a modelled `public/models/animals/<key>.glb` replaces the stand-in of the same key.

import { type BufferGeometry, type Material, MeshStandardMaterial } from 'three';
import { MeshBuilder, type V3 } from '../../world/village/assets/placeholder/meshBuilder.ts';
import { PALETTE as P, rgb } from '../../world/village/assets/placeholder/palette.ts';

/** One drawn piece of a part (a part with two materials has two). */
export interface PartDraw {
  geometry: BufferGeometry;
  material: Material;
}

export interface ModelPart {
  /** `body`, `head`, `leg_fl`, ... (see the rig of the model in animalPose.ts). */
  name: string;
  /** The joint the part turns about, in model space. */
  pivot: V3;
  draws: PartDraw[];
}

export interface AnimalModel {
  key: string;
  parts: ModelPart[];
  /** The model scaled so its standing height (rest pose) is this many metres; 1 for the stand-ins. */
  scale: number;
  /** How far above y = 0 the model's lowest point is (a model made floating is sunk to the ground); 0 for the stand-ins. */
  footY: number;
  dispose: () => void;
}

/** The standing height (m) each model key is scaled to, whatever size it was modelled at. */
export const MODEL_HEIGHT_M: Readonly<Record<string, number>> = {
  sheep: 0.85,
  lamb: 0.55,
  chicken: 0.4,
  rooster: 0.5,
  songbird: 0.12,
  dove: 0.26,
};

const WOOL = rgb(0xe8e1cf);
const WOOL_SHADE = rgb(0xcfc7b3);
const SHEEP_DARK = rgb(0x3d352e);
const HEN = rgb(0xa9743e);
const HEN_DARK = rgb(0x7d5128);
const BEAK = rgb(0xd9a031);
const COMB = rgb(0xb3302a);

type Draw = (b: MeshBuilder) => void;

/** A part built in model space and moved so its pivot is its origin. */
function part(
  name: string,
  pivot: V3,
  seed: number,
  material: Material,
  draw: Draw,
  geometries: BufferGeometry[],
): ModelPart {
  const b = new MeshBuilder(seed, 0.05);
  b.within(-pivot[0], -pivot[1], -pivot[2], 0, () => draw(b));
  const geometry = b.build();
  geometries.push(geometry);
  return { name, pivot, draws: [{ geometry, material }] };
}

function finish(
  key: string,
  parts: ModelPart[],
  geometries: BufferGeometry[],
  material: Material,
): AnimalModel {
  return {
    key,
    parts,
    scale: 1,
    footY: 0,
    dispose: () => {
      for (const g of geometries) g.dispose();
      material.dispose();
    },
  };
}

function vertexMaterial(name: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ name, roughness: 1 });
}

/** A sheep: a woolly box, a dark face and legs, a stubby tail; about 0.85 m to the top of the head. */
export function buildSheep(): AnimalModel {
  const material = vertexMaterial('village_vertex');
  const g: BufferGeometry[] = [];
  const legs = [
    ['leg_fl', -0.2, 0.36],
    ['leg_fr', 0.2, 0.36],
    ['leg_bl', -0.2, -0.36],
    ['leg_br', 0.2, -0.36],
  ] as const;
  const parts: ModelPart[] = [
    part(
      'body',
      [0, 0.6, 0],
      1,
      material,
      (b) => {
        b.box(0, 0.36, 0, 0.62, 0.5, 0.95, WOOL, WOOL_SHADE);
        b.box(0, 0.3, 0.4, 0.5, 0.4, 0.2, WOOL);
      },
      g,
    ),
    part(
      'head',
      [0, 0.72, 0.46],
      2,
      material,
      (b) => {
        b.box(0, 0.6, 0.62, 0.22, 0.26, 0.32, SHEEP_DARK);
        b.box(-0.14, 0.74, 0.52, 0.1, 0.05, 0.12, SHEEP_DARK);
        b.box(0.14, 0.74, 0.52, 0.1, 0.05, 0.12, SHEEP_DARK);
        b.box(0, 0.8, 0.5, 0.2, 0.08, 0.14, WOOL);
      },
      g,
    ),
    ...legs.map(([name, x, z], i) =>
      part(
        name,
        [x, 0.38, z],
        3 + i,
        material,
        (b) => b.beam([x, 0.38, z], [x, 0, z], 0.1, SHEEP_DARK),
        g,
      ),
    ),
    part(
      'tail',
      [0, 0.62, -0.47],
      7,
      material,
      (b) => b.box(0, 0.5, -0.52, 0.12, 0.2, 0.1, WOOL),
      g,
    ),
  ];
  return finish('sheep', parts, g, material);
}

/** A hen: a brown barrel, a head with a red comb and an orange beak, trotting legs, a fan of tail; about 0.4 m. */
export function buildChicken(): AnimalModel {
  const material = vertexMaterial('village_vertex');
  const g: BufferGeometry[] = [];
  const legs = [
    ['leg_l', -0.04],
    ['leg_r', 0.04],
  ] as const;
  const wings = [
    ['wing_l', -1],
    ['wing_r', 1],
  ] as const;
  const parts: ModelPart[] = [
    part(
      'body',
      [0, 0.2, 0],
      11,
      material,
      (b) => b.box(0, 0.12, 0, 0.2, 0.2, 0.3, HEN, P.thatch),
      g,
    ),
    part(
      'head',
      [0, 0.3, 0.12],
      12,
      material,
      (b) => {
        b.box(0, 0.28, 0.16, 0.09, 0.14, 0.1, HEN);
        b.box(0, 0.34, 0.225, 0.03, 0.025, 0.05, BEAK);
        b.box(0, 0.41, 0.15, 0.02, 0.04, 0.06, COMB);
      },
      g,
    ),
    ...legs.map(([name, x], i) =>
      part(
        name,
        [x, 0.13, 0],
        13 + i,
        material,
        (b) => b.beam([x, 0.13, 0], [x, 0, 0.01], 0.025, BEAK),
        g,
      ),
    ),
    part(
      'tail',
      [0, 0.24, -0.13],
      15,
      material,
      (b) => b.box(0, 0.22, -0.19, 0.04, 0.16, 0.1, HEN_DARK),
      g,
    ),
    ...wings.map(([name, s], i) =>
      part(
        name,
        [s * 0.1, 0.24, 0],
        16 + i,
        material,
        (b) => b.box(s * 0.105, 0.14, 0, 0.03, 0.12, 0.2, HEN_DARK),
        g,
      ),
    ),
  ];
  return finish('chicken', parts, g, material);
}

/** The stand-ins by model key: the keys with no modelled file are drawn with these. */
export const PLACEHOLDER_MODELS: Readonly<Record<string, () => AnimalModel>> = {
  sheep: buildSheep,
  chicken: buildChicken,
};
