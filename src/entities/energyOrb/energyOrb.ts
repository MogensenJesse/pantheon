// src/entities/energyOrb/energyOrb.ts — residue orb instance (gameplay + mesh)

import { Mesh, type Scene, type SphereGeometry, Vector3 } from 'three';
import type { MeshBasicNodeMaterial } from 'three/webgpu';
import { PHASE0 } from '../../config/phase0';
import { bus } from '../../core/EventBus';
import { addEnergy } from '../../core/energy';
import { state } from '../../core/GameState';
import { GLOW_MESH_RENDER_ORDER } from '../../rendering/glowMaterial';
import { enableWaterReflectionLayer } from '../../rendering/layers/waterReflectionLayers';
import { orbCenterY } from '../orbFloat';

const { ABSORB_RADIUS_SQ, ENERGY_RADIUS: ORB_RADIUS } = PHASE0.ORB;

export interface EnergyOrb {
  mesh: Mesh;
  worldPos: Vector3;
  bobPhase: number;
  energyValue: number;
  absorbed: boolean;
  updateFloat: (terrainY: number, elapsed: number, surfaceNormalY?: number) => void;
  updatePulse: (scale: number) => void;
  checkAbsorption: (playerPos: Vector3) => void;
  dispose: () => void;
}

export interface OrbPlacement {
  x: number;
  z: number;
  energy?: number;
}

export function createEnergyOrb(
  scene: Scene,
  x: number,
  z: number,
  terrainY: number,
  bobPhase: number,
  energyValue: number,
  material: MeshBasicNodeMaterial,
  geometry: SphereGeometry,
  onAbsorb: (origin: Vector3, playerPos: Vector3) => void,
  surfaceNormalY = 1,
): EnergyOrb {
  const worldPos = new Vector3(x, orbCenterY(terrainY, ORB_RADIUS, 0, bobPhase, surfaceNormalY), z);
  let absorbed = false;

  const mesh = new Mesh(geometry, material);
  mesh.position.copy(worldPos);
  mesh.renderOrder = GLOW_MESH_RENDER_ORDER;
  enableWaterReflectionLayer(mesh);
  scene.add(mesh);

  return {
    mesh,
    worldPos,
    bobPhase,
    energyValue,
    get absorbed() {
      return absorbed;
    },
    updateFloat(terrainY: number, elapsed: number, surfaceNormalY = 1) {
      if (absorbed) return;
      const y = orbCenterY(terrainY, ORB_RADIUS, elapsed, bobPhase, surfaceNormalY);
      worldPos.y = y;
      mesh.position.y = y;
    },
    updatePulse(scale: number) {
      if (absorbed) return;
      mesh.scale.setScalar(scale);
    },
    checkAbsorption(playerPos: Vector3) {
      if (absorbed) return;
      const dx = playerPos.x - worldPos.x;
      const dz = playerPos.z - worldPos.z;
      const dy = playerPos.y - worldPos.y;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < ABSORB_RADIUS_SQ) {
        absorbed = true;
        mesh.visible = false;
        onAbsorb(worldPos, playerPos);
        state.orbsAbsorbed += 1;
        addEnergy(energyValue);
        bus.emit('orb:absorbed', {
          energy: energyValue,
          x: worldPos.x,
          y: worldPos.y,
          z: worldPos.z,
        });
      }
    },
    dispose() {
      scene.remove(mesh);
    },
  };
}

export function countVisibleOrbs(orbs: EnergyOrb[]): number {
  let n = 0;
  for (const o of orbs) {
    if (o.mesh.visible) n++;
  }
  return n;
}
