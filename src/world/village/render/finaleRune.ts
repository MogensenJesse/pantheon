// src/world/village/render/finaleRune.ts — the player's rune hung in the sky above the temple: five glowing strokes
//
// One ribbon per place of power, drawn along its stroke as it lights (0 dark, 1 whole), in the guide line's colours.
// The whole rune turns to face the camera so it reads from wherever it is looked at.

import { BufferAttribute, BufferGeometry, Color, Group, Mesh, type Object3D } from 'three';
import { attribute, clamp, exp, float, mix, smoothstep, uniform, vec3 } from 'three/tsl';
import type { MeshBasicNodeMaterial } from 'three/webgpu';
import { FINALE_VISUAL } from '../../../config/visual/finale';
import { RUNE_STROKES } from '../../../config/visual/rune';
import { VISUAL } from '../../../config/visualTuning';
import { guideBreathFadeTsl } from '../../../entities/guideLine/guidePulseTsl';
import type { LandmarkKind } from '../../../map/MapTypes';
import {
  createAdditiveGlowMaterial,
  GLOW_MESH_RENDER_ORDER,
  uHdrBloomScale,
} from '../../../rendering/glowMaterial';

type TslNode = any;

const { HALF_WIDTH, HDR, HEAD_BOOST } = FINALE_VISUAL.RUNE;

export interface FinaleRune {
  /** Where the rune hangs (world) and how large it is (m). */
  place: (x: number, y: number, z: number, sizeM: number) => void;
  /** How far a place's stroke is drawn, 0..1. */
  setStroke: (kind: LandmarkKind, lit01: number) => void;
  /** The whole rune's brightness 0..1. */
  setGlow: (glow01: number) => void;
  /** Turns the rune to face a camera at this ground position; call every frame it is visible. */
  faceTowards: (x: number, z: number) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

export function createFinaleRune(parent: Object3D, kinds: readonly LandmarkKind[]): FinaleRune {
  const guide = VISUAL.guideLine;
  const uGlow = uniform(0);
  const uColorA = uniform(new Color(guide.emissiveHex));
  const uColorB = uniform(new Color(guide.colorBHex));

  const root = new Group();
  root.name = 'finaleRune';
  root.visible = false;
  parent.add(root);

  const lit = new Map<LandmarkKind, { uniform: ReturnType<typeof uniform>; mesh: Mesh }>();
  const geometries: BufferGeometry[] = [];
  const materials: MeshBasicNodeMaterial[] = [];

  for (const kind of kinds) {
    const [x0, y0, x1, y1] = RUNE_STROKES[kind];
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    // The ribbon's left edge is the stroke's normal; the unit square is scaled to the rune's size later.
    const nx = (-dy / len) * HALF_WIDTH;
    const ny = (dx / len) * HALF_WIDTH;
    const positions = new Float32Array([
      x0 - nx,
      y0 - ny,
      0,
      x0 + nx,
      y0 + ny,
      0,
      x1 - nx,
      y1 - ny,
      0,
      x1 + nx,
      y1 + ny,
      0,
    ]);
    const along = new Float32Array([0, 0, 1, 1]);
    const across = new Float32Array([-1, 1, -1, 1]);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('along', new BufferAttribute(along, 1));
    geometry.setAttribute('across', new BufferAttribute(across, 1));
    geometry.setIndex([0, 1, 2, 1, 3, 2]);

    const uLit = uniform(0);
    const a = attribute('along', 'float') as TslNode;
    const c = attribute('across', 'float') as TslNode;
    const r2 = c.mul(c);
    const core = exp(r2.mul(-14));
    const halo = exp(r2.mul(-2.6));
    // Drawn from the start up to `uLit`, with a bright head at the tip while it travels.
    // The drawn edge runs a little past the end at 1, so a whole stroke is lit to its tip.
    const edge = (uLit as TslNode).mul(1.06);
    const drawn = float(1).sub(smoothstep(edge.sub(0.06), edge.add(0.001), a));
    const head = exp(
      a
        .sub(uLit as TslNode)
        .mul(a.sub(uLit as TslNode))
        .mul(-260),
    ).mul(float(1).sub(smoothstep(float(0.96), float(1), uLit as TslNode)));

    const material = createAdditiveGlowMaterial();
    material.colorNode = mix(
      mix(uColorA as TslNode, uColorB as TslNode, a),
      vec3(1.15, 1.08, 0.95),
      core,
    )
      .mul(halo.add(core.mul(0.6)))
      .mul(drawn.add(head.mul(HEAD_BOOST)))
      .mul(clamp(uGlow as TslNode, 0, 1).mul(HDR))
      .mul(uHdrBloomScale)
      .mul(guideBreathFadeTsl(float(guide.breathSpeed), float(guide.breathAmount)));

    const mesh = new Mesh(geometry, material);
    mesh.name = `finaleRune_${kind}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = GLOW_MESH_RENDER_ORDER;
    root.add(mesh);
    lit.set(kind, { uniform: uLit, mesh });
    geometries.push(geometry);
    materials.push(material);
  }

  return {
    place: (x, y, z, sizeM) => {
      root.position.set(x, y, z);
      root.scale.setScalar(sizeM / 2);
    },
    setStroke: (kind, lit01) => {
      const stroke = lit.get(kind);
      if (stroke) stroke.uniform.value = lit01;
    },
    setGlow: (glow01) => {
      uGlow.value = glow01;
    },
    faceTowards: (x, z) => {
      root.rotation.y = Math.atan2(x - root.position.x, z - root.position.z);
    },
    setVisible: (visible) => {
      root.visible = visible;
    },
    dispose: () => {
      parent.remove(root);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
