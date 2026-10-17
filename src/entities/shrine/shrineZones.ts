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
import type { MapTerrainContext } from '../../world/MapTerrainBuilder';
import type { ShrineZone } from './regen';

const SEGMENTS = 128;
const RIBBON_WIDTH_M = 0.45;
const LIFT_M = 0.18;
const BASE_OPACITY = 0.2;
const ACTIVE_OPACITY = 0.55;
const PULSE = 0.12;
const PULSE_SPEED = 1.6;

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
      const r = zone.radiusM + (side === 0 ? -1 : 1) * (RIBBON_WIDTH_M / 2);
      const x = zone.x + cos * r;
      const z = zone.z + sin * r;
      const o = (i * 2 + side) * 3;
      positions[o] = x;
      positions[o + 1] = terrain.getWorldY(x, z) + LIFT_M;
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
    color: new Color(0.71, 0.63, 0.86),
    transparent: true,
    opacity: BASE_OPACITY,
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
      brightness += (target - brightness) * 0.08;
      const pulse = 1 + Math.sin(elapsed * PULSE_SPEED) * PULSE * brightness;
      material.opacity = (BASE_OPACITY + (ACTIVE_OPACITY - BASE_OPACITY) * brightness) * pulse;
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
