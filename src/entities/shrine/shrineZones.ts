// src/entities/shrine/shrineZones.ts — a faint ring on the ground at the edge of each shrine's zone
//
// A thin ribbon that follows the terrain, drawn once per zone. It stays faint, and brightens while the
// orb stands inside a zone whose energy it can take. The user builds the stone circle itself from props;
// this only shows how far the zone reaches.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Mesh,
  type Scene,
} from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { VISUAL } from '../../config/visualTuning';
import type { ShrineZone } from '../../gameplay/energyRegen/regen';
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';

const SEGMENTS = 128;
const LOOK = VISUAL.shrineZone;

export interface ShrineZones {
  meshes: Mesh[];
  /** Brightens the rings while `active` (the orb is in a zone it can use). */
  update: (elapsed: number, active: boolean) => void;
  dispose: () => void;
}

function ringGeometry(
  terrain: Pick<MapTerrainContext, 'getWorldY'>,
  zone: ShrineZone,
): BufferGeometry {
  const positions = new Float32Array((SEGMENTS + 1) * 2 * 3);
  const indices: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    for (let side = 0; side < 2; side++) {
      const r = zone.radiusM + (side === 0 ? -1 : 1) * (LOOK.ribbonWidthM / 2);
      const x = zone.x + cos * r;
      const z = zone.z + sin * r;
      const o = (i * 2 + side) * 3;
      positions[o] = x;
      positions[o + 1] = terrain.getWorldY(x, z) + LOOK.liftM;
      positions[o + 2] = z;
    }
    if (i < SEGMENTS) {
      const k = i * 2;
      indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

export function createShrineZones(
  scene: Scene,
  terrain: Pick<MapTerrainContext, 'getWorldY'>,
  zones: readonly ShrineZone[],
): ShrineZones {
  const material = new MeshBasicNodeMaterial({
    color: new Color(...LOOK.color),
    transparent: true,
    opacity: LOOK.baseOpacity,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const meshes = zones.map((zone) => {
    const mesh = new Mesh(ringGeometry(terrain, zone), material);
    mesh.renderOrder = 2;
    mesh.name = 'shrine-zone-ring';
    scene.add(mesh);
    return mesh;
  });
  let brightness = 0;
  return {
    meshes,
    update: (elapsed, active) => {
      const target = active ? 1 : 0;
      brightness += (target - brightness) * LOOK.brightenRate;
      const pulse = 1 + Math.sin(elapsed * LOOK.pulseSpeed) * LOOK.pulse * brightness;
      material.opacity =
        (LOOK.baseOpacity + (LOOK.activeOpacity - LOOK.baseOpacity) * brightness) * pulse;
    },
    dispose: () => {
      for (const mesh of meshes) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      material.dispose();
    },
  };
}
